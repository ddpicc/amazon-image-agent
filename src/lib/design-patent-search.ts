import type { ComplianceMarket } from '@/lib/compliance-scan-types'

export type DesignPatentSearchSource = 'pangol-wipo'
export type DesignPatentMatchBasis = 'text-classification' | 'manual-source'

export interface DesignSearchProfile {
  productType: string
  designSummary: string
  dominantFeatures: string[]
  searchTerms: string[]
  classificationHints: string[]
  imageQuality: 'good' | 'limited' | 'unknown'
}

export interface DesignPatentCandidate {
  jurisdiction: string
  source: DesignPatentSearchSource
  identifier: string
  title: string
  holder: string | null
  filingDate: string | null
  priorityDate: string | null
  status: string | null
  matchBasis: DesignPatentMatchBasis
  similarityScore: number | null
  matchedFeatures: string[]
  images: string[]
  sourceUrl: string
  officialSearchUrl: string
}

export interface DesignPatentSearchResult {
  candidates: DesignPatentCandidate[]
  sourceCoverage: string[]
  searchLinks: Array<{ source: string; label: string; url: string }>
  messages: string[]
  complete: boolean
}

const WIPO_TRO_API_URL = 'https://scrapeapi.pangolinfo.com/api/v3/wipo'
const WIPO_GLOBAL_DESIGN_DB_URL = 'https://www.wipo.int/designdb/hague/en/'
const DESIGNVIEW_URL = 'https://www.designview.org/'
const AUSTRALIAN_DESIGN_SEARCH_URL = 'https://search.ipaustralia.gov.au/designs/'
const USPTO_SEARCH_URL = 'https://www.uspto.gov/patents/search/patent-public-search'

// WIPO 数据按来源国组织：美国走本国库 USID；澳大利亚没有独立国家库，
// 走海牙国际注册库并按指定国 AU 过滤。
const WIPO_MARKET_SOURCES: Record<ComplianceMarket, { source: string; ds: string; officialSearchUrl: string; officialLabel: string }> = {
  US: { source: 'USID', ds: 'US', officialSearchUrl: USPTO_SEARCH_URL, officialLabel: 'USPTO Patent Public Search' },
  AU: { source: 'HAGUE', ds: 'AU', officialSearchUrl: AUSTRALIAN_DESIGN_SEARCH_URL, officialLabel: 'IP Australia 设计检索' },
}

const WIPO_SOURCE_JURISDICTIONS: Record<string, string> = {
  USID: 'US',
  CNID: 'CN',
  JPID: 'JP',
  EMID: 'EM',
}

const MAX_CANDIDATES = 10
const MAX_IMAGES_PER_CANDIDATE = 6
const WIPO_REQUEST_TIMEOUT_MS = 45_000

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringList(value: unknown, max = 8) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()).slice(0, max)
    : []
}

function toDatePart(value: unknown) {
  const text = stringValue(value)
  return text ? text.slice(0, 10) : null
}

function normalizeWipoStatus(value: unknown) {
  const status = stringValue(value)
  if (!status) return null
  if (status === 'ACT') return '有效注册'
  if (status === 'PEND') return '待生效 / 审查中'
  if (status === 'DEL') return '已失效 / 停用'
  return status
}

function normalizeWipoHit(record: Record<string, unknown>, market: ComplianceMarket): DesignPatentCandidate | null {
  const identifier = stringValue(record.IRN) || stringValue(record.ID)
  if (!identifier) return null

  const detail = asRecord(asRecord(record.DETAIL_DATA)?.structured)
  const jurisdiction = WIPO_SOURCE_JURISDICTIONS[stringValue(record.SOURCE) || '']
    || (stringList(record.DS, 1)[0] ?? market)

  const images = Array.isArray(record.IMG_DATA)
    ? record.IMG_DATA.slice(0, MAX_IMAGES_PER_CANDIDATE).flatMap((image) => {
        const imageRecord = asRecord(image)
        return imageRecord && stringValue(imageRecord.url) ? [stringValue(imageRecord.url) as string] : []
      })
    : []

  return {
    jurisdiction,
    source: 'pangol-wipo',
    identifier,
    title: stringList(record.PROD_EN, 1)[0] || stringList(record.PROD, 1)[0] || (detail ? stringValue(detail.indication_of_products) : null) || 'WIPO 外观设计候选',
    holder: stringList(record.HOL, 1)[0] || (detail ? stringValue(detail.name_and_address_of_the_holders) : null),
    filingDate: toDatePart(record.RD) || (detail ? toDatePart(detail.date_of_the_national_registration) : null),
    priorityDate: detail ? toDatePart(detail.data_relating_to_priority_claim_under_the_paris_convention) : null,
    status: normalizeWipoStatus(record.STATUS),
    matchBasis: 'text-classification',
    similarityScore: null,
    matchedFeatures: [],
    images,
    sourceUrl: stringValue(record.DETAIL_URL) || WIPO_GLOBAL_DESIGN_DB_URL,
    officialSearchUrl: WIPO_MARKET_SOURCES[market].officialSearchUrl,
  }
}

function buildProductQuery(profile: DesignSearchProfile) {
  return Array.from(new Set([
    profile.productType,
    ...profile.searchTerms,
  ].map((item) => item.trim()).filter(Boolean))).slice(0, 5).join(' ')
}

function buildLocarnoFilter(profile: DesignSearchProfile) {
  for (const hint of profile.classificationHints) {
    const match = hint.match(/\b(\d{1,2}-\d{2})\b/)
    if (match) return match[1]
  }
  return ''
}

export async function searchDesignPatentCandidates(input: {
  market: ComplianceMarket
  profile: DesignSearchProfile
}): Promise<DesignPatentSearchResult> {
  const marketConfig = WIPO_MARKET_SOURCES[input.market]
  const result: DesignPatentSearchResult = {
    candidates: [],
    sourceCoverage: [],
    searchLinks: [
      { source: 'wipo', label: 'WIPO 海牙全球外观设计数据库', url: WIPO_GLOBAL_DESIGN_DB_URL },
      { source: 'designview', label: 'DesignView 跨国图片设计检索', url: DESIGNVIEW_URL },
      { source: marketConfig.source, label: marketConfig.officialLabel, url: marketConfig.officialSearchUrl },
    ],
    messages: [],
    complete: false,
  }

  const apiKey = process.env.PANGOL_SCRAPEAPI_API_KEY
  if (!apiKey) {
    result.messages.push('本次外观设计专利检索未完成，当前无法形成结论。')
    result.sourceCoverage.push('外观专利：公开检索未配置，仅提供官方人工检索入口')
    return result
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WIPO_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(WIPO_TRO_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        irn: '',
        ds: marketConfig.ds,
        source: marketConfig.source,
        from: 0,
        num: MAX_CANDIDATES,
        status: '',
        ed: '',
        hol: '',
        id: '',
        id_search: '',
        lcs: buildLocarnoFilter(input.profile),
        prod: buildProductQuery(input.profile),
        rd: '',
      }),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const payload = asRecord(await response.json())
    const payloadData = asRecord(payload?.data)
    const nestedPayloadData = asRecord(payloadData?.data)
    const hits = Array.isArray(nestedPayloadData?.hits)
      ? nestedPayloadData.hits
      : Array.isArray(payloadData?.hits)
        ? payloadData.hits
        : Array.isArray(payload?.hits)
          ? payload.hits
          : []
    result.candidates = hits
      .slice(0, MAX_CANDIDATES)
      .flatMap((hit) => {
        const record = asRecord(hit)
        return record ? [normalizeWipoHit(record, input.market)] : []
      })
      .filter((candidate): candidate is DesignPatentCandidate => Boolean(candidate))
      .filter((candidate, index, all) => all.findIndex((item) => item.identifier.toLowerCase() === candidate.identifier.toLowerCase()) === index)

    result.sourceCoverage.push(`外观专利：公开数据库关键词/分类候选 ${result.candidates.length} 条`)
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? `检索请求超过 ${WIPO_REQUEST_TIMEOUT_MS / 1000} 秒，已超时。`
      : '检索服务暂时不可用，请稍后重试。'
    result.messages.push(`本次外观设计专利检索未完成，${message}`)
    result.sourceCoverage.push('外观专利：公开检索未完成')
  } finally {
    clearTimeout(timeout)
  }

  result.complete = result.messages.length === 0
  return result
}
