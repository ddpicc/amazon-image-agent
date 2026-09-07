import { createHash } from 'crypto'
import { getComplianceImageRoleLabel, getCompliancePlatformLabel, getComplianceRuleBasis } from '@/lib/compliance-check'
import type { ComplianceCheckItem, ComplianceImageRole, CompliancePlatform, ComplianceStatus } from '@/lib/compliance-check'
import { analyzeBackgroundColor } from '@/lib/compliance-background'
import { requestTextJsonCompletion } from '@/lib/text-model'
import { searchDesignPatentCandidates } from '@/lib/design-patent-search'
import type {
  ComplianceConfidence,
  ComplianceMarket,
  ComplianceModuleResult,
  ComplianceRegion,
  ComplianceRiskLevel,
  ComplianceScanResult,
  ComplianceVisualFinding,
  VisualFindingCategory,
} from '@/lib/compliance-scan-types'
import type { DesignPatentSearchResult, DesignSearchProfile } from '@/lib/design-patent-search'

const MARKET_LABELS: Record<ComplianceMarket, string> = { US: '美国', AU: '澳大利亚' }
const BACKGROUND_PASS_WHITE_RATIO = 0.95
const BACKGROUND_REVIEW_WHITE_RATIO = 0.75
const BACKGROUND_PASS_UNIFORMITY = 0.8
const BACKGROUND_REVIEW_UNIFORMITY = 0.55
const VISUAL_CATEGORIES = new Set<VisualFindingCategory>([
  'text', 'logo', 'watermark', 'character', 'artwork', 'celebrity', 'sports', 'stock', 'other',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringArray(value: unknown, max = 8) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()).slice(0, max)
    : []
}

function normalizeRisk(value: unknown): ComplianceRiskLevel {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'unknown' ? value : 'unknown'
}

function normalizeConfidence(value: unknown): ComplianceConfidence {
  return value === 'high' || value === 'medium' || value === 'low' || value === 'unknown' ? value : 'unknown'
}

function normalizeStatus(value: unknown): ComplianceStatus {
  return value === 'pass' || value === 'warning' || value === 'fail' || value === 'unknown' ? value : 'unknown'
}

function normalizeRegion(value: unknown): ComplianceRegion | null {
  const record = asRecord(value)
  if (!record) return null
  const values = ['x', 'y', 'width', 'height'].map((key) => Number(record[key]))
  if (values.some((number) => !Number.isFinite(number))) return null
  const [x, y, width, height] = values
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0, Math.min(1, width)),
    height: Math.max(0, Math.min(1, height)),
  }
}

function normalizeVisualFindings(value: unknown): ComplianceVisualFinding[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 16).flatMap((item, index) => {
    const record = asRecord(item)
    const category = record ? stringValue(record.category) as VisualFindingCategory | null : null
    if (!record || !category || !VISUAL_CATEGORIES.has(category)) return []
    const imageIndex = Number(record.imageIndex)
    return [{
      key: stringValue(record.key) || 'visual-' + (index + 1),
      category,
      imageIndex: Number.isInteger(imageIndex) && imageIndex >= 0 ? imageIndex : 0,
      detectedText: stringValue(record.detectedText),
      description: stringValue(record.description) || '检测到图片中的视觉元素。',
      region: normalizeRegion(record.region),
      riskLevel: normalizeRisk(record.riskLevel),
      confidence: normalizeConfidence(record.confidence),
      evidence: stringValue(record.evidence) || '模型无法提供足够的可见证据。',
      recommendation: stringValue(record.recommendation) || '请结合原图、授权材料和目标市场规则进行人工复核。',
    }]
  })
}

function normalizeItems(value: unknown, max = 8): ComplianceCheckItem[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, max).flatMap((item, index) => {
    const record = asRecord(item)
    if (!record) return []
    return [{
      key: stringValue(record.key) || 'scan-check-' + (index + 1),
      title: stringValue(record.title) || '图片检查项 ' + (index + 1),
      status: normalizeStatus(record.status),
      evidence: stringValue(record.evidence) || '模型无法提供足够的可见证据。',
      recommendation: stringValue(record.recommendation) || '请结合原图和平台后台规则进行人工复核。',
    }]
  })
}

function normalizeProfile(value: unknown): DesignSearchProfile | null {
  const record = asRecord(value)
  if (!record) return null
  const imageQuality = stringValue(record.imageQuality)
  return {
    productType: stringValue(record.productType) || 'unknown product',
    designSummary: stringValue(record.designSummary) || '无法从图片形成稳定的外观摘要。',
    dominantFeatures: stringArray(record.dominantFeatures),
    searchTerms: stringArray(record.searchTerms),
    classificationHints: stringArray(record.classificationHints, 5),
    imageQuality: imageQuality === 'good' || imageQuality === 'limited' ? imageQuality : 'unknown',
  }
}

function confidenceFromFindings(findings: ComplianceVisualFinding[]): ComplianceConfidence {
  if (findings.some((finding) => finding.confidence === 'high')) return 'high'
  if (findings.some((finding) => finding.confidence === 'medium')) return 'medium'
  if (findings.some((finding) => finding.confidence === 'low')) return 'low'
  return 'unknown'
}

function riskFromFindings(findings: ComplianceVisualFinding[]): ComplianceRiskLevel {
  if (findings.some((finding) => finding.riskLevel === 'high')) return 'high'
  if (findings.some((finding) => finding.riskLevel === 'medium')) return 'medium'
  if (findings.some((finding) => finding.riskLevel === 'low')) return 'low'
  return 'unknown'
}

function statusFromRisk(riskLevel: ComplianceRiskLevel, hasData: boolean): ComplianceStatus {
  if (riskLevel === 'high') return 'fail'
  if (riskLevel === 'medium') return 'warning'
  if (riskLevel === 'unknown' || !hasData) return 'unknown'
  return 'pass'
}

function findingsToItems(findings: ComplianceVisualFinding[]): ComplianceCheckItem[] {
  return findings.map((finding) => ({
    key: finding.key,
    title: (finding.category === 'text' ? '文字' : finding.category === 'logo' ? 'Logo' : '视觉元素') + ' · 图片 ' + (finding.imageIndex + 1),
    status: statusFromRisk(finding.riskLevel, true),
    evidence: finding.evidence,
    recommendation: finding.recommendation,
  }))
}

function buildTechnicalItems(images: Array<{ technical: { width: number | null; height: number | null; mimeType: string; bytes: number } }>): ComplianceCheckItem[] {
  return images.map((image, index) => {
    const { width, height, mimeType, bytes } = image.technical
    const hasDimensions = Boolean(width && height)
    const longestSide = width && height ? Math.max(width, height) : 0
    const status: ComplianceStatus = !hasDimensions ? 'unknown' : longestSide < 500 ? 'fail' : longestSide < 1000 ? 'warning' : 'pass'
    return {
      key: 'technical-' + (index + 1),
      title: '图片 ' + (index + 1) + ' · 文件与分辨率',
      status,
      evidence: mimeType + '，' + (hasDimensions ? width + ' × ' + height + ' px' : '像素尺寸未知') + '，' + (bytes / 1024 / 1024).toFixed(2) + ' MB。',
      recommendation: status === 'pass' ? '系统读取到的图片尺寸满足本次基础检查。' : '建议使用清晰原图，并在上传前确认像素尺寸和文件格式。',
    }
  })
}

function buildBackgroundItems(input: {
  platform: CompliancePlatform
  images: Array<{ role: ComplianceImageRole }>
}, backgrounds: Array<Awaited<ReturnType<typeof analyzeBackgroundColor>>>) {
  return input.images.flatMap((image, index) => {
    if (input.platform !== 'amazon' || image.role !== 'main') return []

    const background = backgrounds[index]
    if (!background.rgb || background.edgeNearWhiteRatio === null || background.edgeUniformity === null) {
      return [{
        key: 'background-' + (index + 1),
        title: '图片 ' + (index + 1) + ' · 背景颜色',
        status: 'unknown' as ComplianceStatus,
        evidence: '服务端未能从图片边缘读取足够的有效像素，无法可靠估算背景颜色。',
        recommendation: '请结合原图人工复核背景，必要时重新导出为清晰的 JPG、PNG 或 WEBP。',
      }]
    }

    const isWhiteEnough = background.edgeNearWhiteRatio >= BACKGROUND_PASS_WHITE_RATIO && background.edgeUniformity >= BACKGROUND_PASS_UNIFORMITY
    const needsReview = background.edgeNearWhiteRatio >= BACKGROUND_REVIEW_WHITE_RATIO && background.edgeUniformity >= BACKGROUND_REVIEW_UNIFORMITY
    const status: ComplianceStatus = isWhiteEnough ? 'pass' : needsReview ? 'warning' : 'fail'
    const [red, green, blue] = background.rgb
    return [{
      key: 'background-' + (index + 1),
      title: '图片 ' + (index + 1) + ' · 背景颜色',
      status,
      evidence: `边缘采样估算 RGB(${red}, ${green}, ${blue})，接近纯白比例 ${(background.edgeNearWhiteRatio * 100).toFixed(1)}%，背景均匀度 ${(background.edgeUniformity * 100).toFixed(1)}%。`,
      recommendation: status === 'pass'
        ? `服务端像素检测显示边缘背景接近均匀纯白（通过阈值：接近纯白比例 ≥ ${(BACKGROUND_PASS_WHITE_RATIO * 100).toFixed(0)}%，均匀度 ≥ ${(BACKGROUND_PASS_UNIFORMITY * 100).toFixed(0)}%）；仍需结合主体边缘和阴影人工复核。`
        : status === 'warning'
          ? `接近纯白比例或背景均匀度未达到通过阈值（${(BACKGROUND_PASS_WHITE_RATIO * 100).toFixed(0)}% / ${(BACKGROUND_PASS_UNIFORMITY * 100).toFixed(0)}%），建议人工复核阴影、灰边和其他背景色。`
          : 'Amazon 主图要求纯白背景，建议去除灰边、阴影和其他背景色后重新上传。',
    }]
  })
}

function deriveOverallStatus(modules: ComplianceModuleResult[]): ComplianceStatus {
  if (modules.some((module) => module.status === 'fail')) return 'fail'
  if (modules.some((module) => module.status === 'warning')) return 'warning'
  if (modules.some((module) => module.status === 'unknown')) return 'unknown'
  return 'pass'
}

function deriveOverallRisk(modules: ComplianceModuleResult[]): ComplianceRiskLevel {
  if (modules.some((module) => module.riskLevel === 'high')) return 'high'
  if (modules.some((module) => module.riskLevel === 'medium')) return 'medium'
  if (modules.some((module) => module.riskLevel === 'unknown')) return 'unknown'
  return 'low'
}

function deriveConfidence(modules: ComplianceModuleResult[]): ComplianceConfidence {
  if (modules.some((module) => module.confidence === 'unknown')) return 'unknown'
  if (modules.some((module) => module.confidence === 'low')) return 'low'
  if (modules.some((module) => module.confidence === 'medium')) return 'medium'
  return 'high'
}

function buildPrompt(input: {
  platform: CompliancePlatform
  targetMarket: ComplianceMarket
  images: Array<{ role: ComplianceImageRole; technical: { width: number | null; height: number | null; mimeType: string; bytes: number } }>
}) {
  const rules = input.images.flatMap((image, index) => [
    '图片 ' + (index + 1) + '（' + getComplianceImageRoleLabel(image.role) + '）基础平台依据：',
    ...getComplianceRuleBasis(input.platform, image.role).map((rule) => '- ' + rule),
  ])
  const technicalInfo = input.images.map((image, index) => {
    const dimensions = image.technical.width && image.technical.height
      ? image.technical.width + ' × ' + image.technical.height + ' px'
      : '像素尺寸未知'
    return '- 图片 ' + (index + 1) + '：' + getComplianceImageRoleLabel(image.role) + '，' + dimensions + '，' + image.technical.mimeType
  }).join('\n')

  return [
    '你是跨境电商图片合规和视觉 IP 风险初筛顾问。只根据用户上传的图片进行分析，不要求也不要臆测品牌名、标题、关键词或产品描述。',
    '',
    '平台：' + getCompliancePlatformLabel(input.platform),
    '目标市场：' + MARKET_LABELS[input.targetMarket],
    '图片数量：' + input.images.length,
    '',
    '图片技术信息：',
    technicalInfo,
    '',
    '平台图片依据：',
    rules.join('\n'),
    '',
    '判断要求：',
    '- 只判断图片中实际可见的内容；看不清时使用 unknown。',
    '- 图片中的文字、Logo、角色、图案和商品外观都可以识别，但不要声称已经完成法律上的商标、版权或专利侵权认定。',
    '- 对文字和 Logo，记录可读文字、疑似视觉标识、位置和需要核验的风险；普通通用文字不要自动当成侵权。',
    '- 对版权元素，重点识别疑似角色、明星、球队/赛事标志、插画、艺术图案和疑似图库素材。',
    '- 对外观专利，只描述产品的可见外形、轮廓、比例、结构和装饰特征，生成后续检索所需的英文产品类型、关键词和分类提示。',
    '- 不把辅图的场景、说明文字或版式元素自动判为平台违规；只有遮挡、误导或与实际商品不一致时才提高风险。',
    '- 图片相似度排序分不是侵权概率；最终结果必须标记为风险初筛。',
    '',
    '严格输出 JSON，不要输出 Markdown：',
    '{',
    '  \"summary\": \"80-160 字中文总结\",',
    '  \"platformItems\": [{\"key\":\"background|subject|overlay|accuracy|quality\",\"title\":\"检查项\",\"status\":\"pass|warning|fail|unknown\",\"evidence\":\"可见证据\",\"recommendation\":\"整改或复核建议\"}],',
    '  \"visualFindings\": [{\"key\":\"唯一键\",\"category\":\"text|logo|watermark|character|artwork|celebrity|sports|stock|other\",\"imageIndex\":0,\"detectedText\":\"可读文字或 null\",\"description\":\"视觉内容描述\",\"region\":{\"x\":0,\"y\":0,\"width\":0,\"height\":0},\"riskLevel\":\"low|medium|high|unknown\",\"confidence\":\"high|medium|low|unknown\",\"evidence\":\"可见证据\",\"recommendation\":\"建议\"}],',
    '  \"patentSearchProfile\": {\"productType\":\"英文产品类型\",\"designSummary\":\"外观摘要\",\"dominantFeatures\":[\"外观特征\"],\"searchTerms\":[\"英文检索词\"],\"classificationHints\":[\"Locarno 或相关分类提示\"],\"imageQuality\":\"good|limited|unknown\"}',
    '}',
    '最多输出 8 个 platformItems 和 16 个 visualFindings。',
  ].join('\n')
}

export function sha256Hex(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function scanImageCompliance(input: {
  platform: CompliancePlatform
  targetMarket: ComplianceMarket
  images: Array<{
    buffer: Buffer
    role: ComplianceImageRole
    technical: { width: number | null; height: number | null; mimeType: string; bytes: number }
  }>
  operationId?: string
}): Promise<ComplianceScanResult> {
  const backgroundAnalyses = await Promise.all(input.images.map((image) => analyzeBackgroundColor(image.buffer)))
  const content: any[] = [{ type: 'text', text: buildPrompt(input) }]
  input.images.forEach((image) => {
    content.push({
      type: 'image_url',
      image_url: { url: 'data:' + image.technical.mimeType + ';base64,' + image.buffer.toString('base64') },
    })
  })

  const responseText = await requestTextJsonCompletion(content, 3200, {
    operationId: input.operationId,
    sourcePage: 'compliance-scan',
    entryPoint: '/api/compliance/scan',
  })

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(responseText) as Record<string, unknown>
  } catch {
    throw new Error('AI 返回的图片体检结果格式无效，请稍后重试')
  }

  const visualFindings = normalizeVisualFindings(parsed.visualFindings)
  const profile = normalizeProfile(parsed.patentSearchProfile)
  const technicalItems = buildTechnicalItems(input.images)
  const aiPlatformItems = normalizeItems(parsed.platformItems).filter((item) => !/background|背景/i.test(item.key + ' ' + item.title))
  const platformItems = [...technicalItems, ...buildBackgroundItems(input, backgroundAnalyses), ...aiPlatformItems]
  const platformStatus: ComplianceStatus = platformItems.some((item) => item.status === 'fail')
    ? 'fail'
    : platformItems.some((item) => item.status === 'warning')
      ? 'warning'
      : platformItems.some((item) => item.status === 'unknown') ? 'unknown' : 'pass'
  const platformModule: ComplianceModuleResult = {
    key: 'platform',
    title: '平台图片规范',
    status: platformStatus,
    riskLevel: platformStatus === 'fail' ? 'high' : platformStatus === 'warning' ? 'medium' : platformStatus === 'unknown' ? 'unknown' : 'low',
    confidence: platformStatus === 'unknown' ? 'low' : 'medium',
    summary: '已根据所选平台和图片角色检查基础图片规范。',
    items: platformItems,
    findings: [],
    candidates: [],
    sourceCoverage: [getCompliancePlatformLabel(input.platform) + ' 图片角色规则'],
    searchLinks: [],
    messages: [],
  }

  const textLogoFindings = visualFindings.filter((finding) => finding.category === 'text' || finding.category === 'logo' || finding.category === 'watermark')
  const textLogoModule: ComplianceModuleResult = {
    key: 'textLogo',
    title: '图片文字与 Logo',
    status: textLogoFindings.length ? statusFromRisk(riskFromFindings(textLogoFindings), true) : 'pass',
    riskLevel: textLogoFindings.length ? riskFromFindings(textLogoFindings) : 'low',
    confidence: textLogoFindings.length ? confidenceFromFindings(textLogoFindings) : 'medium',
    summary: textLogoFindings.length ? '已识别图片中的文字、Logo 或水印，请核验使用权和平台展示要求。' : '当前图片中暂未识别到需要重点复核的文字、Logo 或水印。',
    items: findingsToItems(textLogoFindings),
    findings: textLogoFindings,
    candidates: [],
    sourceCoverage: ['图片视觉识别'],
    searchLinks: [],
    messages: [],
  }

  const copyrightFindings = visualFindings.filter((finding) => ['character', 'artwork', 'celebrity', 'sports', 'stock'].includes(finding.category))
  const copyrightModule: ComplianceModuleResult = {
    key: 'copyright',
    title: '图片版权与素材',
    status: copyrightFindings.length ? statusFromRisk(riskFromFindings(copyrightFindings), true) : 'pass',
    riskLevel: copyrightFindings.length ? riskFromFindings(copyrightFindings) : 'low',
    confidence: copyrightFindings.length ? confidenceFromFindings(copyrightFindings) : 'medium',
    summary: copyrightFindings.length ? '已识别出可能需要授权或来源证明的视觉素材。' : '当前图片中暂未识别到明显的角色、艺术作品或疑似图库素材。',
    items: findingsToItems(copyrightFindings),
    findings: copyrightFindings,
    candidates: [],
    sourceCoverage: ['图片视觉识别'],
    searchLinks: [],
    messages: [],
  }

  let patentSearch: DesignPatentSearchResult = {
    candidates: [],
    sourceCoverage: ['未执行外部专利检索'],
    searchLinks: [] as Array<{ source: string; label: string; url: string }>,
    messages: ['本次外观设计专利检索未完成，无法从图片形成足够稳定的检索画像。'],
    complete: false,
  }
  if (profile) {
    patentSearch = await searchDesignPatentCandidates({ market: input.targetMarket, profile })
  }
  const patentSearchCompleted = Boolean(profile && patentSearch.complete)
  const hasPatentCandidates = patentSearch.candidates.length > 0
  const patentModule: ComplianceModuleResult = {
    key: 'designPatent',
    title: '外观设计专利相似性',
    status: hasPatentCandidates ? 'warning' : patentSearchCompleted ? 'pass' : 'unknown',
    riskLevel: hasPatentCandidates ? 'medium' : patentSearchCompleted ? 'low' : 'unknown',
    confidence: patentSearchCompleted ? 'medium' : 'low',
    summary: hasPatentCandidates
      ? '发现 ' + patentSearch.candidates.length + ' 条需要人工比对的外观设计候选。'
      : patentSearchCompleted
        ? '本次公开检索未发现相似专利。'
        : '本次外观设计专利检索未完成，当前无法形成结论。',
    items: patentSearch.candidates.slice(0, 8).map((candidate) => ({
      key: 'patent-' + candidate.jurisdiction + '-' + candidate.identifier,
      title: candidate.jurisdiction + ' · ' + candidate.identifier,
      status: 'warning' as ComplianceStatus,
      evidence: candidate.title + (candidate.holder ? '，权利人：' + candidate.holder : '') + '。匹配依据：文本/分类候选。'
        + (candidate.images.length ? '已返回 ' + candidate.images.length + ' 张官方附图供比对。' : '该候选未返回附图。'),
      recommendation: '打开来源附图与上传图片逐视图比对整体外观，核验申请日、法律状态和授权材料。',
    })),
    findings: [],
    candidates: patentSearch.candidates,
    sourceCoverage: patentSearch.sourceCoverage,
    searchLinks: patentSearch.searchLinks,
    messages: patentSearch.messages,
  }

  const modules = [platformModule, textLogoModule, patentModule, copyrightModule]
  const sourceCoverage = Array.from(new Set(modules.flatMap((module) => module.sourceCoverage)))
  return {
    platform: input.platform,
    platformLabel: getCompliancePlatformLabel(input.platform),
    targetMarket: input.targetMarket,
    targetMarketLabel: MARKET_LABELS[input.targetMarket],
    images: input.images.map((image, index) => ({ index, role: image.role, technical: image.technical, background: backgroundAnalyses[index] })),
    overallStatus: deriveOverallStatus(modules),
    overallRiskLevel: deriveOverallRisk(modules),
    confidence: deriveConfidence(modules),
    summary: stringValue(parsed.summary) || '已完成图片合规与视觉 IP 风险初筛，请优先处理高风险或需要复核的项目。',
    modules: { platform: platformModule, textLogo: textLogoModule, designPatent: patentModule, copyright: copyrightModule },
    patentSearchProfile: profile,
    sourceCoverage,
    limitation: '本结果只基于上传图片、公开检索结果和可见证据进行初筛，不构成商标、版权或专利侵权的法律意见。相似度排序不等于侵权概率；请在发布前核验授权材料、专利附图、申请日和目标市场法律状态。',
  }
}
