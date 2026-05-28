export type AmazonBranch = 'amazon-set' | 'aplus'
export type AmazonPromptKey =
  | 'main-white'
  | 'size'
  | 'detail'
  | 'infographic-1'
  | 'infographic-2'
  | 'lifestyle-1'
  | 'lifestyle-2'
export type APlusPromptKey =
  | 'aplus-main'
  | 'aplus-hero'
  | 'aplus-transform'
  | 'aplus-grid'
  | 'aplus-lifestyle'
  | 'aplus-feature'
  | 'aplus-detail'
export type PromptKey = AmazonPromptKey | APlusPromptKey
export type RecommendedPlanType =
  | 'main-white'
  | 'lifestyle'
  | 'infographic'
  | 'detail'
  | 'size'
  | 'aplus-main'
  | 'aplus-hero'
  | 'aplus-transform'
  | 'aplus-grid'
  | 'aplus-lifestyle'
  | 'aplus-feature'
  | 'aplus-detail'

export interface RecommendedImagePlanItem {
  type: RecommendedPlanType
  index: number
  title: string
  goal: string
  notes: string[]
}

export interface ReferenceImageAdvice {
  needMoreReferences: boolean
  reason: string
  recommendedShots: string[]
}

export interface ReferenceImageObservation {
  imageIndex: number
  observations: string[]
}

export interface BasicAnalysisResult {
  productSummary: string
  sellingPoints: string[]
  referenceImageObservations: ReferenceImageObservation[]
  referenceImageSummary: string
  amazonImageGuidelines: string[]
  complianceChecklist: string[]
  imageContentSuggestions: string[]
  visualStyleRecommendations: string[]
  visualSystemGuidance: string[]
  promptingPrinciples: string[]
  referenceImageAdvice: ReferenceImageAdvice
  canGeneratePrompts: boolean
}

export interface PromptGenerationResult {
  status: 'idle' | 'completed'
  recommendedImagePlan: RecommendedImagePlanItem[]
  suggestedPrompts: Record<string, string>
}

export interface APlusPromptGenerationResult extends PromptGenerationResult {
  imageSpec: {
    size: '1024x640'
    aspectRatio: '8:5'
  }
}

export interface PromptResults {
  amazonSet: PromptGenerationResult | null
  aplus: APlusPromptGenerationResult | null
}

export interface StoredReferenceImage {
  url: string
  key: string
  mimeType: string
  bytes: number
  name: string
}

export interface AmazonResumeState {
  analysisId: string
  productName: string
  description: string
  category: string
  targetAudience: string
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED'
  createdAt: string
  errorMessage?: string | null
  referenceImages: StoredReferenceImage[]
  basicAnalysisResult: BasicAnalysisResult | null
  promptResults: PromptResults
  currentBranch?: AmazonBranch | null
}

interface LegacyPromptGenerationResult {
  recommendedImagePlan: RecommendedImagePlanItem[]
  suggestedPrompts: Record<string, string>
}

function isLegacyPromptGenerationResult(value: unknown): value is LegacyPromptGenerationResult {
  return Boolean(
    value
      && typeof value === 'object'
      && 'recommendedImagePlan' in value
      && Array.isArray((value as LegacyPromptGenerationResult).recommendedImagePlan)
      && 'suggestedPrompts' in value
      && typeof (value as LegacyPromptGenerationResult).suggestedPrompts === 'object',
  )
}

function isPromptResults(value: unknown): value is PromptResults {
  return Boolean(
    value
      && typeof value === 'object'
      && 'amazonSet' in value
      && 'aplus' in value,
  )
}

export function normalizePromptResults(value: unknown): PromptResults {
  if (isPromptResults(value)) {
    return value
  }

  if (isLegacyPromptGenerationResult(value)) {
    return {
      amazonSet: {
        status: 'completed',
        recommendedImagePlan: value.recommendedImagePlan,
        suggestedPrompts: value.suggestedPrompts,
      },
      aplus: null,
    }
  }

  return {
    amazonSet: null,
    aplus: null,
  }
}

export function isPromptGenerationComplete(result: PromptGenerationResult | null | undefined) {
  return Boolean(result && result.recommendedImagePlan.length > 0 && Object.keys(result.suggestedPrompts).length > 0)
}

export function getPromptResultForBranch(promptResults: PromptResults, branch: AmazonBranch) {
  return branch === 'amazon-set' ? promptResults.amazonSet : promptResults.aplus
}
