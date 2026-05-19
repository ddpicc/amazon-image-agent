import OpenAI from 'openai'
import { uploadBufferToCos } from '@/lib/cos'
import { decryptSecret } from '@/lib/crypto'
import { AspectRatio, RenderSize } from '@/lib/image-options'
import { listCandidateImageProviders, markProviderFailure, markProviderSuccess } from '@/lib/image-providers'
import { debitPointForGeneration, InsufficientPointsError, refundPointForFailedGeneration } from '@/lib/points'
import { prisma } from '@/lib/prisma'

interface GenerateImageInput {
  userId: string
  prompt: string
  referenceImages: Array<{
    data: string
    mediaType: string
  }>
  size?: RenderSize
  aspectRatio?: AspectRatio
  imageType?: string
  sourcePage: 'amazon' | 'playground'
  entryApi: string
  onStatus?: (message: string) => Promise<void> | void
}

interface GenerateImageOutput {
  imageUrl: string
  revisedPrompt: string
  size: RenderSize
  aspectRatio?: AspectRatio
  requestId: string
  routeSummary: {
    selectedLineName: string
    selectedLineIndex: number
    switched: boolean
    attemptedLines: Array<{
      lineIndex: number
      lineName: string
      status: 'succeeded' | 'failed'
      errorMessage?: string
    }>
    userMessage: string
  }
}

class GenerateImageRouteError extends Error {
  routeSummary: GenerateImageOutput['routeSummary']

  constructor(message: string, routeSummary: GenerateImageOutput['routeSummary']) {
    super(message)
    this.name = 'GenerateImageRouteError'
    this.routeSummary = routeSummary
  }
}

function getExtensionFromMediaType(mediaType: string): string {
  if (mediaType === 'image/png') return 'png'
  if (mediaType === 'image/webp') return 'webp'
  if (mediaType === 'image/gif') return 'gif'
  if (mediaType === 'image/jpeg') return 'jpg'
  return 'bin'
}

function toImageFile(
  referenceImage: { data: string; mediaType: string },
  index: number,
): File {
  const imageBuffer = Buffer.from(referenceImage.data, 'base64')
  const extension = getExtensionFromMediaType(referenceImage.mediaType)
  return new File([imageBuffer], `reference-${Date.now()}-${index}.${extension}`, {
    type: referenceImage.mediaType || 'image/jpeg',
  })
}

function createOpenAIClient(apiKey: string, baseURL: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL,
  })
}

function getProviderBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}

function isEvolinkProvider(vendor: string, baseUrl: string): boolean {
  return vendor.toLowerCase() === 'evolink' || /evolink\.ai/i.test(baseUrl)
}

function buildImageEditParams(params: {
  model: string
  image: File[]
  prompt: string
  size: RenderSize
}) {
  return {
    model: params.model,
    image: params.image,
    prompt: params.prompt,
    n: 1,
    size: params.size,
    input_fidelity: 'high',
    quality: 'medium',
    response_format: 'url',
    output_format: 'png',
  } as any
}

function buildImageGenerateParams(params: {
  model: string
  prompt: string
  size: RenderSize
}) {
  return {
    model: params.model,
    prompt: params.prompt,
    n: 1,
    size: params.size,
    quality: 'medium',
    response_format: 'url',
    output_format: 'png',
  } as any
}

function sourcePageToEnum(sourcePage: 'amazon' | 'playground'): 'AMAZON' | 'PLAYGROUND' {
  return sourcePage === 'amazon' ? 'AMAZON' : 'PLAYGROUND'
}

function upstreamApiKindFromMode(mode: 'edit' | 'generate'): 'IMAGES_EDIT' | 'IMAGES_GENERATE' {
  return mode === 'edit' ? 'IMAGES_EDIT' : 'IMAGES_GENERATE'
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    throw new Error('Invalid data URL returned from upstream image API')
  }

  return {
    mimeType: match[1] || 'image/png',
    buffer: Buffer.from(match[2], 'base64'),
  }
}

function parseBase64Payload(base64: string, mimeType = 'image/png'): { buffer: Buffer; mimeType: string } {
  return {
    buffer: Buffer.from(base64, 'base64'),
    mimeType,
  }
}

async function downloadRemoteImage(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download upstream image: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: response.headers.get('content-type') || 'image/png',
  }
}

async function normalizeUpstreamImage(rawImageUrl: string, fallbackMimeType = 'image/png') {
  if (!rawImageUrl) {
    throw new Error('Upstream image response did not include a URL')
  }

  if (rawImageUrl.startsWith('data:')) {
    return parseDataUrl(rawImageUrl)
  }

  const downloaded = await downloadRemoteImage(rawImageUrl)
  return {
    buffer: downloaded.buffer,
    mimeType: downloaded.mimeType || fallbackMimeType,
  }
}

async function extractUpstreamImage(imageData: any): Promise<{ buffer: Buffer; mimeType: string; returnedKind: 'data-url' | 'remote-url' | 'b64-json' }> {
  const rawImageUrl = imageData?.url || ''
  const b64Json = imageData?.b64_json || ''

  if (rawImageUrl.startsWith('data:')) {
    const parsed = parseDataUrl(rawImageUrl)
    return { ...parsed, returnedKind: 'data-url' }
  }

  if (rawImageUrl) {
    const downloaded = await downloadRemoteImage(rawImageUrl)
    return { ...downloaded, returnedKind: 'remote-url' }
  }

  if (b64Json) {
    return {
      ...parseBase64Payload(b64Json),
      returnedKind: 'b64-json',
    }
  }

  throw new Error('Upstream image response did not include url or b64_json')
}

function getExtensionFromMimeType(mimeType: string): string {
  return getExtensionFromMediaType(mimeType)
}

async function uploadReferenceImagesForProvider(params: {
  requestId: string
  referenceImages: Array<{ data: string; mediaType: string }>
}) {
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const env = process.env.NODE_ENV || 'development'

  return Promise.all(params.referenceImages.slice(0, 16).map(async (image, index) => {
    const buffer = Buffer.from(image.data, 'base64')
    const ext = getExtensionFromMimeType(image.mediaType)
    const key = `provider-inputs/${env}/${yyyy}/${mm}/${dd}/${params.requestId}-${index + 1}.${ext}`

    const uploaded = await uploadBufferToCos({
      buffer,
      key,
      contentType: image.mediaType || 'image/jpeg',
    })

    return uploaded.url
  }))
}

async function pollEvolinkTask(params: {
  baseUrl: string
  apiKey: string
  taskId: string
  timeoutMs?: number
  intervalMs?: number
}): Promise<{ status: string; results?: string[]; error?: { message?: string } }> {
  const timeoutMs = params.timeoutMs ?? 180_000
  const intervalMs = params.intervalMs ?? 3_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const response = await fetch(`${getProviderBaseUrl(params.baseUrl)}/tasks/${params.taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
      cache: 'no-store',
    })

    const payload = await response.json().catch(() => null) as any
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.message || `Evolink task query failed: ${response.status}`)
    }

    if (payload?.status === 'completed') {
      return payload
    }

    if (payload?.status === 'failed') {
      throw new Error(payload?.error?.message || payload?.message || 'Evolink task failed')
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error('Evolink task timed out')
}

async function requestEvolinkImage(params: {
  requestId: string
  apiKey: string
  baseUrl: string
  model: string
  prompt: string
  size: RenderSize
  referenceImages: Array<{ data: string; mediaType: string }>
}): Promise<{ buffer: Buffer; mimeType: string; returnedKind: 'remote-url' }> {
  const imageUrls = params.referenceImages.length > 0
    ? await uploadReferenceImagesForProvider({
        requestId: params.requestId,
        referenceImages: params.referenceImages,
      })
    : []

  const createResponse = await fetch(`${getProviderBaseUrl(params.baseUrl)}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      size: params.size,
      n: 1,
      ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
    }),
    cache: 'no-store',
  })

  const createPayload = await createResponse.json().catch(() => null) as any
  if (!createResponse.ok) {
    throw new Error(createPayload?.error?.message || createPayload?.message || `Evolink task creation failed: ${createResponse.status}`)
  }

  const taskId = createPayload?.id
  if (!taskId) {
    throw new Error('Evolink task creation did not return a task id')
  }

  const taskResult = await pollEvolinkTask({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    taskId,
  })

  const resultUrl = Array.isArray(taskResult.results) ? taskResult.results[0] : ''
  if (!resultUrl) {
    throw new Error('Evolink task completed without image results')
  }

  const downloaded = await downloadRemoteImage(resultUrl)
  return {
    buffer: downloaded.buffer,
    mimeType: downloaded.mimeType,
    returnedKind: 'remote-url',
  }
}

function buildCosKey(requestId: string, mimeType: string): string {
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const env = process.env.NODE_ENV || 'development'
  const ext = getExtensionFromMediaType(mimeType)
  return `generated/${env}/${yyyy}/${mm}/${dd}/${requestId}.${ext}`
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const { userId, prompt, referenceImages, size = '1024x1024', aspectRatio, imageType, sourcePage, entryApi, onStatus } = input
  const mode = referenceImages.length > 0 ? 'edit' : 'generate'
  const startedAt = Date.now()

  const requestRecord = await prisma.imageGenerationRequest.create({
    data: {
      userId,
      sourcePage: sourcePageToEnum(sourcePage),
      entryApi,
      prompt,
      imageType,
      aspectRatio,
      size,
      referenceImageCount: referenceImages.length,
      finalUpstreamApiKind: upstreamApiKindFromMode(mode),
      status: 'STARTED',
    },
  })

  try {
    await debitPointForGeneration({
      userId,
      requestId: requestRecord.id,
    })
  } catch (error) {
    if (error instanceof InsufficientPointsError) {
      const errorMessage = error.message
      await prisma.imageGenerationRequest.update({
        where: { id: requestRecord.id },
        data: {
          status: 'FAILED',
          errorMessage,
          durationMs: Date.now() - startedAt,
        },
      })
      throw error
    }

    throw error
  }

  const providers = await listCandidateImageProviders()
  if (providers.length === 0) {
    const errorMessage = 'No enabled image providers are configured'
    await prisma.imageGenerationRequest.update({
      where: { id: requestRecord.id },
      data: {
        status: 'FAILED',
        errorMessage,
        durationMs: Date.now() - startedAt,
      },
    })
    await refundPointForFailedGeneration({
      userId,
      requestId: requestRecord.id,
    })
    throw new Error(errorMessage)
  }

  const imageFiles = referenceImages.slice(0, 3).map(toImageFile)
  const errors: string[] = []
  const attemptedLines: GenerateImageOutput['routeSummary']['attemptedLines'] = []

  const emitStatus = async (message: string) => {
    if (onStatus) {
      await onStatus(message)
    }
  }

  const lineName = (index: number) => {
    const names = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
    return names[index - 1] ? `第${names[index - 1]}线路` : `第${index}线路`
  }

  console.info('[image.generate] request start', {
    requestId: requestRecord.id,
    mode,
    sourcePage,
    size,
    aspectRatio: aspectRatio || 'unspecified',
    promptLength: prompt.length,
    referenceImageCount: referenceImages.length,
    providerCount: providers.length,
  })

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]
    if (index === 0) {
      await emitStatus(`正在尝试第一线路`)
    }
    const attemptStartedAt = Date.now()
    const attempt = await prisma.imageGenerationAttempt.create({
      data: {
        requestId: requestRecord.id,
        providerId: provider.id,
        baseUrl: provider.baseUrl,
        model: provider.model,
        attemptIndex: index + 1,
        upstreamApiKind: upstreamApiKindFromMode(mode),
        status: 'STARTED',
      },
    })

    console.info('[image.generate] upstream request start', {
      requestId: requestRecord.id,
      providerId: provider.id,
      providerName: provider.name,
      baseUrl: provider.baseUrl,
      model: provider.model,
      attemptIndex: index + 1,
      mode,
    })

    try {
      const apiKey = decryptSecret(provider.apiKeyCiphertext)
      const revisedPrompt = prompt
      const extracted = isEvolinkProvider(provider.vendor, provider.baseUrl)
        ? await requestEvolinkImage({
            requestId: requestRecord.id,
            apiKey,
            baseUrl: provider.baseUrl,
            model: provider.model,
            prompt,
            size,
            referenceImages,
          })
        : await (async () => {
            const client = createOpenAIClient(apiKey, provider.baseUrl)
            const response = mode === 'edit'
              ? await client.images.edit(buildImageEditParams({
                  model: provider.model,
                  image: imageFiles,
                  prompt,
                  size,
                }))
              : await client.images.generate(buildImageGenerateParams({
                  model: provider.model,
                  prompt,
                  size,
                }))

            if (!response.data || response.data.length === 0) {
              throw new Error('No image data returned from upstream provider')
            }

            const imageData = response.data[0] as any
            return {
              ...(await extractUpstreamImage(imageData)),
              revisedPrompt: imageData.revised_prompt || prompt,
            }
          })()
      const cosKey = buildCosKey(requestRecord.id, extracted.mimeType)
      const uploaded = await uploadBufferToCos({
        buffer: extracted.buffer,
        key: cosKey,
        contentType: extracted.mimeType,
      })

      await prisma.generatedImageAsset.create({
        data: {
          requestId: requestRecord.id,
          cosUrl: uploaded.url,
          cosKey: uploaded.key,
          mimeType: uploaded.mimeType,
          bytes: uploaded.bytes,
        },
      })

      await prisma.imageGenerationAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'SUCCEEDED',
          durationMs: Date.now() - attemptStartedAt,
          completedAt: new Date(),
        },
      })

      await prisma.imageGenerationRequest.update({
        where: { id: requestRecord.id },
        data: {
          selectedProviderId: provider.id,
          selectedProviderName: provider.name,
          selectedProviderBaseUrl: provider.baseUrl,
          selectedProviderModel: provider.model,
          attemptCount: index + 1,
          revisedPrompt: 'revisedPrompt' in extracted ? extracted.revisedPrompt : revisedPrompt,
          status: 'SUCCEEDED',
          durationMs: Date.now() - startedAt,
        },
      })

      await markProviderSuccess(provider.id)

      attemptedLines.push({
        lineIndex: index + 1,
        lineName: provider.name,
        status: 'succeeded',
      })

      const routeSummary: GenerateImageOutput['routeSummary'] = {
        selectedLineName: provider.name,
        selectedLineIndex: index + 1,
        switched: index > 0,
        attemptedLines,
        userMessage: index > 0
          ? `第一线路调用失败，已切换到第 ${index + 1} 线路（${provider.name}）并生成成功。`
          : `已通过第一线路（${provider.name}）生成成功。`,
      }

      await emitStatus(`${lineName(index + 1)}生成成功`)

      console.info('[image.generate] request success', {
        requestId: requestRecord.id,
        providerId: provider.id,
        providerName: provider.name,
        attemptCount: index + 1,
        returnedImageUrlKind: extracted.returnedKind,
        cosUrl: uploaded.url,
      })

      return {
        requestId: requestRecord.id,
        imageUrl: uploaded.url,
        revisedPrompt: 'revisedPrompt' in extracted ? extracted.revisedPrompt : revisedPrompt,
        size,
        aspectRatio,
        routeSummary,
      }
    } catch (error) {
      const message = serializeError(error)
      errors.push(`${provider.name}: ${message}`)
      attemptedLines.push({
        lineIndex: index + 1,
        lineName: provider.name,
        status: 'failed',
        errorMessage: message,
      })

      await prisma.imageGenerationAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'FAILED',
          durationMs: Date.now() - attemptStartedAt,
          errorMessage: message,
          completedAt: new Date(),
        },
      })

      await markProviderFailure(provider.id)

      console.error('[image.generate] upstream request failed', {
        requestId: requestRecord.id,
        providerId: provider.id,
        providerName: provider.name,
        attemptIndex: index + 1,
        mode,
        error: message,
      })

      if (index < providers.length - 1) {
        await emitStatus(`${lineName(index + 1)}失败，正在切换${lineName(index + 2)}`)
      } else {
        await emitStatus(`${lineName(index + 1)}失败，所有线路都不可用`)
      }
      continue
    }
  }

  const errorMessage = errors.join(' | ') || 'All image providers failed'
  await prisma.imageGenerationRequest.update({
    where: { id: requestRecord.id },
    data: {
      attemptCount: providers.length,
      status: 'FAILED',
      durationMs: Date.now() - startedAt,
      errorMessage,
    },
  })

  await refundPointForFailedGeneration({
    userId,
    requestId: requestRecord.id,
  })

  console.error('[image.generate] request failed', {
    requestId: requestRecord.id,
    errorMessage,
  })

  throw new GenerateImageRouteError(errorMessage, {
    selectedLineName: '',
    selectedLineIndex: 0,
    switched: attemptedLines.length > 1,
    attemptedLines,
    userMessage: attemptedLines.length > 1
      ? '前面线路调用失败，已依次切换后备线路，但全部失败。'
      : '第一线路调用失败，且当前没有可用后备线路。',
  })
}
