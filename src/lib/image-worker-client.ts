import { AttemptStatus, UpstreamApiKind } from '@prisma/client'

type RemoteTaskStatus = 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

export interface RemoteTaskAttempt {
  id: string
  providerId: string | null
  baseUrl: string
  model: string
  attemptIndex: number
  status: AttemptStatus
  durationMs: number | null
  errorMessage: string | null
  upstreamApiKind: UpstreamApiKind
  requestSnapshotJson: Record<string, unknown> | null
  responseSnapshotJson: Record<string, unknown> | null
  startedAt: string
  completedAt: string | null
}

export interface RemoteTaskAsset {
  id: string
  cosUrl: string
  cosKey: string
  mimeType: string
  bytes: number
  upstreamSourceUrl: string | null
  createdAt: string
}

export interface RemoteTaskRecord {
  id: string
  status: RemoteTaskStatus
  statusMessage: string | null
  errorMessage: string | null
  durationMs: number | null
  prompt: string
  finalPrompt: string | null
  revisedPrompt: string | null
  imageType: string | null
  aspectRatio: string | null
  size: string | null
  selectedProviderId: string | null
  selectedProviderName: string | null
  selectedProviderBaseUrl: string | null
  selectedProviderModel: string | null
  attemptCount: number
  responseSnapshotJson: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  queuedAt: string | null
  startedAt: string | null
  completedAt: string | null
  attempts: RemoteTaskAttempt[]
  assets: RemoteTaskAsset[]
}

export interface SubmitRemoteTaskInput {
  prompt: string
  imageType?: string | null
  aspectRatio?: string | null
  size?: string | null
  metadata?: Record<string, unknown> | null
  referenceImages: Array<{
    data: string
    mediaType: string
  }>
}

export interface SubmitRemoteTaskResult {
  requestId: string
  status: string
  statusMessage: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} environment variable is not set`)
  }
  return value
}

function getWorkerBaseUrl(): string {
  return requireEnv('IMAGE_WORKER_BASE_URL').replace(/\/+$/, '')
}

function getWorkerApiKey(): string {
  return requireEnv('IMAGE_WORKER_API_KEY')
}

function getRequestTimeoutMs(): number {
  const raw = Number(process.env.IMAGE_WORKER_TIMEOUT_MS || 15000)
  return Number.isFinite(raw) && raw > 0 ? raw : 15000
}

function createTimeoutSignal(): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return AbortSignal.timeout(getRequestTimeoutMs())
  }
  return undefined
}

async function parseJson(response: Response) {
  return response.json().catch(() => null) as Promise<any>
}

export async function submitRemoteImageTask(input: SubmitRemoteTaskInput): Promise<SubmitRemoteTaskResult> {
  const response = await fetch(`${getWorkerBaseUrl()}/api/v1/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getWorkerApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: input.prompt,
      imageType: input.imageType ?? null,
      aspectRatio: input.aspectRatio ?? null,
      size: input.size ?? null,
      metadata: input.metadata ?? undefined,
      referenceImages: input.referenceImages,
    }),
    cache: 'no-store',
    signal: createTimeoutSignal(),
  })

  const payload = await parseJson(response)
  if (!response.ok) {
    throw new Error(payload?.error || `Remote image worker submit failed: ${response.status}`)
  }

  if (!payload?.requestId || !payload?.status) {
    throw new Error('Remote image worker submit returned an invalid payload')
  }

  return {
    requestId: payload.requestId,
    status: payload.status,
    statusMessage: payload.statusMessage || '',
  }
}

export async function fetchRemoteImageTask(remoteRequestId: string): Promise<RemoteTaskRecord> {
  const response = await fetch(`${getWorkerBaseUrl()}/api/v1/tasks/${remoteRequestId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getWorkerApiKey()}`,
    },
    cache: 'no-store',
    signal: createTimeoutSignal(),
  })

  const payload = await parseJson(response)
  if (!response.ok) {
    throw new Error(payload?.error || `Remote image worker status fetch failed: ${response.status}`)
  }

  if (!payload?.data?.id) {
    throw new Error('Remote image worker status returned an invalid payload')
  }

  return payload.data as RemoteTaskRecord
}
