import { Prisma } from '@prisma/client'
import { completeAiOperation, getAiOperationExpiryDate, startAiOperation } from '@/lib/ai-operations'
import { AMAZON_REFERENCE_IMAGE_LIMIT, StoredReferenceImage } from '@/lib/amazon-workflow'
import { PLAYGROUND_REFERENCE_IMAGE_LIMIT, RenderSize, ImageModel } from '@/lib/image-options'
import { PersistedImageGenerationPayload, RouteSummary, type ImageGenerationRequestStatus } from '@/lib/image-generation'
import { fetchRemoteImageTask, RemoteTaskRecord, submitRemoteImageTask } from '@/lib/image-worker-client'
import { debitPointForGeneration, ensureSufficientPointsForGenerationByScene } from '@/lib/points'
import { GenerationBillingScene } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'
import { signImageWorkerCallback } from '@/lib/crypto'

const IMAGE_TEXT_CONSTRAINT = 'Visible text in the generated image must use accurate English only. Do not render Chinese characters, Chinese punctuation, or any other CJK text. If accurate English text cannot be rendered, omit all text.'

function sourcePageToEnum(sourcePage: 'amazon' | 'playground'): 'AMAZON' | 'PLAYGROUND' {
  return sourcePage === 'amazon' ? 'AMAZON' : 'PLAYGROUND'
}

function parseStatus(value: string): ImageGenerationRequestStatus {
  if (value === 'QUEUED' || value === 'PROCESSING' || value === 'SUCCEEDED' || value === 'FAILED') {
    return value
  }
  if (value === 'pending') return 'QUEUED'
  if (value === 'processing') return 'PROCESSING'
  if (value === 'completed') return 'SUCCEEDED'
  if (value === 'failed') return 'FAILED'
  return 'QUEUED'
}

async function loadReferenceImageUrlsForRemote(referenceImages: StoredReferenceImage[], maxImages = 3) {
  return referenceImages
    .slice(0, maxImages)
    .map((image) => image.url)
    .filter((url) => /^https?:\/\//i.test(url))
}

function getAppBaseUrl() {
  const value = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '')
  if (!value) {
    return null
  }

  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString().replace(/\/+$/, '') : null
  } catch {
    return null
  }
}

function buildImageWorkerCallbackUrl(requestId: string) {
  const appBaseUrl = getAppBaseUrl()
  if (!appBaseUrl) {
    return null
  }

  const signature = signImageWorkerCallback(requestId)
  return `${appBaseUrl}/api/image-worker/callback/${requestId}?signature=${signature}`
}

async function failLocalRequest(params: {
  requestId: string
  operationId: string | null
  finalPrompt: string
  message: string
  responseSnapshot?: unknown
}) {
  await prisma.imageGenerationRequest.update({
    where: { id: params.requestId },
    data: {
      status: 'FAILED',
      errorMessage: params.message,
      statusMessage: params.message,
      completedAt: new Date(),
    },
  }).catch(() => undefined)

  if (params.operationId) {
    await completeAiOperation({
      operationId: params.operationId,
      status: 'FAILED',
      finalPrompt: params.finalPrompt,
      errorMessage: params.message,
      responseSnapshot: params.responseSnapshot,
    }).catch(() => undefined)
  }
}

async function buildPersistedImageGenerationPayload(params: {
  prompt: string
  originalPrompt: string
  sourcePage: 'amazon' | 'playground'
  billingScene: GenerationBillingScene
  imageType?: string | null
  containsSyntheticPerformer?: boolean
  model?: ImageModel | null
  size: RenderSize
  referenceImages: StoredReferenceImage[]
}): Promise<PersistedImageGenerationPayload> {
  return {
    prompt: params.prompt,
    originalPrompt: params.originalPrompt,
    sourcePage: params.sourcePage,
    billingScene: params.billingScene,
    imageType: params.imageType ?? null,
    containsSyntheticPerformer: Boolean(params.containsSyntheticPerformer),
    model: params.model ?? null,
    size: params.size,
    referenceImages: params.referenceImages,
  }
}

export async function createQueuedImageGenerationRequest(params: {
  userId: string
  prompt: string
  originalPrompt: string
  sourcePage: 'amazon' | 'playground'
  billingScene: GenerationBillingScene
  entryApi: string
  imageType?: string | null
  containsSyntheticPerformer?: boolean
  model?: ImageModel | null
  size: RenderSize
  referenceImages: StoredReferenceImage[]
  analysisRecordId?: string | null
}) {
  await ensureSufficientPointsForGenerationByScene(params.userId, params.billingScene)
  const executionPrompt = `${params.prompt}\n\n${IMAGE_TEXT_CONSTRAINT}`

  const operation = await startAiOperation({
    userId: params.userId,
    kind: 'IMAGE_GENERATION',
    sourcePage: params.sourcePage,
    entryPoint: params.entryApi,
    inputSummary: {
      promptLength: executionPrompt.length,
      sourcePage: params.sourcePage,
      billingScene: params.billingScene,
      imageType: params.imageType ?? null,
      containsSyntheticPerformer: Boolean(params.containsSyntheticPerformer),
      model: params.model ?? null,
      size: params.size,
      referenceImageCount: params.referenceImages.length,
      referenceMediaTypes: params.referenceImages.map((image) => image.mimeType),
    },
    requestSnapshot: {
      prompt: executionPrompt,
      originalPrompt: params.originalPrompt,
      sourcePage: params.sourcePage,
      billingScene: params.billingScene,
      imageType: params.imageType ?? null,
      containsSyntheticPerformer: Boolean(params.containsSyntheticPerformer),
      model: params.model ?? null,
      size: params.size,
      referenceImages: params.referenceImages.map((image, index) => ({
        index,
        url: image.url,
        mimeType: image.mimeType,
        sizeBytes: image.bytes,
      })),
    },
    expiresAt: getAiOperationExpiryDate(),
  })

  const requestPayload = await buildPersistedImageGenerationPayload({
    prompt: executionPrompt,
    originalPrompt: params.originalPrompt,
    sourcePage: params.sourcePage,
    billingScene: params.billingScene,
    imageType: params.imageType ?? null,
    containsSyntheticPerformer: Boolean(params.containsSyntheticPerformer),
    model: params.model ?? null,
    size: params.size,
    referenceImages: params.referenceImages,
  })

  const requestRecord = await prisma.imageGenerationRequest.create({
    data: {
      userId: params.userId,
      operationId: operation.id,
      analysisRecordId: params.analysisRecordId ?? null,
      sourcePage: sourcePageToEnum(params.sourcePage),
      entryApi: params.entryApi,
      billingScene: params.billingScene,
      prompt: params.originalPrompt,
      finalPrompt: executionPrompt,
      imageType: params.imageType ?? null,
      containsSyntheticPerformer: Boolean(params.containsSyntheticPerformer),
      size: params.size,
      referenceImageCount: params.referenceImages.length,
      referenceImagesJson: params.referenceImages as unknown as Prisma.InputJsonValue,
      requestPayloadJson: requestPayload as unknown as Prisma.InputJsonValue,
      requestSnapshotJson: requestPayload as unknown as Prisma.InputJsonValue,
      status: 'QUEUED',
      statusMessage: '任务已提交，等待 worker 处理',
      queuedAt: new Date(),
    },
  })

  return {
    requestId: requestRecord.id,
    operationId: operation.id,
    status: requestRecord.status,
    statusMessage: requestRecord.statusMessage || '任务已提交，等待 worker 处理',
  }
}

export async function submitQueuedImageGenerationRequest(requestId: string) {
  const request = await prisma.imageGenerationRequest.findUnique({
    where: { id: requestId },
  })

  if (!request) {
    throw new Error(`Image generation request not found: ${requestId}`)
  }

  if (request.workerJobId) {
    return {
      localRequestId: request.id,
      remoteRequestId: request.workerJobId,
      status: request.status,
      statusMessage: request.statusMessage || '任务已提交，等待 worker 处理',
    }
  }

  const payload = request.requestPayloadJson as PersistedImageGenerationPayload | null
  if (!payload) {
    throw new Error('Queued image generation request is missing requestPayloadJson')
  }

  try {
    const referenceImageUrls = await loadReferenceImageUrlsForRemote(
      payload.referenceImages || [],
      payload.sourcePage === 'amazon' ? AMAZON_REFERENCE_IMAGE_LIMIT : PLAYGROUND_REFERENCE_IMAGE_LIMIT,
    )
    const remoteTask = await submitRemoteImageTask({
      prompt: payload.prompt,
      size: payload.size,
      model: payload.model,
      referenceImageUrls,
      callbackUrl: buildImageWorkerCallbackUrl(request.id),
    })

    await prisma.imageGenerationRequest.update({
      where: { id: request.id },
      data: {
        workerJobId: remoteTask.requestId,
        status: parseStatus(remoteTask.status),
        statusMessage: remoteTask.statusMessage || '任务已提交，等待 worker 处理',
      },
    })

    return {
      localRequestId: request.id,
      remoteRequestId: remoteTask.requestId,
      status: parseStatus(remoteTask.status),
      statusMessage: remoteTask.statusMessage || '任务已提交，等待 worker 处理',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit request to remote image worker'
    await failLocalRequest({
      requestId: request.id,
      operationId: request.operationId,
      finalPrompt: payload.prompt,
      message,
      responseSnapshot: {
        stage: 'remote-submit',
        errorMessage: message,
      },
    })
    throw error
  }
}

async function syncImageGenerationRequestFromWorker(requestId: string) {
  const request = await prisma.imageGenerationRequest.findUnique({
    where: { id: requestId },
  })

  if (!request || !request.workerJobId) {
    return null
  }

  if (request.status === 'SUCCEEDED' || request.status === 'FAILED') {
    return getImageGenerationStatusRecord(request.id)
  }

  const remoteTask = await fetchRemoteImageTask(request.workerJobId)
  return applyRemoteImageTaskToRequest(request.id, remoteTask)
}

export async function applyRemoteImageTaskToRequest(requestId: string, remoteTask: RemoteTaskRecord) {
  const request = await prisma.imageGenerationRequest.findUnique({
    where: { id: requestId },
  })

  if (!request || !request.workerJobId) {
    return null
  }

  if (remoteTask.id !== request.workerJobId) {
    throw new Error('Remote task id does not match local workerJobId')
  }

  if (request.status === 'SUCCEEDED' || request.status === 'FAILED') {
    return getImageGenerationStatusRecord(request.id)
  }

  const nextStatus = parseStatus(remoteTask.status)
  const imageOutput = remoteTask.data?.[0] || null
  const startedAt = request.startedAt ?? (nextStatus === 'PROCESSING' || nextStatus === 'SUCCEEDED' || nextStatus === 'FAILED' ? new Date() : null)
  const completedAt = nextStatus === 'SUCCEEDED' || nextStatus === 'FAILED' ? new Date() : request.completedAt
  const durationMs = completedAt
    ? Math.max(0, completedAt.getTime() - (startedAt ?? request.createdAt).getTime())
    : request.durationMs
  const statusMessage = nextStatus === 'SUCCEEDED'
    ? '图片生成成功'
    : nextStatus === 'FAILED'
      ? (remoteTask.error?.message || '图片生成失败')
      : nextStatus === 'PROCESSING'
        ? '图片生成中'
        : '任务排队中'

  const updateData: Prisma.ImageGenerationRequestUpdateInput = {
    status: nextStatus,
    statusMessage,
    errorMessage: remoteTask.error?.message || null,
    revisedPrompt: imageOutput?.revised_prompt ?? request.revisedPrompt,
    imageUrl: imageOutput?.url ?? request.imageUrl,
    startedAt,
    completedAt,
    durationMs,
  }

  if (nextStatus === 'SUCCEEDED') {
    await debitPointForGeneration({
      userId: request.userId,
      requestId: request.id,
      scene: (request.billingScene || 'amazon') as GenerationBillingScene,
    })

    await prisma.imageGenerationRequest.update({
      where: { id: request.id },
      data: updateData,
    })

    if (request.operationId) {
      await completeAiOperation({
        operationId: request.operationId,
        status: 'SUCCEEDED',
        finalPrompt: request.finalPrompt ?? request.prompt,
        outputSummary: {
          imageUrl: imageOutput?.url || null,
        },
        responseSnapshot: remoteTask,
      }).catch(() => undefined)
    }
  } else if (nextStatus === 'FAILED') {
    await prisma.imageGenerationRequest.update({
      where: { id: request.id },
      data: updateData,
    })

    if (request.operationId) {
      await completeAiOperation({
        operationId: request.operationId,
        status: 'FAILED',
        finalPrompt: request.finalPrompt ?? request.prompt,
        errorMessage: remoteTask.error?.message || 'Remote image worker failed',
        responseSnapshot: remoteTask,
      }).catch(() => undefined)
    }
  } else {
    await prisma.imageGenerationRequest.update({
      where: { id: request.id },
      data: updateData,
    })
  }

  return prisma.imageGenerationRequest.findUnique({
    where: { id: request.id },
    include: {
      pointsLedgerEntry: true,
    },
  })
}

export async function syncImageGenerationRequestFromWorkerSafely(requestId: string) {
  try {
    return await syncImageGenerationRequestFromWorker(requestId)
  } catch (error) {
    const message = error instanceof Error ? error.message : '同步远端任务状态失败'

    await prisma.imageGenerationRequest.update({
      where: { id: requestId },
      data: {
        statusMessage: `同步远端任务状态失败：${message}`,
      },
    }).catch(() => undefined)

    return getImageGenerationStatusRecord(requestId)
  }
}

export async function syncActiveImageGenerationRequests(requestIds: string[]) {
  await Promise.allSettled(
    requestIds.map((requestId) => syncImageGenerationRequestFromWorkerSafely(requestId)),
  )
}

export async function getImageGenerationStatusRecord(requestId: string) {
  return prisma.imageGenerationRequest.findUnique({
    where: { id: requestId },
    include: {
      pointsLedgerEntry: true,
    },
  })
}

export function buildImageGenerationRouteSummary(_record: {
  status: string
  statusMessage: string | null
  errorMessage: string | null
}): RouteSummary | null {
  return null
}
