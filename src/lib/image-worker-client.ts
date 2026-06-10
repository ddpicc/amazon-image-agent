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
  data: RemoteTaskOutput[]
  error: RemoteTaskError | null
}

export interface SubmitRemoteTaskInput {
  prompt: string
  size?: string | null
  referenceImageUrls: string[]
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
  const response = await fetch(`${getWorkerBaseUrl()}/v1/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getWorkerApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt: input.prompt,
      image_urls: input.referenceImageUrls,
      size: input.size ?? '1024x1024',
      quality: 'medium',
      n: 1,
    }),
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
  const response = await fetch(`${getWorkerBaseUrl()}/v1/images/tasks/${remoteRequestId}`, {
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
