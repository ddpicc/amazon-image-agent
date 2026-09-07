const JUSTONE_API_PATH = '/api/1688/get-item-detail/v1'
const JUSTONE_API_TIMEOUT_MS = 120_000
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024

const TITLE_KEYS = [
  'title',
  'subject',
  'productTitle',
  'itemTitle',
  'goodsName',
  'productName',
  '商品标题',
  '商品名称',
]

const IMAGE_KEY_PATTERN = /image|img|pic|photo|picture|gallery|thumbnail|thumb|主图|详情图|sku/i

export interface Product1688Result {
  offerId: string
  title: string
  images: string[]
  sourceUrl: string
}

interface JustOneResponse {
  code?: number | string
  message?: string | null
  data?: unknown
  requestId?: string
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} environment variable is not set`)
  }
  return value
}

export function extract1688OfferId(sourceUrl: string): string | null {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(sourceUrl.trim())
  } catch {
    return null
  }

  const hostname = parsedUrl.hostname.toLowerCase()
  const is1688Host = hostname === '1688.com' || hostname.endsWith('.1688.com')
  if (!is1688Host || !['http:', 'https:'].includes(parsedUrl.protocol)) {
    return null
  }

  const queryOfferId = parsedUrl.searchParams.get('offerId') || parsedUrl.searchParams.get('offerid')
  if (queryOfferId && /^\d+$/.test(queryOfferId)) {
    return queryOfferId
  }

  const pathMatch = parsedUrl.pathname.match(/(?:^|\/)offer\/(\d+)(?:\.html)?(?:\/)?$/i)
  return pathMatch?.[1] || null
}

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const candidate = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed
  try {
    const parsed = new URL(candidate)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function looksLikeImageUrl(value: string): boolean {
  const normalized = normalizeUrl(value)
  if (!normalized) return false

  try {
    const parsed = new URL(normalized)
    return /\.(?:jpe?g|png|webp|gif|avif)(?:$|\?)/i.test(parsed.pathname + parsed.search)
      || /image|img|pic|photo|picture|alicdn|1688|taobao|tbcdn/i.test(parsed.hostname + parsed.pathname)
  } catch {
    return false
  }
}

function collectImageUrls(value: unknown, imageContext: boolean, output: string[]): void {
  if (typeof value === 'string') {
    if (imageContext || looksLikeImageUrl(value)) {
      const normalized = normalizeUrl(value)
      if (normalized && !output.includes(normalized)) output.push(normalized)
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectImageUrls(item, imageContext, output))
    return
  }

  if (!value || typeof value !== 'object') return

  Object.entries(value).forEach(([key, nestedValue]) => {
    collectImageUrls(nestedValue, imageContext || IMAGE_KEY_PATTERN.test(key), output)
  })
}

function normalizeFieldName(value: string): string {
  return value.replace(/[_-]/g, '').toLowerCase()
}

function findTitle(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null

  if (Array.isArray(value)) {
    for (const item of value) {
      const title = findTitle(item)
      if (title) return title
    }
    return null
  }

  const entries = Object.entries(value)
  const normalizedTitleKeys = new Set(TITLE_KEYS.map(normalizeFieldName))
  for (const key of TITLE_KEYS) {
    const match = entries.find(([entryKey, entryValue]) => normalizedTitleKeys.has(normalizeFieldName(entryKey)) && normalizeFieldName(entryKey) === normalizeFieldName(key) && typeof entryValue === 'string' && entryValue.trim())
    if (match) return String(match[1]).trim()
  }

  for (const [, nestedValue] of entries) {
    const title = findTitle(nestedValue)
    if (title) return title
  }

  return null
}

function getProviderErrorMessage(code: number | string | undefined, message: string | null | undefined): string {
  const normalizedCode = String(code ?? '')
  const knownMessages: Record<string, string> = {
    '100': 'JustOneAPI Token 无效或已失效',
    '101': 'JustOneAPI Token 无效或未激活',
    '301': '1688 商品采集失败，请稍后重试',
    '302': 'JustOneAPI 请求频率已达到限制，请稍后重试',
    '303': 'JustOneAPI 今日配额已用完',
    '400': '1688 商品查询参数无效',
    '404': '未找到对应的 1688 商品',
    '600': '当前 JustOneAPI Token 没有该接口权限',
    '601': 'JustOneAPI 账户余额不足',
    '602': 'JustOneAPI Token 的消费额度已达到上限',
  }
  return message?.trim() || knownMessages[normalizedCode] || `JustOneAPI 返回错误（code ${normalizedCode || 'unknown'}）`
}

function parseProviderResponse(body: JustOneResponse, offerId: string, sourceUrl: string): Product1688Result {
  if (String(body.code) !== '0') {
    throw new Error(getProviderErrorMessage(body.code, body.message))
  }

  const images: string[] = []
  collectImageUrls(body.data, false, images)
  const title = findTitle(body.data) || `1688 商品 ${offerId}`

  if (!images.length) {
    throw new Error('接口调用成功，但暂未识别到商品图片，请检查 JustOneAPI 返回数据。')
  }

  return {
    offerId,
    title,
    images,
    sourceUrl,
  }
}

export async function fetch1688Product(sourceUrl: string): Promise<Product1688Result> {
  const offerId = extract1688OfferId(sourceUrl)
  if (!offerId) {
    throw new Error('请输入有效的 1688 商品链接，例如 https://detail.1688.com/offer/123456789.html')
  }

  const token = getRequiredEnv('JUSTONE_API_TOKEN')
  const baseUrl = (process.env.JUSTONE_API_BASE_URL || 'https://api.justoneapi.com').replace(/\/$/, '')
  const endpoint = new URL(`${baseUrl}${JUSTONE_API_PATH}`)
  endpoint.searchParams.set('token', token)
  endpoint.searchParams.set('itemId', offerId)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), JUSTONE_API_TIMEOUT_MS)

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    })
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new Error('JustOneAPI 返回数据过大，已停止处理')
    }

    const rawBody = await response.text()
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new Error('JustOneAPI 返回数据过大，已停止处理')
    }

    let body: JustOneResponse
    try {
      body = JSON.parse(rawBody) as JustOneResponse
    } catch {
      throw new Error(`JustOneAPI 返回了无法识别的数据（HTTP ${response.status}）`)
    }

    if (!response.ok) {
      throw new Error(getProviderErrorMessage(body.code, body.message) || `JustOneAPI 请求失败（HTTP ${response.status}）`)
    }

    return parseProviderResponse(body, offerId, sourceUrl.trim())
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('1688 商品查询超过 120 秒未完成，请稍后重试')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
