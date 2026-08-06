import { ImageModel, RenderSize } from '@/lib/image-options'
import { GenerationBillingScene } from '@/lib/points-config'
import { StoredReferenceImage } from '@/lib/amazon-workflow'

export type ImageGenerationRequestStatus = 'STARTED' | 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

export interface RouteSummaryLine {
  lineIndex: number
  lineName: string
  status: 'succeeded' | 'failed'
  errorMessage?: string
}

export interface RouteSummary {
  selectedLineName: string
  selectedLineIndex: number
  switched: boolean
  attemptedLines: RouteSummaryLine[]
  userMessage: string
}

export interface PersistedImageGenerationPayload {
  prompt: string
  originalPrompt: string
  sourcePage: 'amazon' | 'playground'
  billingScene: GenerationBillingScene
  imageType?: string | null
  containsSyntheticPerformer: boolean
  model?: ImageModel | null
  size: RenderSize
  referenceImages: StoredReferenceImage[]
}

export interface ImageGenerationSubmitResult {
  requestId: string
  operationId: string
  status: ImageGenerationRequestStatus
  statusMessage: string
}

export interface ImageGenerationStatusResult {
  requestId: string
  operationId: string | null
  status: ImageGenerationRequestStatus
  statusMessage: string | null
  errorMessage: string | null
  prompt: string
  revisedPrompt: string | null
  imageUrl: string | null
  imageType: string | null
  size: string | null
  routeSummary: RouteSummary | null
}

export function isImageGenerationActive(status: ImageGenerationRequestStatus) {
  return status === 'STARTED' || status === 'QUEUED' || status === 'PROCESSING'
}
