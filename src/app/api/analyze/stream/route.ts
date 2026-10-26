import { NextRequest } from 'next/server'
import { completeAiOperation, getAiOperationExpiryDate, startAiOperation } from '@/lib/ai-operations'
import { verify1688SelectionToken } from '@/lib/1688-selection-token'
import { requireApiUser } from '@/lib/auth'
import { analyzeProduct } from '@/lib/anthropic'
import { AMAZON_REFERENCE_IMAGE_LIMIT, StoredReferenceImage } from '@/lib/amazon-workflow'
import { ensureSufficientPointsForAnalysisByScene, InsufficientPointsError, saveSuccessfulAnalysisWithCharge } from '@/lib/points'
import { prisma } from '@/lib/prisma'
import { createReferenceImagePayloadsFromFiles, downloadReferenceImageFiles, uploadReferenceImagesForAnalysis } from '@/lib/reference-images'

export const dynamic = 'force-dynamic'

// The browser shows 10% as soon as it starts this request. Keep the server-side
// preflight bounded too, so a malformed or stalled multipart body cannot leave
// the user waiting indefinitely without an operation record or an error.
const FORM_DATA_PARSE_TIMEOUT_MS = 2 * 60 * 1000
// Text providers can take several minutes and a silent stream is easy for
// proxies and browsers to drop. Emit a small event well below common 60s idle
// timeouts so the connection stays alive while the model is working.
const STREAM_HEARTBEAT_INTERVAL_MS = 15 * 1000
// The client owns the analysis id so it can poll for the result even when the
// streaming response never reaches it.
const CLIENT_ANALYSIS_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

type StreamEvent =
  | { type: 'analysis-created'; analysisId: string }
  | { type: 'references-stored'; referenceImages: StoredReferenceImage[] }
  | { type: 'stage'; stage: 'preparing' | 'analyzing' | 'prompting' | 'completed'; label: string; progress: number }
  | { type: 'partial-analysis'; data: Awaited<ReturnType<typeof analyzeProduct>> }
  | { type: 'warning'; message: string }
  | { type: 'heartbeat' }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'done' }

class PreflightError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'PreflightError'
    this.status = status
  }
}

function formatEvent(event: StreamEvent) {
  return `${JSON.stringify(event)}\n`
}

function jsonError(message: string, status: number, analysisId?: string) {
  return new Response(JSON.stringify(analysisId ? { error: message, analysisId } : { error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function parseFormDataWithinTimeout(request: NextRequest) {
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      request.formData(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new PreflightError('上传内容解析超过 2 分钟未完成，请检查网络和图片后重试。', 408))
        }, FORM_DATA_PARSE_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === '网站暂不可用，请稍后再试。') {
    return '网站暂不可用，请稍后再试。'
  }
  return error instanceof Error ? error.message : 'Failed to analyze product'
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return jsonError('Unauthorized', 401)
  }

  let operationId: string | null = null
  let analysisRecordId: string | null = null
  let analysisStartedAt: Date | null = null
  let productName = ''
  let description = ''
  let additionalRequirements = ''
  let category = 'General'
  let targetAudience = 'General consumers'
  let referenceImages: File[] = []
  let source1688OfferId: string | null = null

  // Everything that can fail with a plain HTTP error runs before the stream is
  // created. That way the browser gets a real status code and message instead
  // of a silently dead stream, and the analysis id is known up front.
  try {
    operationId = (await startAiOperation({
      userId: user.id,
      kind: 'ANALYSIS',
      sourcePage: 'amazon',
      entryPoint: '/api/analyze/stream',
      inputSummary: {
        stage: 'preparing',
        detail: '等待解析上传内容',
      },
      requestSnapshot: {
        stage: 'preparing',
      },
      expiresAt: getAiOperationExpiryDate(),
    })).id

    const formData = await parseFormDataWithinTimeout(request)

    productName = String(formData.get('productName') || '')
    description = String(formData.get('description') || '')
    additionalRequirements = String(formData.get('additionalRequirements') || '').trim()
    category = String(formData.get('category') || '') || 'General'
    targetAudience = String(formData.get('targetAudience') || '') || 'General consumers'
    const uploadedReferenceImages = [
      ...formData.getAll('referenceImages'),
      ...(!formData.get('referenceImage') ? [] : [formData.get('referenceImage')]),
    ].filter((item): item is File => item instanceof File)
    const source1688Token = String(formData.get('source1688Token') || '')
    const source1688ImageIndexesValue = String(formData.get('source1688ImageIndexes') || '[]')
    const requestedAnalysisId = String(formData.get('analysisId') || '').trim()
    let importedReferenceImages: File[] = []

    await prisma.aiOperation.update({
      where: { id: operationId },
      data: {
        inputSummaryJson: {
          productName,
          additionalRequirements,
          category,
          targetAudience,
          uploadedReferenceImageCount: uploadedReferenceImages.length,
          referenceSource: source1688Token ? '1688' : 'upload',
          stage: 'preparing',
          detail: source1688Token ? '正在下载 1688 参考图' : '上传内容解析完成',
        },
        requestSnapshotJson: {
          productName,
          description,
          additionalRequirements,
          category,
          targetAudience,
          referenceSource: source1688Token ? '1688' : 'upload',
          uploadedReferenceImages: uploadedReferenceImages.map((image, index) => ({
            index,
            name: image.name,
            mimeType: image.type || 'image/jpeg',
            sizeBytes: image.size,
          })),
        },
      },
    })

    if (source1688Token) {
      const sourceProduct = verify1688SelectionToken(source1688Token, user.id)
      source1688OfferId = sourceProduct.offerId
      let selectedIndexes: number[]
      try {
        const parsedIndexes = JSON.parse(source1688ImageIndexesValue) as unknown
        selectedIndexes = Array.isArray(parsedIndexes)
          ? Array.from(new Set(parsedIndexes.filter((item): item is number => Number.isInteger(item) && item >= 0 && item < sourceProduct.images.length))).slice(0, AMAZON_REFERENCE_IMAGE_LIMIT)
          : []
      } catch {
        selectedIndexes = []
      }
      if (!selectedIndexes.length) throw new PreflightError('请至少选择一张 1688 商品图片。', 400)
      importedReferenceImages = await downloadReferenceImageFiles(
        selectedIndexes.map((index) => sourceProduct.images[index]),
        AMAZON_REFERENCE_IMAGE_LIMIT,
      )
    }

    referenceImages = [...importedReferenceImages, ...uploadedReferenceImages]
      .slice(0, AMAZON_REFERENCE_IMAGE_LIMIT)

    await prisma.aiOperation.update({
      where: { id: operationId },
      data: {
        inputSummaryJson: {
          productName,
          additionalRequirements,
          category,
          targetAudience,
          referenceImageCount: referenceImages.length,
          referenceSource: source1688OfferId ? '1688' : 'upload',
          source1688OfferId,
          stage: 'preparing',
          detail: '参考图已就绪，准备创建分析记录',
        },
        requestSnapshotJson: {
          productName,
          description,
          additionalRequirements,
          category,
          targetAudience,
          referenceSource: source1688OfferId ? '1688' : 'upload',
          source1688OfferId,
          referenceImages: referenceImages.map((image, index) => ({
            index,
            name: image.name,
            mimeType: image.type || 'image/jpeg',
            sizeBytes: image.size,
          })),
        },
      },
    })

    if (!productName || !description || referenceImages.length === 0) {
      throw new PreflightError('Product name, description, and at least one reference image are required', 400)
    }

    await ensureSufficientPointsForAnalysisByScene(user.id, 'amazon-analysis')

    const existingRecord = CLIENT_ANALYSIS_ID_PATTERN.test(requestedAnalysisId)
      ? await prisma.analysisRecord.findFirst({
        where: { id: requestedAnalysisId, userId: user.id },
        select: { id: true, createdAt: true, status: true },
      })
      : null

    // A retried request (proxy resend, double submit) reuses the in-flight
    // record. A finished one keeps its own id so results are never overwritten.
    const analysisRecord = existingRecord && existingRecord.status === 'STARTED'
      ? existingRecord
      : await prisma.analysisRecord.create({
        data: {
          ...(CLIENT_ANALYSIS_ID_PATTERN.test(requestedAnalysisId) && !existingRecord ? { id: requestedAnalysisId } : {}),
          userId: user.id,
          operationId,
          productName,
          description,
          additionalRequirements,
          category,
          targetAudience,
          referenceImageCount: referenceImages.length,
          status: 'STARTED',
          requestSnapshotJson: {
            productName,
            description,
            additionalRequirements,
            category,
            targetAudience,
          },
        },
        select: { id: true, createdAt: true, status: true },
      })

    analysisRecordId = analysisRecord.id
    analysisStartedAt = analysisRecord.createdAt
  } catch (error) {
    const errorMessage = toErrorMessage(error)
    if (operationId) {
      await completeAiOperation({
        operationId,
        status: 'FAILED',
        errorMessage,
        responseSnapshot: { errorMessage },
      }).catch(() => undefined)
    }

    const status = error instanceof PreflightError
      ? error.status
      : error instanceof InsufficientPointsError
        ? 402
        : 500
    console.error('Analyze preflight failed:', error)
    return jsonError(errorMessage, status)
  }

  if (!analysisRecordId) {
    return jsonError('Failed to create analysis record', 500)
  }

  const recordId = analysisRecordId
  const recordStartedAt = analysisStartedAt
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null
      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer)
          heartbeatTimer = null
        }
      }
      const push = (event: StreamEvent) => {
        if (streamClosed) {
          return false
        }

        try {
          controller.enqueue(encoder.encode(formatEvent(event)))
          return true
        } catch (error) {
          streamClosed = true
          stopHeartbeat()
          console.warn('Analyze stream enqueue skipped after close:', error)
          return false
        }
      }
      const closeStream = () => {
        stopHeartbeat()
        if (streamClosed) {
          return
        }

        try {
          controller.close()
        } catch (error) {
          console.warn('Analyze stream close skipped:', error)
        } finally {
          streamClosed = true
        }
      }
      heartbeatTimer = setInterval(() => {
        if (!push({ type: 'heartbeat' })) {
          stopHeartbeat()
        }
      }, STREAM_HEARTBEAT_INTERVAL_MS)

      let analysisPersistedSuccessfully = false
      let operationCompletedSuccessfully = false

      try {
        push({ type: 'analysis-created', analysisId: recordId })

        const storedReferenceImages = await uploadReferenceImagesForAnalysis({
          recordId,
          files: referenceImages,
          maxImages: AMAZON_REFERENCE_IMAGE_LIMIT,
        })
        push({ type: 'references-stored', referenceImages: storedReferenceImages })
        const imagePayloads = await createReferenceImagePayloadsFromFiles(referenceImages, AMAZON_REFERENCE_IMAGE_LIMIT)

        await prisma.analysisRecord.update({
          where: { id: recordId },
          data: {
            referenceImagesJson: storedReferenceImages as any,
          },
        })

        push({
          type: 'stage',
          stage: 'analyzing',
          label: '正在分析商品、参考图和 Amazon 图片规范',
          progress: 45,
        })

        const basicResult = await analyzeProduct({
          productName,
          description,
          additionalRequirements,
          category,
          targetAudience,
          referenceImages: imagePayloads,
          operationId: operationId ?? undefined,
          sourcePage: 'amazon',
          entryPoint: '/api/analyze/stream',
          onTextModelStatus: (event) => {
            if (event.type === 'attempt-started') {
              push({
                type: 'stage',
                stage: 'analyzing',
                label: event.routePhase === 'fallback'
                  ? `正在用 ${event.model} 备用模型分析商品和参考图`
                  : `正在用 ${event.model} 分析商品和参考图`,
                progress: event.routePhase === 'fallback' ? 60 : 45,
              })
              return
            }

            if (event.type === 'provider-switch') {
              push({
                type: 'stage',
                stage: 'analyzing',
                label: `${event.fromModel} 调用失败，正在尝试 ${event.toModel}`,
                progress: 52,
              })
              return
            }

            const fallbackLabel = event.reason === 'primary-timeout'
              ? `${event.fromModel || '主模型'} 分析超时，正在切换 ${event.toModel}`
              : `前序模型均调用失败，正在切换 ${event.toModel}`
            push({
              type: 'stage',
              stage: 'analyzing',
              label: fallbackLabel,
              progress: 58,
            })
            push({
              type: 'warning',
              message: event.reason === 'primary-timeout'
                ? `${event.fromModel || '主模型'} 分析超过 5 分钟，已切换 ${event.toModel} 备用模型。`
                : `前序模型均调用失败，已切换 ${event.toModel} 备用模型。`,
            })
          },
        })

        await saveSuccessfulAnalysisWithCharge({
          userId: user.id,
          analysisId: recordId,
          scene: 'amazon-analysis',
          data: {
            status: 'SUCCEEDED',
            productSummary: basicResult.productSummary,
            analysisJson: basicResult as any,
            responseSnapshotJson: basicResult as any,
            completedAt: new Date(),
            durationMs: recordStartedAt ? Date.now() - recordStartedAt.getTime() : undefined,
          },
        })
        analysisPersistedSuccessfully = true

        push({
          type: 'partial-analysis',
          data: basicResult,
        })

        push({
          type: 'stage',
          stage: 'completed',
          label: '基础商品分析完成',
          progress: 100,
        })
        if (operationId) {
          await completeAiOperation({
            operationId,
            status: 'SUCCEEDED',
            outputSummary: {
              productSummary: basicResult.productSummary,
              sellingPointsCount: basicResult.sellingPoints.length,
              canGeneratePrompts: basicResult.canGeneratePrompts,
            },
            responseSnapshot: basicResult,
          }).catch(() => undefined)
          operationCompletedSuccessfully = true
        }
        push({ type: 'done' })
        closeStream()
      } catch (error) {
        const errorMessage = toErrorMessage(error)
        if (!analysisPersistedSuccessfully) {
          await prisma.analysisRecord.update({
            where: { id: recordId },
            data: {
              status: 'FAILED',
              errorMessage,
              completedAt: new Date(),
              durationMs: recordStartedAt ? Date.now() - recordStartedAt.getTime() : undefined,
            },
          }).catch(() => undefined)
        }
        if (operationId && !operationCompletedSuccessfully) {
          await completeAiOperation({
            operationId,
            status: 'FAILED',
            errorMessage,
            responseSnapshot: {
              errorMessage: error instanceof Error ? error.message : 'Failed to analyze product',
            },
          }).catch(() => undefined)
        }
        console.error('Analyze stream error:', error)
        if (!analysisPersistedSuccessfully) {
          push({
            type: 'error',
            message: errorMessage,
            recoverable: false,
          })
        }
        closeStream()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Analysis-Id': recordId,
      Connection: 'keep-alive',
    },
  })
}
