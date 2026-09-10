import sharp from 'sharp'
import { requestTextJsonCompletion } from '@/lib/text-model'
import type {
  AmazonMarketplace,
  AestheticDimension,
  CompetitorImageAnalysis,
  CompetitorImageRole,
  CompetitorStrategyResult,
  InformationDensity,
  OwnEvidenceGap,
  ProductImageSourceMode,
  ReferenceableElement,
  RepeatedSellingPoint,
  StrategyConfidence,
  StrategyImagePlan,
  StrategyPriority,
} from '@/lib/competitor-strategy-types'

const ROLES = new Set<CompetitorImageRole>(['main-visual', 'size', 'pain-point', 'comparison', 'scene', 'detail', 'trust-proof', 'other'])
const DENSITIES = new Set<InformationDensity>(['low', 'medium', 'high'])
const PRIORITIES = new Set<StrategyPriority>(['high', 'medium', 'low'])
const CONFIDENCES = new Set<StrategyConfidence>(['high', 'medium', 'low'])
const AESTHETIC_DIMENSIONS = new Set<AestheticDimension['dimension']>(['layout', 'color', 'copy', 'visual-impact', 'consistency'])
const REFERENCE_ELEMENT_TYPES = new Set<ReferenceableElement['elementType']>(['layout', 'color', 'copy', 'composition', 'visual-style'])

export interface StrategyImagePayload {
  buffer: Buffer
  mimeType: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asStrings(value: unknown, max = 8): string[] {
  return Array.isArray(value)
    ? value.map((item) => asString(item)).filter(Boolean).slice(0, max)
    : []
}

function asInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) ? parsed : fallback
}

function asScore(value: unknown, fallback = 60): number {
  return Math.min(100, Math.max(0, asInteger(value, fallback)))
}

function normalizeRole(value: unknown): CompetitorImageRole {
  return ROLES.has(value as CompetitorImageRole) ? value as CompetitorImageRole : 'other'
}

function normalizeDensity(value: unknown): InformationDensity {
  return DENSITIES.has(value as InformationDensity) ? value as InformationDensity : 'medium'
}

function normalizePriority(value: unknown): StrategyPriority {
  return PRIORITIES.has(value as StrategyPriority) ? value as StrategyPriority : 'medium'
}

function normalizeConfidence(value: unknown): StrategyConfidence {
  return CONFIDENCES.has(value as StrategyConfidence) ? value as StrategyConfidence : 'medium'
}

function normalizeImageAnalyses(value: unknown, imageCount: number): CompetitorImageAnalysis[] {
  const rows = Array.isArray(value) ? value : []
  const byIndex = new Map<number, CompetitorImageAnalysis>()
  rows.forEach((row, rowIndex) => {
    const record = asRecord(row)
    const imageIndex = Math.min(imageCount - 1, Math.max(0, asInteger(record.imageIndex, rowIndex)))
    const secondaryRoles = Array.isArray(record.secondaryRoles)
      ? record.secondaryRoles.map(normalizeRole).filter((role) => role !== 'other').slice(0, 3)
      : []
    byIndex.set(imageIndex, {
      imageIndex,
      primaryRole: normalizeRole(record.primaryRole),
      secondaryRoles,
      salesTask: asString(record.salesTask, '需要结合原图人工确认这张图承担的销售任务。'),
      visibleEvidence: asStrings(record.visibleEvidence, 6),
      keyClaims: asStrings(record.keyClaims, 5),
      informationDensity: normalizeDensity(record.informationDensity),
      sequencePurpose: asString(record.sequencePurpose, '作为图组中的补充信息。'),
      confidence: normalizeConfidence(record.confidence),
    })
  })
  return Array.from({ length: imageCount }, (_, imageIndex) => byIndex.get(imageIndex) || {
    imageIndex,
    primaryRole: imageIndex === 0 ? 'main-visual' : 'other',
    secondaryRoles: [],
    salesTask: '模型未完整返回这张图的销售任务，需要人工复核。',
    visibleEvidence: [],
    keyClaims: [],
    informationDensity: 'medium',
    sequencePurpose: '图序作用未能可靠识别。',
    confidence: 'low',
  })
}

function normalizeRepeatedSellingPoints(value: unknown, imageCount: number): RepeatedSellingPoint[] {
  return (Array.isArray(value) ? value : []).slice(0, 8).map((row) => {
    const record = asRecord(row)
    const imageIndexes = Array.isArray(record.imageIndexes)
      ? Array.from(new Set(record.imageIndexes.map((item) => asInteger(item, -1)).filter((item) => item >= 0 && item < imageCount)))
      : []
    return {
      claim: asString(record.claim, '未命名卖点'),
      imageIndexes,
      evidence: asString(record.evidence, '需要结合图片人工复核。'),
      frequency: Math.max(imageIndexes.length, asInteger(record.frequency, imageIndexes.length || 1)),
    }
  })
}

function normalizeEvidenceGaps(value: unknown): OwnEvidenceGap[] {
  return (Array.isArray(value) ? value : []).slice(0, 8).map((row) => {
    const record = asRecord(row)
    return {
      proofNeeded: asString(record.proofNeeded, '需要补充的视觉证明'),
      competitorEvidence: asString(record.competitorEvidence, '竞品图中有相关表达。'),
      ownGap: asString(record.ownGap, '未提供足够的我方商品信息，需人工核对。'),
      priority: normalizePriority(record.priority),
      recommendedImage: asString(record.recommendedImage, '用真实产品证据补充一张对应图片。'),
    }
  })
}

function normalizeImagePlan(value: unknown): StrategyImagePlan[] {
  return (Array.isArray(value) ? value : []).slice(0, 9).map((row, index) => {
    const record = asRecord(row)
    return {
      position: Math.max(1, asInteger(record.position, index + 1)),
      role: normalizeRole(record.role),
      title: asString(record.title, `图片 ${index + 1}`),
      salesTask: asString(record.salesTask, '回答一个明确的购买问题。'),
      proofToShow: asString(record.proofToShow, '使用可核验的商品事实作为证据。'),
      differentiation: asString(record.differentiation, '保留销售逻辑，但使用我方真实证据和不同表达。'),
    }
  }).sort((a, b) => a.position - b.position)
}

function normalizeAestheticDimensions(value: unknown): AestheticDimension[] {
  const rows = Array.isArray(value) ? value : []
  const byDimension = new Map<AestheticDimension['dimension'], AestheticDimension>()
  rows.forEach((row) => {
    const record = asRecord(row)
    const dimension = AESTHETIC_DIMENSIONS.has(record.dimension as AestheticDimension['dimension'])
      ? record.dimension as AestheticDimension['dimension']
      : 'visual-impact'
    byDimension.set(dimension, {
      dimension,
      score: asScore(record.score),
      strengths: asString(record.strengths, '暂未识别到足够明确的优势。'),
      weaknesses: asString(record.weaknesses, '需要结合移动端展示进一步复核。'),
      referenceSuggestion: asString(record.referenceSuggestion, '可以参考其信息组织方式。'),
      differentiation: asString(record.differentiation, '替换为我方商品事实、品牌语言和视觉识别。'),
    })
  })
  return Array.from(AESTHETIC_DIMENSIONS).map((dimension) => byDimension.get(dimension) || {
    dimension,
    score: 60,
    strengths: '模型未完整返回该维度，需要结合原图复核。',
    weaknesses: '暂时没有足够信息形成可靠判断。',
    referenceSuggestion: '确认原图细节后再决定是否参考。',
    differentiation: '使用我方商品事实与品牌识别重新表达。',
  })
}

function normalizeReferenceableElements(value: unknown, imageCount: number): ReferenceableElement[] {
  return (Array.isArray(value) ? value : []).slice(0, 8).map((row) => {
    const record = asRecord(row)
    const elementType = REFERENCE_ELEMENT_TYPES.has(record.elementType as ReferenceableElement['elementType'])
      ? record.elementType as ReferenceableElement['elementType']
      : 'visual-style'
    const sourceImageIndexes = Array.isArray(record.sourceImageIndexes)
      ? Array.from(new Set(record.sourceImageIndexes.map((item) => asInteger(item, -1)).filter((item) => item >= 0 && item < imageCount)))
      : []
    return {
      elementType,
      sourceImageIndexes,
      whyItWorks: asString(record.whyItWorks, '这项表达有助于快速传递信息。'),
      referenceMethod: asString(record.referenceMethod, '参考结构和表达原则，不必逐像素照搬。'),
      differentiationMove: asString(record.differentiationMove, '结合我方产品证据重新组织内容。'),
    }
  })
}

interface StrategySourceInput {
  mode: ProductImageSourceMode
  asin: string | null
  marketplace: AmazonMarketplace
  productTitle: string | null
  images: StrategyImagePayload[]
  imageUrls: string[]
}

function buildPrompt(input: {
  competitor: StrategySourceInput
  own: StrategySourceInput | null
}) {
  return [
    '你是资深的电商商品页图片策略与视觉创意顾问。既要判断每张图片在卖什么、承担什么购买决策任务，也要评价整套图的审美完成度，并指出优秀的版式、配色、构图和文案如何被参考。',
    '',
    `竞品来源：${input.competitor.mode === 'asin' ? `Amazon ${input.competitor.marketplace} 站 ASIN ${input.competitor.asin}` : '用户上传图片'}`,
    `竞品商品标题：${input.competitor.productTitle || '未提供'}`,
    `竞品图片数量：${input.competitor.images.length}`,
    `我方来源：${input.own ? (input.own.mode === 'asin' ? `Amazon ${input.own.marketplace} 站 ASIN ${input.own.asin}` : '用户上传图片') : '未提供'}`,
    `我方商品标题：${input.own?.productTitle || '未提供'}`,
    `我方图片数量：${input.own?.images.length || 0}`,
    '',
    '图片排列规则：先给出全部竞品图片，顺序就是商品页图序；如果有我方图片，会在竞品图片之后按原顺序给出。imageIndex 一律使用从 0 开始的竞品图片索引。',
    '',
    '分析要求：',
    '- 每张竞品图只能根据可见证据归类，primaryRole 选 main-visual、size、pain-point、comparison、scene、detail、trust-proof、other 之一。',
    '- 区分“画面元素”和“销售任务”：例如有人物不等于只是场景图，它可能在证明适用人群、尺寸比例或使用便利。',
    '- 卖点重复必须能指出出现在哪几张图，不能只凭标题或常识补全。',
    '- 分析图序如何从吸引点击、解释问题、提供证明到降低顾虑；信息密度评价要考虑移动端能否快速读懂。',
    '- 对比我方时，只能使用我方图片和接口读取到的商品标题。没有我方商品时写“待核对”，不要虚构缺失。',
    '- 给出 0-100 的审美综合分，并分别评价视觉冲击、版式、配色、文案和整套一致性。分数是基于当前图片的专业判断，不是转化率实测。',
    '- 如果竞品确实优秀，可以明确建议参考它的版式、配色、构图、视觉风格和文案表达；但每项都必须同时给出 referenceMethod 和 differentiationMove，说明参考什么、我方如何形成差异。',
    '- 可以借鉴文案结构和表达方式，但不要原样复制竞品品牌名、商标、独有口号或没有我方事实支撑的性能结论。',
    '- 差异化不是为了刻意不同，而是让参考后的方案更适合我方商品事实、受众、品牌识别和证据强项。',
    '- 看不清、无法确认或疑似夸大时降低 confidence，并在 limitations 中说明。',
    '',
    '严格输出一个 JSON 对象，不要 Markdown，不要额外文本：',
    '{',
    '  "executiveSummary":"先说竞品主要在卖什么，以及最大策略机会，80-160字",',
    '  "coreSalesStory":"用一句话概括整套图的销售叙事",',
    '  "aestheticAnalysis":{"overallScore":0,"summary":"审美完成度总结","dimensions":[{"dimension":"layout|color|copy|visual-impact|consistency","score":0,"strengths":"优势","weaknesses":"不足","referenceSuggestion":"值得怎样参考","differentiation":"参考后如何体现我方差异"}],"referenceableElements":[{"elementType":"layout|color|copy|composition|visual-style","sourceImageIndexes":[0],"whyItWorks":"为什么有效","referenceMethod":"具体参考方式","differentiationMove":"我方必须做出的差异"}]},',
    '  "sequenceAnalysis":{"summary":"图序总结","openingTask":"前段任务","middleTask":"中段任务","closingTask":"后段任务","densityAssessment":"信息密度结论","flowStrength":"strong|mixed|weak","missedOpportunities":["竞品图序自身遗漏"]},',
    '  "imageAnalyses":[{"imageIndex":0,"primaryRole":"main-visual|size|pain-point|comparison|scene|detail|trust-proof|other","secondaryRoles":[],"salesTask":"这张图要推动什么购买判断","visibleEvidence":["画面中的直接证据"],"keyClaims":["这张图传达的卖点"],"informationDensity":"low|medium|high","sequencePurpose":"放在这个位置的作用","confidence":"high|medium|low"}],',
    '  "repeatedSellingPoints":[{"claim":"反复强调的卖点","imageIndexes":[0,2],"evidence":"重复方式","frequency":2}],',
    '  "ownEvidenceGaps":[{"proofNeeded":"我方需要证明什么","competitorEvidence":"竞品如何证明","ownGap":"我方现有证据或待核对点","priority":"high|medium|low","recommendedImage":"建议补什么图和直接证据"}],',
    '  "differentiatedStrategy":{"positioning":"整套差异化定位","principles":["策略原则"],"imagePlan":[{"position":1,"role":"main-visual|size|pain-point|comparison|scene|detail|trust-proof|other","title":"图片任务标题","salesTask":"要回答的购买问题","proofToShow":"必须拍到或标出的真实证据","differentiation":"与竞品的表达差异"}],"referenceBoundaries":["可以参考但需要改造或核实的边界"]},',
    '  "limitations":["本次判断边界"]',
    '}',
    `imageAnalyses 必须正好 ${input.competitor.images.length} 项；aestheticAnalysis.dimensions 应覆盖 5 个维度；imagePlan 建议 6-8 张，按 position 排序。`,
  ].join('\n')
}

export async function prepareStrategyImage(buffer: Buffer): Promise<StrategyImagePayload> {
  const normalized = await sharp(buffer, { failOn: 'warning' })
    .rotate()
    .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer()
  return { buffer: normalized, mimeType: 'image/jpeg' }
}

export async function analyzeCompetitorImageStrategy(input: {
  competitor: StrategySourceInput
  own: StrategySourceInput | null
  operationId?: string
}): Promise<CompetitorStrategyResult> {
  const prompt = buildPrompt({ competitor: input.competitor, own: input.own })
  const content: any[] = [{ type: 'text', text: prompt }]
  input.competitor.images.forEach((image, index) => {
    content.push({ type: 'text', text: `竞品图片 ${index + 1}（imageIndex=${index}）` })
    content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.buffer.toString('base64')}` } })
  })
  input.own?.images.forEach((image, index) => {
    content.push({ type: 'text', text: `我方商品图片 ${index + 1}` })
    content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.buffer.toString('base64')}` } })
  })

  const responseText = await requestTextJsonCompletion(content, 5200, {
    operationId: input.operationId,
    sourcePage: 'competitor-strategy',
    entryPoint: '/api/competitor-strategy/analyze',
    phase: 'visual-sales-strategy',
  })
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(responseText) as Record<string, unknown>
  } catch {
    throw new Error('AI 返回的竞品图片策略格式无效，请稍后重试。')
  }

  const sequence = asRecord(parsed.sequenceAnalysis)
  const aesthetic = asRecord(parsed.aestheticAnalysis)
  const strategy = asRecord(parsed.differentiatedStrategy)
  const flowStrength = ['strong', 'mixed', 'weak'].includes(String(sequence.flowStrength))
    ? sequence.flowStrength as 'strong' | 'mixed' | 'weak'
    : 'mixed'

  return {
    source: {
      competitor: {
        mode: input.competitor.mode,
        asin: input.competitor.asin,
        marketplace: input.competitor.marketplace,
        productTitle: input.competitor.productTitle,
        imageCount: input.competitor.images.length,
        imageUrls: input.competitor.imageUrls,
      },
      own: input.own ? {
        mode: input.own.mode,
        asin: input.own.asin,
        marketplace: input.own.marketplace,
        productTitle: input.own.productTitle,
        imageCount: input.own.images.length,
        imageUrls: input.own.imageUrls,
      } : null,
    },
    executiveSummary: asString(parsed.executiveSummary, '已完成逐图销售任务与整套图序分析。'),
    coreSalesStory: asString(parsed.coreSalesStory, '这套图片通过多个视觉证据逐步降低购买顾虑。'),
    aestheticAnalysis: {
      overallScore: asScore(aesthetic.overallScore),
      summary: asString(aesthetic.summary, '审美评分基于当前图片的视觉完成度，不代表实际转化率。'),
      dimensions: normalizeAestheticDimensions(aesthetic.dimensions),
      referenceableElements: normalizeReferenceableElements(aesthetic.referenceableElements, input.competitor.images.length),
    },
    sequenceAnalysis: {
      summary: asString(sequence.summary, '请结合下方逐图结果查看图序逻辑。'),
      openingTask: asString(sequence.openingTask, '建立商品认知与点击理由。'),
      middleTask: asString(sequence.middleTask, '展开卖点并提供证据。'),
      closingTask: asString(sequence.closingTask, '补充细节并降低购买顾虑。'),
      densityAssessment: asString(sequence.densityAssessment, '信息密度需要结合移动端预览复核。'),
      flowStrength,
      missedOpportunities: asStrings(sequence.missedOpportunities, 6),
    },
    imageAnalyses: normalizeImageAnalyses(parsed.imageAnalyses, input.competitor.images.length),
    repeatedSellingPoints: normalizeRepeatedSellingPoints(parsed.repeatedSellingPoints, input.competitor.images.length),
    ownEvidenceGaps: normalizeEvidenceGaps(parsed.ownEvidenceGaps),
    differentiatedStrategy: {
      positioning: asString(strategy.positioning, '参考竞品中有效的视觉表达，并用我方商品证据和品牌识别形成差异。'),
      principles: asStrings(strategy.principles, 6),
      imagePlan: normalizeImagePlan(strategy.imagePlan),
      referenceBoundaries: asStrings(strategy.referenceBoundaries, 8),
    },
    limitations: asStrings(parsed.limitations, 8),
  }
}
