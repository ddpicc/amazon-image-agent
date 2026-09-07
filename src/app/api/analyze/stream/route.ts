import { NextRequest } from 'next/server'
import { completeAiOperation, getAiOperationExpiryDate, startAiOperation } from '@/lib/ai-operations'
import { requireApiUser } from '@/lib/auth'
import { analyzeProduct } from '@/lib/anthropic'
import { AMAZON_REFERENCE_IMAGE_LIMIT, StoredReferenceImage } from '@/lib/amazon-workflow'
import { ensureSufficientPointsForAnalysisByScene, saveSuccessfulAnalysisWithCharge } from '@/lib/points'
import { prisma } from '@/lib/prisma'
import { createReferenceImagePayloadsFromFiles, uploadReferenceImagesForAnalysis } from '@/lib/reference-images'

export const dynamic = 'force-dynamic'

type StreamEvent =
  | { type: 'analysis-created'; analysisId: string }
  | { type: 'stage'; stage: 'preparing' | 'analyzing' | 'prompting' | 'completed'; label: string; progress: number }
  | { type: 'partial-analysis'; data: Awaited<ReturnType<typeof analyzeProduct>> }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'done' }

function formatEvent(event: StreamEvent) {
  return `${JSON.stringify(event)}\n`
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false
      const push = (event: StreamEvent) => {
        if (streamClosed) {
          return false
        }

        try {
          controller.enqueue(encoder.encode(formatEvent(event)))
          return true
        } catch (error) {
          streamClosed = true
          console.warn('Analyze stream enqueue skipped after close:', error)
          return false
        }
      }
      const closeStream = () => {
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
      let analysisRecordId: string | null = null
      let operationId: string | null = null
      let storedReferenceImages: StoredReferenceImage[] = []
      let analysisStartedAt: Date | null = null
      let analysisPersistedSuccessfully = false
      let operationCompletedSuccessfully = false

      try {
        push({
          type: 'stage',
          stage: 'preparing',
          label: '正在读取商品信息与参考图',
          progress: 10,
        })

        const formData = await request.formData()

        const productName = formData.get('productName') as string
        const description = formData.get('description') as string
        const additionalRequirements = ((formData.get('additionalRequirements') as string) || '').trim()
        const category = formData.get('category') as string
        const targetAudience = formData.get('targetAudience') as string
        const referenceImages = [
          ...formData.getAll('referenceImages'),
          ...(!formData.get('referenceImage') ? [] : [formData.get('referenceImage')]),
        ].filter((item): item is File => item instanceof File)

        operationId = (await startAiOperation({
          userId: user.id,
          kind: 'ANALYSIS',
          sourcePage: 'amazon',
          entryPoint: '/api/analyze/stream',
          inputSummary: {
            productName,
            additionalRequirements,
            category: category || 'General',
            targetAudience: targetAudience || 'General consumers',
            referenceImageCount: referenceImages.length,
          },
          requestSnapshot: {
            productName,
            description,
            additionalRequirements,
            category: category || 'General',
            targetAudience: targetAudience || 'General consumers',
            referenceImages: referenceImages.map((image, index) => ({
              index,
              name: image.name,
              mimeType: image.type || 'image/jpeg',
              sizeBytes: image.size,
            })),
          },
          expiresAt: getAiOperationExpiryDate(),
        })).id

        if (!productName || !description || referenceImages.length === 0) {
          if (operationId) {
            await completeAiOperation({
              operationId,
              status: 'FAILED',
              errorMessage: 'Product name, description, and at least one reference image are required',
              responseSnapshot: {
                errorMessage: 'Product name, description, and at least one reference image are required',
              },
            }).catch(() => undefined)
          }
          push({
            type: 'error',
            message: 'Product name, description, and at least one reference image are required',
            recoverable: false,
          })
          closeStream()
          return
        }

        await ensureSufficientPointsForAnalysisByScene(user.id, 'amazon-analysis')

        const analysisRecord = await prisma.analysisRecord.create({
          data: {
            userId: user.id,
            operationId,
            productName,
            description,
            additionalRequirements,
            category: category || 'General',
            targetAudience: targetAudience || 'General consumers',
            referenceImageCount: referenceImages.length,
            status: 'STARTED',
            requestSnapshotJson: {
              productName,
              description,
              additionalRequirements,
              category: category || 'General',
              targetAudience: targetAudience || 'General consumers',
            },
          },
        })
        analysisRecordId = analysisRecord.id
        analysisStartedAt = analysisRecord.createdAt
        push({
          type: 'analysis-created',
          analysisId: analysisRecord.id,
        })
        storedReferenceImages = await uploadReferenceImagesForAnalysis({
          recordId: analysisRecord.id,
          files: referenceImages,
          maxImages: AMAZON_REFERENCE_IMAGE_LIMIT,
        })
        const imagePayloads = await createReferenceImagePayloadsFromFiles(referenceImages, AMAZON_REFERENCE_IMAGE_LIMIT)

        await prisma.analysisRecord.update({
          where: { id: analysisRecord.id },
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
          category: category || 'General',
          targetAudience: targetAudience || 'General consumers',
          referenceImages: imagePayloads,
          operationId: operationId ?? undefined,
          sourcePage: 'amazon',
          entryPoint: '/api/analyze/stream',
        })

        await saveSuccessfulAnalysisWithCharge({
          userId: user.id,
          analysisId: analysisRecord.id,
          scene: 'amazon-analysis',
          data: {
            status: 'SUCCEEDED',
            productSummary: basicResult.productSummary,
            analysisJson: basicResult as any,
            responseSnapshotJson: basicResult as any,
            completedAt: new Date(),
            durationMs: analysisStartedAt ? Date.now() - analysisStartedAt.getTime() : undefined,
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
          label: '分析完成，正在准备 Amazon 图组 Prompt',
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
        const errorMessage = error instanceof Error && error.message === '网站暂不可用，请稍后再试。'
          ? '网站暂不可用，请稍后再试。'
          : error instanceof Error
            ? error.message
            : 'Failed to analyze product'
        if (analysisRecordId && !analysisPersistedSuccessfully) {
          await prisma.analysisRecord.update({
            where: { id: analysisRecordId },
            data: {
              status: 'FAILED',
              errorMessage,
              completedAt: new Date(),
              durationMs: analysisStartedAt ? Date.now() - analysisStartedAt.getTime() : undefined,
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
      Connection: 'keep-alive',
    },
  })
}
