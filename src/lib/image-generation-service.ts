import { AttemptStatus, Prisma, UpstreamApiKind } from '@prisma/client'
import { completeAiOperation, completeAiOperationAttempt, getAiOperationExpiryDate, startAiOperation, startAiOperationAttempt } from '@/lib/ai-operations'
import { StoredReferenceImage } from '@/lib/amazon-workflow'
import { AspectRatio, RenderSize } from '@/lib/image-options'
import { PersistedImageGenerationPayload, RouteSummary, type ImageGenerationRequestStatus } from '@/lib/image-generation'
import { fetchRemoteImageTask, submitRemoteImageTask, type RemoteTaskAttempt, type RemoteTaskRecord } from '@/lib/image-worker-client'
import { debitPointForGeneration, ensureSufficientPointsForGenerationByScene } from '@/lib/points'
import { GenerationBillingScene } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'

type JsonObject = Record<string, unknown>

function sourcePageToEnum(sourcePage: 'amazon' | 'playground'): 'AMAZON' | 'PLAYGROUND' {
  return sourcePage === 'amazon' ? 'AMAZON' : 'PLAYGROUND'
}

function upstreamApiKindFromMode(mode: 'edit' | 'generate'): UpstreamApiKind {
  return mode === 'edit' ? 'IMAGES_EDIT' : 'IMAGES_GENERATE'
}

function toNullableJsonValue(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

function parseStatus(value: string): ImageGenerationRequestStatus {
  if (value === 'QUEUED' || value === 'PROCESSING' || value === 'SUCCEEDED' || value === 'FAILED') {
    return value
  }
  return 'QUEUED'
}

function parseAttemptStatus(value: string): AttemptStatus {
  if (value === 'SUCCEEDED' || value === 'FAILED') {
    return value
  }
  return 'STARTED'
}

function parseUpstreamApiKind(value: string | null | undefined): UpstreamApiKind {
  if (value === 'IMAGES_EDIT' || value === 'IMAGES_GENERATE') {
    return value
  }
  return 'UNKNOWN'
}

function buildAttemptedLinesFromRemote(remoteTask: RemoteTaskRecord): RouteSummary['attemptedLines'] {
  return remoteTask.attempts
    .filter((attempt) => attempt.status !== 'STARTED')
    .map((attempt) => ({
      lineIndex: attempt.attemptIndex,
      lineName: getAttemptProviderName(attempt, remoteTask),
      status: attempt.status === 'SUCCEEDED' ? 'succeeded' : 'failed',
      errorMessage: attempt.errorMessage || undefined,
    }))
}

function getAttemptProviderName(attempt: RemoteTaskAttempt, remoteTask: RemoteTaskRecord) {
  const requestSnapshot = (attempt.requestSnapshotJson || {}) as JsonObject
  const providerName = typeof requestSnapshot.providerName === 'string' ? requestSnapshot.providerName : null
  if (providerName) return providerName
  if (attempt.status === 'SUCCEEDED' && remoteTask.selectedProviderName) return remoteTask.selectedProviderName
  return attempt.model || remoteTask.selectedProviderName || 'remote-provider'
}

function buildRouteSummaryFromRecord(record: {
  status: string
  statusMessage: string | null
  errorMessage: string | null
  selectedProviderName: string | null
  attempts: Array<{ attemptIndex: number; status: string; errorMessage: string | null; model: string }>
  responseSnapshotJson: Prisma.JsonValue | null
}): RouteSummary {
  const responseSnapshot = (record.responseSnapshotJson || {}) as JsonObject
  const snapshotAttemptedLines = Array.isArray(responseSnapshot.attemptedLines)
    ? responseSnapshot.attemptedLines as RouteSummary['attemptedLines']
    : null

  const attemptedLines = snapshotAttemptedLines || record.attempts
    .filter((attempt) => attempt.status !== 'STARTED')
    .map((attempt) => ({
      lineIndex: attempt.attemptIndex,
      lineName: record.selectedProviderName || attempt.model,
      status: attempt.status === 'SUCCEEDED' ? 'succeeded' : 'failed',
      errorMessage: attempt.errorMessage || undefined,
    }))

  const selectedLine = record.attempts.find((attempt) => attempt.status === 'SUCCEEDED')

  return {
    selectedLineName: record.selectedProviderName || selectedLine?.model || '',
    selectedLineIndex: selectedLine?.attemptIndex || 0,
    switched: (selectedLine?.attemptIndex || 0) > 1,
    attemptedLines,
    userMessage: record.status === 'SUCCEEDED'
      ? (selectedLine && selectedLine.attemptIndex > 1
          ? `第一线路调用失败，已切换到第 ${selectedLine.attemptIndex} 线路（${record.selectedProviderName || selectedLine.model}）并生成成功。`
          : `已通过第一线路（${record.selectedProviderName || selectedLine?.model || ''}）生成成功。`)
      : record.errorMessage || record.statusMessage || '',
  }
}

async function loadReferenceImagesForRemote(referenceImages: StoredReferenceImage[]) {
  return Promise.all(referenceImages.slice(0, 3).map(async (image) => {
    const response = await fetch(image.url, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`Failed to load saved reference image: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return {
      data: Buffer.from(arrayBuffer).toString('base64'),
      mediaType: response.headers.get('content-type') || image.mimeType || 'image/jpeg',
    }
  }))
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
      responseSnapshotJson: toNullableJsonValue(params.responseSnapshot),
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

export async function buildPersistedImageGenerationPayload(params: {
  prompt: string
  originalPrompt: string
  sourcePage: 'amazon' | 'playground'
  billingScene: GenerationBillingScene
  imageType?: string | null
  aspectRatio?: AspectRatio | null
  size: RenderSize
  referenceImages: StoredReferenceImage[]
}): Promise<PersistedImageGenerationPayload> {
  return {
    prompt: params.prompt,
    originalPrompt: params.originalPrompt,
    sourcePage: params.sourcePage,
    billingScene: params.billingScene,
    imageType: params.imageType ?? null,
    aspectRatio: params.aspectRatio ?? null,
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
  aspectRatio?: AspectRatio | null
  size: RenderSize
  referenceImages: StoredReferenceImage[]
}) {
  await ensureSufficientPointsForGenerationByScene(params.userId, params.billingScene)

  const operation = await startAiOperation({
    userId: params.userId,
    kind: 'IMAGE_GENERATION',
    sourcePage: params.sourcePage,
    entryPoint: params.entryApi,
    inputSummary: {
      promptLength: params.prompt.length,
      sourcePage: params.sourcePage,
      billingScene: params.billingScene,
      imageType: params.imageType ?? null,
      aspectRatio: params.aspectRatio ?? null,
      size: params.size,
      referenceImageCount: params.referenceImages.length,
      referenceMediaTypes: params.referenceImages.map((image) => image.mimeType),
    },
    requestSnapshot: {
      prompt: params.prompt,
      originalPrompt: params.originalPrompt,
      sourcePage: params.sourcePage,
      billingScene: params.billingScene,
      imageType: params.imageType ?? null,
      aspectRatio: params.aspectRatio ?? null,
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
    prompt: params.prompt,
    originalPrompt: params.originalPrompt,
    sourcePage: params.sourcePage,
    billingScene: params.billingScene,
    imageType: params.imageType ?? null,
    aspectRatio: params.aspectRatio ?? null,
    size: params.size,
    referenceImages: params.referenceImages,
  })

  const requestRecord = await prisma.imageGenerationRequest.create({
    data: {
      userId: params.userId,
      operationId: operation.id,
      sourcePage: sourcePageToEnum(params.sourcePage),
      entryApi: params.entryApi,
      billingScene: params.billingScene,
      prompt: params.originalPrompt,
      finalPrompt: params.prompt,
      imageType: params.imageType ?? null,
      aspectRatio: params.aspectRatio ?? null,
      size: params.size,
      referenceImageCount: params.referenceImages.length,
      referenceImagesJson: params.referenceImages as unknown as Prisma.InputJsonValue,
      requestPayloadJson: requestPayload as unknown as Prisma.InputJsonValue,
      requestSnapshotJson: requestPayload as unknown as Prisma.InputJsonValue,
      finalUpstreamApiKind: upstreamApiKindFromMode(params.referenceImages.length > 0 ? 'edit' : 'generate'),
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
    const referenceImages = await loadReferenceImagesForRemote(payload.referenceImages || [])
    const remoteTask = await submitRemoteImageTask({
      prompt: payload.prompt,
      imageType: payload.imageType ?? null,
      aspectRatio: payload.aspectRatio ?? null,
      size: payload.size,
      referenceImages,
      metadata: {
        localRequestId: request.id,
        sourcePage: payload.sourcePage,
        billingScene: payload.billingScene,
        imageType: payload.imageType ?? null,
      },
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

async function upsertAttemptForRemote(params: {
  requestId: string
  operationId: string | null
  remoteTask: RemoteTaskRecord
  remoteAttempt: RemoteTaskAttempt
}) {
  const providerName = getAttemptProviderName(params.remoteAttempt, params.remoteTask)
  const existingOperationAttempt = params.operationId
    ? await prisma.aiOperationAttempt.findFirst({
        where: {
          operationId: params.operationId,
          attemptIndex: params.remoteAttempt.attemptIndex,
        },
      })
    : null

  const operationAttempt = params.operationId
    ? existingOperationAttempt
      ? await prisma.aiOperationAttempt.update({
          where: { id: existingOperationAttempt.id },
          data: {
            providerType: 'IMAGE',
            providerId: null,
            providerName,
            baseUrl: params.remoteAttempt.baseUrl || null,
            model: params.remoteAttempt.model || null,
            status: parseAttemptStatus(params.remoteAttempt.status),
            durationMs: params.remoteAttempt.durationMs,
            upstreamApiKind: parseUpstreamApiKind(params.remoteAttempt.upstreamApiKind),
            requestSnapshotJson: toNullableJsonValue(params.remoteAttempt.requestSnapshotJson),
            responseSnapshotJson: toNullableJsonValue(params.remoteAttempt.responseSnapshotJson),
            errorMessage: params.remoteAttempt.errorMessage ?? undefined,
            completedAt: params.remoteAttempt.completedAt ? new Date(params.remoteAttempt.completedAt) : null,
          },
        })
      : await startAiOperationAttempt({
          operationId: params.operationId,
          providerType: 'IMAGE',
          providerId: null,
          providerName,
          baseUrl: params.remoteAttempt.baseUrl || null,
          model: params.remoteAttempt.model || null,
          attemptIndex: params.remoteAttempt.attemptIndex,
          upstreamApiKind: parseUpstreamApiKind(params.remoteAttempt.upstreamApiKind),
          requestSnapshot: params.remoteAttempt.requestSnapshotJson,
        }).then(async (created) => {
          if (params.remoteAttempt.status !== 'STARTED') {
            return completeAiOperationAttempt({
              attemptId: created.id,
              status: parseAttemptStatus(params.remoteAttempt.status),
              responseSnapshot: params.remoteAttempt.responseSnapshotJson,
              errorMessage: params.remoteAttempt.errorMessage ?? undefined,
              completedAt: params.remoteAttempt.completedAt ? new Date(params.remoteAttempt.completedAt) : undefined,
            })
          }
          return prisma.aiOperationAttempt.update({
            where: { id: created.id },
            data: {
              providerName,
              baseUrl: params.remoteAttempt.baseUrl || null,
              model: params.remoteAttempt.model || null,
            },
          })
        })
    : null

  const existingAttempt = await prisma.imageGenerationAttempt.findFirst({
    where: {
      requestId: params.requestId,
      attemptIndex: params.remoteAttempt.attemptIndex,
    },
  })

  const attemptData = {
    operationAttemptId: operationAttempt?.id ?? existingAttempt?.operationAttemptId ?? null,
    providerId: null,
    baseUrl: params.remoteAttempt.baseUrl,
    model: params.remoteAttempt.model,
    status: parseAttemptStatus(params.remoteAttempt.status),
    durationMs: params.remoteAttempt.durationMs,
    errorMessage: params.remoteAttempt.errorMessage,
    upstreamApiKind: parseUpstreamApiKind(params.remoteAttempt.upstreamApiKind),
    requestSnapshotJson: toNullableJsonValue(params.remoteAttempt.requestSnapshotJson),
    responseSnapshotJson: toNullableJsonValue(params.remoteAttempt.responseSnapshotJson),
    startedAt: new Date(params.remoteAttempt.startedAt),
    completedAt: params.remoteAttempt.completedAt ? new Date(params.remoteAttempt.completedAt) : null,
  }

  if (existingAttempt) {
    await prisma.imageGenerationAttempt.update({
      where: { id: existingAttempt.id },
      data: attemptData,
    })
    return
  }

  await prisma.imageGenerationAttempt.create({
    data: {
      requestId: params.requestId,
      attemptIndex: params.remoteAttempt.attemptIndex,
      ...attemptData,
    },
  })
}

async function upsertAssetForRemote(params: {
  requestId: string
  operationId: string | null
  remoteAsset: RemoteTaskRecord['assets'][number]
}) {
  const existingAsset = await prisma.generatedImageAsset.findFirst({
    where: {
      requestId: params.requestId,
      OR: [
        { cosKey: params.remoteAsset.cosKey },
        { cosUrl: params.remoteAsset.cosUrl },
      ],
    },
  })

  const assetData = {
    operationId: params.operationId,
    cosUrl: params.remoteAsset.cosUrl,
    cosKey: params.remoteAsset.cosKey,
    mimeType: params.remoteAsset.mimeType,
    bytes: params.remoteAsset.bytes,
    upstreamSourceUrl: params.remoteAsset.upstreamSourceUrl,
    createdAt: new Date(params.remoteAsset.createdAt),
  }

  if (existingAsset) {
    await prisma.generatedImageAsset.update({
      where: { id: existingAsset.id },
      data: assetData,
    })
    return
  }

  await prisma.generatedImageAsset.create({
    data: {
      requestId: params.requestId,
      ...assetData,
    },
  })
}

export async function syncImageGenerationRequestFromWorker(requestId: string) {
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

  for (const remoteAttempt of remoteTask.attempts) {
    await upsertAttemptForRemote({
      requestId: request.id,
      operationId: request.operationId,
      remoteTask,
      remoteAttempt,
    })
  }

  for (const remoteAsset of remoteTask.assets) {
    await upsertAssetForRemote({
      requestId: request.id,
      operationId: request.operationId,
      remoteAsset,
    })
  }

  const attemptedLines = buildAttemptedLinesFromRemote(remoteTask)
  const nextStatus = parseStatus(remoteTask.status)
  const responseSnapshotJson = {
    ...(remoteTask.responseSnapshotJson || {}),
    attemptedLines,
    remoteRequestId: remoteTask.id,
  }

  const updateData: Prisma.ImageGenerationRequestUpdateInput = {
    status: nextStatus,
    statusMessage: remoteTask.statusMessage,
    errorMessage: remoteTask.errorMessage,
    durationMs: remoteTask.durationMs,
    finalPrompt: remoteTask.finalPrompt ?? request.finalPrompt,
    revisedPrompt: remoteTask.revisedPrompt,
    imageType: remoteTask.imageType,
    size: remoteTask.size,
    aspectRatio: remoteTask.aspectRatio,
    selectedProviderName: remoteTask.selectedProviderName,
    selectedProviderBaseUrl: remoteTask.selectedProviderBaseUrl,
    selectedProviderModel: remoteTask.selectedProviderModel,
    attemptCount: remoteTask.attemptCount,
    responseSnapshotJson: toNullableJsonValue(responseSnapshotJson),
    queuedAt: remoteTask.queuedAt ? new Date(remoteTask.queuedAt) : request.queuedAt,
    startedAt: remoteTask.startedAt ? new Date(remoteTask.startedAt) : request.startedAt,
    completedAt: remoteTask.completedAt ? new Date(remoteTask.completedAt) : request.completedAt,
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
        finalPrompt: remoteTask.finalPrompt ?? request.finalPrompt ?? request.prompt,
        outputSummary: {
          selectedProviderName: remoteTask.selectedProviderName,
          selectedProviderModel: remoteTask.selectedProviderModel,
          attemptCount: remoteTask.attemptCount,
          imageUrl: remoteTask.assets[0]?.cosUrl || null,
        },
        responseSnapshot: responseSnapshotJson,
        completedAt: remoteTask.completedAt ? new Date(remoteTask.completedAt) : undefined,
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
        finalPrompt: remoteTask.finalPrompt ?? request.finalPrompt ?? request.prompt,
        errorMessage: remoteTask.errorMessage || remoteTask.statusMessage || 'Remote image worker failed',
        responseSnapshot: responseSnapshotJson,
        completedAt: remoteTask.completedAt ? new Date(remoteTask.completedAt) : undefined,
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
      assets: {
        orderBy: { createdAt: 'asc' },
      },
      attempts: {
        orderBy: { attemptIndex: 'asc' },
      },
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
      assets: {
        orderBy: { createdAt: 'asc' },
      },
      attempts: {
        orderBy: { attemptIndex: 'asc' },
      },
      pointsLedgerEntry: true,
    },
  })
}

export function buildImageGenerationRouteSummary(record: {
  status: string
  statusMessage: string | null
  errorMessage: string | null
  selectedProviderName: string | null
  attempts: Array<{ attemptIndex: number; status: string; errorMessage: string | null; model: string }>
  responseSnapshotJson: Prisma.JsonValue | null
}) {
  return buildRouteSummaryFromRecord(record)
}
