import { NextRequest } from 'next/server'
import { completeAiOperation, getAiOperationExpiryDate, startAiOperation } from '@/lib/ai-operations'
import { requireApiUser } from '@/lib/auth'
import { analyzeProduct } from '@/lib/anthropic'
import { StoredReferenceImage } from '@/lib/amazon-workflow'
import { prisma } from '@/lib/prisma'
import { createReferenceImagePayloadsFromFiles, uploadReferenceImagesForAnalysis } from '@/lib/reference-images'

export const dynamic = 'force-dynamic'

type StreamEvent =
  | { type: 'analysis-created'; analysisId: string }
  | { type: 'stage'; stage: 'preparing' | 'analyzing' | 'completed'; label: string; progress: number }
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
      const push = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(formatEvent(event)))
      }
      let analysisRecordId: string | null = null
      let operationId: string | null = null
      let storedReferenceImages: StoredReferenceImage[] = []
      let analysisStartedAt: Date | null = null

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
            category: category || 'General',
            targetAudience: targetAudience || 'General consumers',
            referenceImageCount: referenceImages.length,
          },
          requestSnapshot: {
            productName,
            description,
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

        if (!productName || !description) {
          if (operationId) {
            await completeAiOperation({
              operationId,
              status: 'FAILED',
              errorMessage: 'Product name and description are required',
              responseSnapshot: {
                errorMessage: 'Product name and description are required',
              },
            }).catch(() => undefined)
          }
          push({
            type: 'error',
            message: 'Product name and description are required',
            recoverable: false,
          })
          controller.close()
          return
        }

        const analysisRecord = await prisma.analysisRecord.create({
          data: {
            userId: user.id,
            operationId,
            productName,
            description,
            category: category || 'General',
            targetAudience: targetAudience || 'General consumers',
            referenceImageCount: referenceImages.length,
            status: 'STARTED',
            requestSnapshotJson: {
              productName,
              description,
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
        })
        const imagePayloads = await createReferenceImagePayloadsFromFiles(referenceImages)

        await prisma.analysisRecord.update({
          where: { id: analysisRecord.id },
          data: {
            referenceImagesJson: storedReferenceImages as any,
          },
        })

        push({
          type: 'stage',
          stage: 'analyzing',
          label: '正在分析商品卖点、参考图和 Amazon 规范',
          progress: 45,
        })

        const basicResult = await analyzeProduct({
          productName,
          description,
          category: category || 'General',
          targetAudience: targetAudience || 'General consumers',
          referenceImages: imagePayloads,
          operationId: operationId ?? undefined,
          sourcePage: 'amazon',
          entryPoint: '/api/analyze/stream',
        })

        await prisma.analysisRecord.update({
          where: { id: analysisRecord.id },
          data: {
            status: 'SUCCEEDED',
            productSummary: basicResult.productSummary,
            analysisJson: basicResult as any,
            responseSnapshotJson: basicResult as any,
            completedAt: new Date(),
            durationMs: analysisStartedAt ? Date.now() - analysisStartedAt.getTime() : undefined,
          },
        })

        push({
          type: 'partial-analysis',
          data: basicResult,
        })

        push({
          type: 'stage',
          stage: 'completed',
          label: '分析完成，可以进入下一步选择 Prompt 分支',
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
        }
        push({ type: 'done' })
        controller.close()
      } catch (error) {
        const errorMessage = error instanceof Error && error.message === '网站暂不可用，请稍后再试。'
          ? '网站暂不可用，请稍后再试。'
          : error instanceof Error
            ? error.message
            : 'Failed to analyze product'
        if (analysisRecordId) {
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
        if (operationId) {
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
        push({
          type: 'error',
          message: errorMessage,
          recoverable: false,
        })
        controller.close()
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
