import type { AmazonMarketplace } from '@/lib/competitor-strategy-types'

const CANOPY_AMAZON_API_URL = 'https://rest.canopyapi.co/api/amazon/product'
const CANOPY_TIMEOUT_MS = 45_000
const PANGOL_AMAZON_API_URL = 'https://scrapeapi.pangolinfo.com/api/v1/scrape'
const PANGOL_TIMEOUT_MS = 120_000
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024

const SITE_CODES: Record<AmazonMarketplace, string> = {
  US: 'amz_us',
  CA: 'amz_ca',
  UK: 'amz_uk',
  DE: 'amz_de',
  FR: 'amz_fr',
  IT: 'amz_it',
  ES: 'amz_es',
  JP: 'amz_jp',
  AU: 'amz_au',
  MX: 'amz_mx',
  BR: 'amz_br',
}

export interface AmazonProductResult {
  asin: string
  marketplace: AmazonMarketplace
  title: string
  images: string[]
  provider: 'canopy' | 'pangol'
}

interface PangolResponse {
  code?: number | string
  message?: string | null
  data?: unknown
}

interface CanopyResponse {
  data?: {
    amazonProduct?: unknown
  }
}

export function normalizeAsin(value: string): string | null {
  const trimmed = value.trim().toUpperCase()
  if (/^[A-Z0-9]{10}$/.test(trimmed)) return trimmed

  try {
    const parsed = new URL(value.trim())
    const match = parsed.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)
    return match?.[1]?.toUpperCase() || null
  } catch {
    return null
  }
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function visit(value: unknown, callback: (record: Record<string, unknown>) => void): void {
  const parsed = parseMaybeJson(value)
  if (Array.isArray(parsed)) {
    parsed.forEach((item) => visit(item, callback))
    return
  }
  if (!parsed || typeof parsed !== 'object') return
  const record = parsed as Record<string, unknown>
  callback(record)
  Object.values(record).forEach((item) => visit(item, callback))
}

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const candidate = value.trim().replace(/&amp;/g, '&')
  if (!candidate) return null
  try {
    const parsed = new URL(candidate.startsWith('//') ? `https:${candidate}` : candidate)
    if (parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase()
    if (!host.endsWith('media-amazon.com') && !host.endsWith('ssl-images-amazon.com')) return null
    if (!parsed.pathname.includes('/images/I/')) return null
    if (/play-button-overlay|video/i.test(parsed.pathname)) return null
    parsed.pathname = parsed.pathname.replace(/\.(?:_?[A-Z]{1,8}[^.]*)_\.(jpe?g|png|webp)$/i, '.$1')
    parsed.search = ''
    return parsed.toString()
  } catch {
    return null
  }
}

function collectImageValues(value: unknown, output: string[]): void {
  const parsed = parseMaybeJson(value)
  if (typeof parsed === 'string') {
    const normalized = normalizeImageUrl(parsed)
    if (normalized && !output.includes(normalized)) output.push(normalized)
    return
  }
  if (Array.isArray(parsed)) {
    parsed.forEach((item) => collectImageValues(item, output))
    return
  }
  if (!parsed || typeof parsed !== 'object') return
  Object.values(parsed).forEach((item) => collectImageValues(item, output))
}

export function parseAmazonProductResponse(body: PangolResponse, asin: string, marketplace: AmazonMarketplace): AmazonProductResult {
  if (String(body.code) !== '0') {
    throw new Error(body.message?.trim() || `Amazon 商品读取失败（code ${String(body.code ?? 'unknown')}）`)
  }

  let title = ''
  const preferredImages: string[] = []
  const fallbackImages: string[] = []

  visit(body.data, (record) => {
    if (!title && typeof record.title === 'string' && record.title.trim()) title = record.title.trim()
    for (const key of ['images', 'image', 'galleryImages', 'galleryThumbnails', 'mainImage']) {
      if (!(key in record)) continue
      collectImageValues(record[key], key === 'galleryThumbnails' ? fallbackImages : preferredImages)
    }
  })

  const images = [...preferredImages, ...fallbackImages.filter((url) => !preferredImages.includes(url))].slice(0, 9)
  if (!images.length) {
    throw new Error('Amazon 商品接口没有返回可分析的商品图片，请改用上传竞品图片。')
  }

  return {
    asin,
    marketplace,
    title: title || `Amazon 商品 ${asin}`,
    images,
    provider: 'pangol',
  }
}

export function parseCanopyAmazonProductResponse(body: CanopyResponse, asin: string, marketplace: AmazonMarketplace): AmazonProductResult {
  const product = body.data?.amazonProduct
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error('Canopy 没有返回商品数据。')
  }

  const record = product as Record<string, unknown>
  const images: string[] = []
  collectImageValues(record.mainImageUrl, images)
  collectImageValues(record.imageUrls, images)
  if (!images.length) throw new Error('Canopy 没有返回可分析的商品图片。')

  const responseAsin = typeof record.asin === 'string' ? normalizeAsin(record.asin) : null
  return {
    asin: responseAsin || asin,
    marketplace,
    title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : `Amazon 商品 ${asin}`,
    images: images.slice(0, 9),
    provider: 'canopy',
  }
}

async function readBoundedJson<T>(response: Response, providerName: string): Promise<T> {
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > MAX_RESPONSE_BYTES) throw new Error(`${providerName} 返回数据过大，已停止处理。`)
  const rawBody = await response.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_RESPONSE_BYTES) throw new Error(`${providerName} 返回数据过大，已停止处理。`)

  try {
    return JSON.parse(rawBody) as T
  } catch {
    throw new Error(`${providerName} 返回了无法识别的数据（HTTP ${response.status}）。`)
  }
}

async function fetchAmazonProductFromCanopy(asin: string, marketplace: AmazonMarketplace, apiKey: string): Promise<AmazonProductResult> {
  const url = new URL(CANOPY_AMAZON_API_URL)
  url.searchParams.set('asin', asin)
  url.searchParams.set('domain', marketplace)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CANOPY_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { 'API-KEY': apiKey },
      cache: 'no-store',
      signal: controller.signal,
    })
    const body = await readBoundedJson<CanopyResponse>(response, 'Canopy')
    if (!response.ok) {
      if (response.status === 400) throw new Error('Canopy 请求参数无效。')
      if (response.status === 401) throw new Error('Canopy API key 无效或未授权。')
      if (response.status === 402) throw new Error('Canopy API 额度不足。')
      throw new Error(`Canopy 商品读取失败（HTTP ${response.status}）。`)
    }
    return parseCanopyAmazonProductResponse(body, asin, marketplace)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Canopy 商品读取超过 45 秒。')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchAmazonProductFromPangol(asin: string, marketplace: AmazonMarketplace, token: string): Promise<AmazonProductResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PANGOL_TIMEOUT_MS)
  try {
    const response = await fetch(PANGOL_AMAZON_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parserName: 'amzProductDetail',
        site: SITE_CODES[marketplace],
        content: asin,
        format: 'json',
        pageCount: 1,
      }),
      cache: 'no-store',
      signal: controller.signal,
    })

    const body = await readBoundedJson<PangolResponse>(response, 'Pangol')
    if (!response.ok) throw new Error(body.message?.trim() || `Pangol 商品读取失败（HTTP ${response.status}）。`)
    return parseAmazonProductResponse(body, asin, marketplace)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Pangol 商品读取超过 120 秒。')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误'
}

export async function fetchAmazonProduct(asinInput: string, marketplace: AmazonMarketplace): Promise<AmazonProductResult> {
  const asin = normalizeAsin(asinInput)
  if (!asin) throw new Error('请输入 10 位有效 ASIN，或粘贴 Amazon 商品链接。')

  const canopyApiKey = process.env.CANOPY_API_KEY?.trim()
  const pangolToken = process.env.PANGOL_SCRAPEAPI_API_KEY?.trim()
  const failures: string[] = []

  if (canopyApiKey) {
    try {
      return await fetchAmazonProductFromCanopy(asin, marketplace, canopyApiKey)
    } catch (error) {
      failures.push(`Canopy：${getErrorMessage(error)}`)
      console.warn('[amazon-product] Canopy failed, falling back to Pangol', {
        asin,
        marketplace,
        message: getErrorMessage(error),
      })
    }
  } else {
    failures.push('Canopy：未配置 CANOPY_API_KEY')
  }

  if (pangolToken) {
    try {
      return await fetchAmazonProductFromPangol(asin, marketplace, pangolToken)
    } catch (error) {
      failures.push(`Pangol：${getErrorMessage(error)}`)
    }
  } else {
    failures.push('Pangol：未配置 PANGOL_SCRAPEAPI_API_KEY')
  }

  throw new Error(`Amazon 商品读取失败，请稍后重试或改用上传图片。${failures.join('；')}`)
}
