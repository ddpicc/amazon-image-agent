export interface RecommendedImagePlanItem {
  type: 'main-white' | 'lifestyle' | 'infographic' | 'detail' | 'size'
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
  recommendedImagePlan: RecommendedImagePlanItem[]
  suggestedPrompts: Record<string, string>
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
  promptGenerationResult: PromptGenerationResult | null
}

export function isPromptGenerationComplete(result: PromptGenerationResult | null | undefined) {
  return Boolean(result && result.recommendedImagePlan.length > 0 && Object.keys(result.suggestedPrompts).length > 0)
}
