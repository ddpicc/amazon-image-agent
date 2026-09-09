type RemoteTaskStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface RemoteTaskOutput {
  url: string
  revised_prompt: string | null
}

export interface RemoteTaskError {
  message: string
}

export interface RemoteTaskRecord {
  created: number
  id: string
  model: string
  object: string
  progress: number
  status: RemoteTaskStatus
  task_info?: {
    type?: string
  } | null
  usage?: {
    cost?: number | null
    cost_status?: string | null
    currency?: string | null
  } | null
  data?: RemoteTaskOutput[] | null
  error: RemoteTaskError | null
}

export interface SubmitRemoteTaskInput {
  prompt: string
  size?: string | null
  model?: string | null
  referenceImageUrls: string[]
  callbackUrl?: string | null
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

export async function listRemoteImageModels(): Promise<string[]> {
  const response = await fetch(`${getWorkerBaseUrl()}/v1/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getWorkerApiKey()}`,
    },
    cache: 'no-store',
    signal: createTimeoutSignal(),
  })

  const payload = await parseJson(response)
  if (!response.ok) {
    throw new Error(payload?.error || `Remote image worker model list failed: ${response.status}`)
  }

  if (!Array.isArray(payload?.data)) {
    throw new Error('Remote image worker model list returned an invalid payload')
  }

  return Array.from(new Set<string>(
    payload.data
      .map((item: unknown) => (
        item && typeof item === 'object' && 'id' in item && typeof item.id === 'string'
          ? item.id.trim()
          : ''
      ))
      .filter(Boolean),
  ))
}

export async function submitRemoteImageTask(input: SubmitRemoteTaskInput): Promise<SubmitRemoteTaskResult> {
  const isEditRequest = input.referenceImageUrls.length > 0
  const endpoint = isEditRequest ? '/v1/async/images/edits' : '/v1/async/images/generations'
  const model = input.model?.trim()
  if (!model) {
    throw new Error('Image model is required')
  }
  const body = isEditRequest
    ? {
        model,
        prompt: input.prompt,
        image: input.referenceImageUrls,
        size: input.size ?? '1024x1024',
        n: 1,
        ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
      }
    : {
        model,
        prompt: input.prompt,
        size: input.size ?? '1024x1024',
        quality: 'medium',
        n: 1,
        ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
      }

  const response = await fetch(`${getWorkerBaseUrl()}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getWorkerApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: createTimeoutSignal(),
  })

  const payload = await parseJson(response)
  if (!response.ok) {
    throw new Error(payload?.error || `Remote image worker submit failed: ${response.status}`)
  }

  if (!payload?.id || !payload?.status) {
    throw new Error('Remote image worker submit returned an invalid payload')
  }

  return {
    requestId: payload.id,
    status: payload.status,
    statusMessage: payload.statusMessage || '',
  }
}

export async function fetchRemoteImageTask(remoteRequestId: string): Promise<RemoteTaskRecord> {
  const response = await fetch(`${getWorkerBaseUrl()}/v1/async/images/tasks/${remoteRequestId}`, {
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

  if (!payload?.id || !payload?.status) {
    throw new Error('Remote image worker status returned an invalid payload')
  }

  return payload as RemoteTaskRecord
}
