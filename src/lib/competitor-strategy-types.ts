export type AmazonMarketplace = 'US' | 'CA' | 'UK' | 'DE' | 'FR' | 'IT' | 'ES' | 'JP' | 'AU' | 'MX' | 'BR'

export type CompetitorImageRole =
  | 'main-visual'
  | 'size'
  | 'pain-point'
  | 'comparison'
  | 'scene'
  | 'detail'
  | 'trust-proof'
  | 'other'

export type InformationDensity = 'low' | 'medium' | 'high'
export type StrategyPriority = 'high' | 'medium' | 'low'
export type StrategyConfidence = 'high' | 'medium' | 'low'
export type ProductImageSourceMode = 'asin' | 'upload'

export interface ProductImageSourceSummary {
  mode: ProductImageSourceMode
  asin: string | null
  marketplace: AmazonMarketplace
  productTitle: string | null
  imageCount: number
  imageUrls: string[]
}

export interface CompetitorImageAnalysis {
  imageIndex: number
  primaryRole: CompetitorImageRole
  secondaryRoles: CompetitorImageRole[]
  salesTask: string
  visibleEvidence: string[]
  keyClaims: string[]
  informationDensity: InformationDensity
  sequencePurpose: string
  confidence: StrategyConfidence
}

export interface RepeatedSellingPoint {
  claim: string
  imageIndexes: number[]
  evidence: string
  frequency: number
}

export interface OwnEvidenceGap {
  proofNeeded: string
  competitorEvidence: string
  ownGap: string
  priority: StrategyPriority
  recommendedImage: string
}

export interface StrategyImagePlan {
  position: number
  role: CompetitorImageRole
  title: string
  salesTask: string
  proofToShow: string
  differentiation: string
}

export interface AestheticDimension {
  dimension: 'layout' | 'color' | 'copy' | 'visual-impact' | 'consistency'
  score: number
  strengths: string
  weaknesses: string
  referenceSuggestion: string
  differentiation: string
}

export interface ReferenceableElement {
  elementType: 'layout' | 'color' | 'copy' | 'composition' | 'visual-style'
  sourceImageIndexes: number[]
  whyItWorks: string
  referenceMethod: string
  differentiationMove: string
}

export interface CompetitorStrategyResult {
  source: {
    competitor: ProductImageSourceSummary
    own: ProductImageSourceSummary | null
  }
  executiveSummary: string
  coreSalesStory: string
  aestheticAnalysis: {
    overallScore: number
    summary: string
    dimensions: AestheticDimension[]
    referenceableElements: ReferenceableElement[]
  }
  sequenceAnalysis: {
    summary: string
    openingTask: string
    middleTask: string
    closingTask: string
    densityAssessment: string
    flowStrength: 'strong' | 'mixed' | 'weak'
    missedOpportunities: string[]
  }
  imageAnalyses: CompetitorImageAnalysis[]
  repeatedSellingPoints: RepeatedSellingPoint[]
  ownEvidenceGaps: OwnEvidenceGap[]
  differentiatedStrategy: {
    positioning: string
    principles: string[]
    imagePlan: StrategyImagePlan[]
    referenceBoundaries: string[]
  }
  limitations: string[]
}

export const MARKETPLACE_LABELS: Record<AmazonMarketplace, string> = {
  US: '美国',
  CA: '加拿大',
  UK: '英国',
  DE: '德国',
  FR: '法国',
  IT: '意大利',
  ES: '西班牙',
  JP: '日本',
  AU: '澳大利亚',
  MX: '墨西哥',
  BR: '巴西',
}

export const IMAGE_ROLE_LABELS: Record<CompetitorImageRole, string> = {
  'main-visual': '主视觉',
  size: '尺寸认知',
  'pain-point': '痛点教育',
  comparison: '对比证明',
  scene: '使用场景',
  detail: '细节证明',
  'trust-proof': '信任证明',
  other: '补充信息',
}
