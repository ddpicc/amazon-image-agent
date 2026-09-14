export type AmazonBranch = 'amazon-set' | 'aplus'
export const AMAZON_REFERENCE_IMAGE_LIMIT = 5
export type AmazonAnalysisStageKey =
  | 'product-facts'
  | 'reference-images'
  | 'visual-style'
  | 'amazon-guidelines'
export type AmazonPromptKey =
  | 'main-white'
  | 'secondary-1'
  | 'secondary-2'
  | 'secondary-3'
  | 'secondary-4'
  | 'secondary-5'
  | 'secondary-6'
  | 'secondary-7'
  | 'secondary-8'
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

export type GallerySlotId =
  | 'main-white'
  | 'secondary-1'
  | 'secondary-2'
  | 'secondary-3'
  | 'secondary-4'
  | 'secondary-5'
  | 'secondary-6'
  | 'secondary-7'
  | 'secondary-8'

export interface AmazonGalleryPromptItem {
  slotId: GallerySlotId
  title: string
  visualForm: string
  prompt: string
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

export interface AmazonAnalysisStageResult {
  key: AmazonAnalysisStageKey
  title: string
  summary: string
  points: string[]
  cautions: string[]
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
  workflowVersion?: 2
  analysisStages?: AmazonAnalysisStageResult[]
}

export interface PromptGenerationResult {
  status: 'idle' | 'completed'
  recommendedImagePlan: RecommendedImagePlanItem[]
  suggestedPrompts: Record<string, string>
  workflowVersion?: 2
  items?: AmazonGalleryPromptItem[]
}

export type APlusPromptGenerationResult = PromptGenerationResult

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

export interface AmazonResumeImage {
  id: string
  requestId: string | null
  imageUrl: string | null
  prompt: string
  revisedPrompt: string | null
  imageType: string | null
  size: string | null
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
  statusMessage: string | null
  errorMessage: string | null
  createdAt: string
}

export interface AmazonResumeState {
  analysisId: string
  productName: string
  description: string
  additionalRequirements?: string
  category: string
  targetAudience: string
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED'
  createdAt: string
  errorMessage?: string | null
  referenceImages: StoredReferenceImage[]
  basicAnalysisResult: BasicAnalysisResult | null
  promptResults: PromptResults
  canResumeToPromptPage: boolean
  currentBranch?: AmazonBranch | null
  generatedImages: AmazonResumeImage[]
}

interface AmazonResumeImageRequestRow {
  id: string
  status: string
  statusMessage: string | null
  errorMessage: string | null
  prompt: string
  revisedPrompt: string | null
  imageUrl: string | null
  imageType: string | null
  size: string | null
  createdAt: Date | string
}

type AmazonResumeGenerationStatus = AmazonResumeImage['status']

function toResumeGenerationStatus(value: string): AmazonResumeGenerationStatus {
  if (value === 'QUEUED' || value === 'PROCESSING' || value === 'SUCCEEDED' || value === 'FAILED') {
    return value
  }
  // STARTED 是历史/遗留状态，统一当作 PROCESSING 展示
  return 'PROCESSING'
}

export function toAmazonResumeImages(rows: AmazonResumeImageRequestRow[]): AmazonResumeImage[] {
  return rows.map((row) => ({
    id: row.id,
    requestId: row.id,
    imageUrl: row.imageUrl,
    prompt: row.prompt,
    revisedPrompt: row.revisedPrompt,
    imageType: row.imageType,
    size: row.size,
    status: toResumeGenerationStatus(row.status),
    statusMessage: row.statusMessage,
    errorMessage: row.errorMessage,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : row.createdAt.toISOString(),
  }))
}

interface AmazonResumeRecordLike {
  id: string
  productName: string
  description: string
  additionalRequirements?: string | null
  category: string
  targetAudience: string
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED'
  createdAt: Date | string
  errorMessage?: string | null
  referenceImagesJson?: unknown
  analysisJson?: unknown
  promptPlanJson?: unknown
}

interface LegacyPromptGenerationResult {
  recommendedImagePlan: RecommendedImagePlanItem[]
  suggestedPrompts: Record<string, string>
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isReferenceImageAdvice(value: unknown): value is ReferenceImageAdvice {
  return Boolean(
    value
      && typeof value === 'object'
      && 'needMoreReferences' in value
      && typeof (value as ReferenceImageAdvice).needMoreReferences === 'boolean'
      && 'reason' in value
      && typeof (value as ReferenceImageAdvice).reason === 'string'
      && 'recommendedShots' in value
      && isStringArray((value as ReferenceImageAdvice).recommendedShots),
  )
}

function isReferenceImageObservation(value: unknown): value is ReferenceImageObservation {
  return Boolean(
    value
      && typeof value === 'object'
      && 'imageIndex' in value
      && typeof (value as ReferenceImageObservation).imageIndex === 'number'
      && 'observations' in value
      && isStringArray((value as ReferenceImageObservation).observations),
  )
}

export function isBasicAnalysisResult(value: unknown): value is BasicAnalysisResult {
  return Boolean(
    value
      && typeof value === 'object'
      && 'productSummary' in value
      && typeof (value as BasicAnalysisResult).productSummary === 'string'
      && 'sellingPoints' in value
      && isStringArray((value as BasicAnalysisResult).sellingPoints)
      && 'referenceImageObservations' in value
      && Array.isArray((value as BasicAnalysisResult).referenceImageObservations)
      && (value as BasicAnalysisResult).referenceImageObservations.every(isReferenceImageObservation)
      && 'referenceImageSummary' in value
      && typeof (value as BasicAnalysisResult).referenceImageSummary === 'string'
      && 'amazonImageGuidelines' in value
      && isStringArray((value as BasicAnalysisResult).amazonImageGuidelines)
      && 'complianceChecklist' in value
      && isStringArray((value as BasicAnalysisResult).complianceChecklist)
      && 'imageContentSuggestions' in value
      && isStringArray((value as BasicAnalysisResult).imageContentSuggestions)
      && 'visualStyleRecommendations' in value
      && isStringArray((value as BasicAnalysisResult).visualStyleRecommendations)
      && 'visualSystemGuidance' in value
      && isStringArray((value as BasicAnalysisResult).visualSystemGuidance)
      && 'promptingPrinciples' in value
      && isStringArray((value as BasicAnalysisResult).promptingPrinciples)
      && 'referenceImageAdvice' in value
      && isReferenceImageAdvice((value as BasicAnalysisResult).referenceImageAdvice)
      && 'canGeneratePrompts' in value
      && typeof (value as BasicAnalysisResult).canGeneratePrompts === 'boolean',
  )
}

function isStoredReferenceImage(value: unknown): value is StoredReferenceImage {
  return Boolean(
    value
      && typeof value === 'object'
      && 'url' in value
      && typeof (value as StoredReferenceImage).url === 'string'
      && 'key' in value
      && typeof (value as StoredReferenceImage).key === 'string'
      && 'mimeType' in value
      && typeof (value as StoredReferenceImage).mimeType === 'string'
      && 'bytes' in value
      && typeof (value as StoredReferenceImage).bytes === 'number'
      && 'name' in value
      && typeof (value as StoredReferenceImage).name === 'string',
  )
}

export function parseStoredReferenceImages(value: unknown): StoredReferenceImage[] {
  return Array.isArray(value) ? value.filter(isStoredReferenceImage) : []
}

export function buildAmazonResumeState(
  record: AmazonResumeRecordLike,
  options?: { imageRequests?: AmazonResumeImageRequestRow[] },
): AmazonResumeState {
  const promptResults = normalizePromptResults(record.promptPlanJson)

  return {
    analysisId: record.id,
    productName: record.productName,
    description: record.description,
    additionalRequirements: record.additionalRequirements ?? '',
    category: record.category,
    targetAudience: record.targetAudience,
    status: record.status,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : record.createdAt.toISOString(),
    errorMessage: record.errorMessage ?? null,
    referenceImages: parseStoredReferenceImages(record.referenceImagesJson),
    basicAnalysisResult: isBasicAnalysisResult(record.analysisJson) ? record.analysisJson : null,
    promptResults,
    canResumeToPromptPage: isPromptGenerationComplete(promptResults.amazonSet),
    currentBranch: null,
    generatedImages: toAmazonResumeImages(options?.imageRequests ?? []),
  }
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
    const normalizeResult = (candidate: unknown): PromptGenerationResult | null => {
      if (!candidate || typeof candidate !== 'object') return null

      const raw = candidate as Record<string, unknown>
      if (!Array.isArray(raw.recommendedImagePlan) || !raw.suggestedPrompts || typeof raw.suggestedPrompts !== 'object') {
        return null
      }

      const rawItems = Array.isArray(raw.items) ? raw.items : null
      const items = rawItems
        ? rawItems
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          // 兼容旧版已经保存的 enabled=false 项，但新协议不再暴露 enabled 字段。
          .filter((item) => item.enabled !== false)
          .filter((item) => typeof item.slotId === 'string' && typeof item.prompt === 'string' && item.prompt.trim().length > 0)
          .map((item) => ({
            slotId: item.slotId as GallerySlotId,
            title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Amazon 商品图',
            visualForm: typeof item.visualForm === 'string' && item.visualForm.trim() ? item.visualForm.trim() : 'product-focused composition',
            prompt: (item.prompt as string).trim(),
          }))
        : undefined

      return {
        status: raw.status === 'completed' ? 'completed' : 'idle',
        recommendedImagePlan: raw.recommendedImagePlan as RecommendedImagePlanItem[],
        suggestedPrompts: raw.suggestedPrompts as Record<string, string>,
        ...(items ? { items } : {}),
        ...(raw.workflowVersion === 2 ? { workflowVersion: 2 as const } : {}),
      }
    }

    return {
      amazonSet: normalizeResult(value.amazonSet),
      aplus: normalizeResult(value.aplus) as APlusPromptGenerationResult | null,
    }
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
  return Boolean(
    result
      && result.recommendedImagePlan.length > 0
      && ((result.items?.length ?? 0) > 0 || Object.keys(result.suggestedPrompts).length > 0),
  )
}

export function getPromptResultForBranch(promptResults: PromptResults, branch: AmazonBranch) {
  return branch === 'amazon-set' ? promptResults.amazonSet : promptResults.aplus
}
