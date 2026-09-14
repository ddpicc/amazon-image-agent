import { NextRequest } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createQueuedImageGenerationRequest, submitQueuedImageGenerationRequest } from '@/lib/image-generation-service'
import {
  AMAZON_DEFAULT_RENDER_SIZE,
  RenderSize,
  isRenderSize,
  PLAYGROUND_REFERENCE_IMAGE_LIMIT,
} from '@/lib/image-options'
import { GenerationBillingScene } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'
import { uploadReferenceImagesForGeneration } from '@/lib/reference-images'
import { AMAZON_REFERENCE_IMAGE_LIMIT } from '@/lib/amazon-workflow'

type StreamEvent =
  | { type: 'status'; message: string }
  | {
      type: 'result'
      data: {
        requestId: string
        imageUrl: string
        revisedPrompt: string
        size: RenderSize
        routeSummary: any
      }
    }
  | { type: 'error'; message: string }
  | { type: 'queued'; data: { requestId: string; operationId: string; status: string; statusMessage: string; model: string; billingCost: number } }

function getValidSize(size: string | null): RenderSize {
  if (isRenderSize(size)) {
    return size
  }

  return '1024x1024'
}

function formatEvent(event: StreamEvent) {
  return `${JSON.stringify(event)}\n`
}

function resolveBillingScene(sourcePage: string, imageType: string): GenerationBillingScene {
  if (sourcePage === 'amazon' && imageType.startsWith('aplus-')) {
    return 'aplus'
  }

  return sourcePage === 'amazon' ? 'amazon' : 'playground'
}

async function resolveOwnedAnalysisRecordId(userId: string, rawAnalysisId: string | null): Promise<string | null> {
  if (!rawAnalysisId) return null
  const owned = await prisma.analysisRecord.findUnique({
    where: { id: rawAnalysisId },
    select: { userId: true },
  })
  return owned && owned.userId === userId ? rawAnalysisId : null
}

function createRequestId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
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

      try {
        const formData = await request.formData()
        const prompt = formData.get('prompt') as string
        const imageType = (formData.get('imageType') as string | null) || ''
        const sourcePage = (formData.get('sourcePage') as string) || 'playground'
        const referenceImageLimit = sourcePage === 'amazon' ? AMAZON_REFERENCE_IMAGE_LIMIT : PLAYGROUND_REFERENCE_IMAGE_LIMIT
        const billingScene = resolveBillingScene(sourcePage, imageType)
        const size = formData.get('size') as string | null
        const model = (formData.get('model') as string | null) || null
        const analysisIdRaw = (formData.get('analysisId') as string | null) || null
        const analysisRecordId = await resolveOwnedAnalysisRecordId(user.id, analysisIdRaw)
        const referenceImageUrlsRaw = formData.get('referenceImageUrls') as string | null
        const referenceImages = [
          ...formData.getAll('referenceImages'),
          ...(!formData.get('referenceImage') ? [] : [formData.get('referenceImage')]),
        ].filter((item): item is File => item instanceof File).slice(0, referenceImageLimit)
        const referenceImageUrls = referenceImageUrlsRaw
          ? JSON.parse(referenceImageUrlsRaw)
            .filter((item: unknown): item is string => typeof item === 'string' && item.length > 0)
            .slice(0, referenceImageLimit)
          : []
        const containsSyntheticPerformer = sourcePage === 'amazon' && formData.get('containsSyntheticPerformer') === 'true'

        if (!prompt?.trim()) {
          push({ type: 'error', message: 'Prompt is required' })
          controller.close()
          return
        }

        const trimmedPrompt = prompt.trim()
        const validSize = sourcePage === 'amazon' ? AMAZON_DEFAULT_RENDER_SIZE : getValidSize(size)
        const upstreamPrompt = trimmedPrompt

        let persistedRefImages: Awaited<ReturnType<typeof uploadReferenceImagesForGeneration>>

        if (referenceImages.length > 0) {
          const tempId = createRequestId()
          persistedRefImages = await uploadReferenceImagesForGeneration({
            requestId: tempId,
            files: referenceImages,
            maxImages: referenceImageLimit,
          })
        } else if (referenceImageUrls.length > 0) {
          persistedRefImages = referenceImageUrls.map((url: string, index: number) => ({
            url,
            key: '',
            mimeType: 'image/jpeg',
            bytes: 0,
            name: `reference-${index + 1}`,
          }))
        } else {
          persistedRefImages = []
        }

        const queued = await createQueuedImageGenerationRequest({
          userId: user.id,
          prompt: upstreamPrompt,
          originalPrompt: trimmedPrompt,
          sourcePage: sourcePage === 'amazon' ? 'amazon' : 'playground',
          billingScene,
          entryApi: '/api/generate/stream',
          imageType: imageType || null,
          containsSyntheticPerformer,
          model,
          size: validSize,
          referenceImages: persistedRefImages,
          analysisRecordId,
        })

        await submitQueuedImageGenerationRequest(queued.requestId)

        push({ type: 'queued', data: {
          requestId: queued.requestId,
          operationId: queued.operationId,
          status: queued.status,
          statusMessage: queued.statusMessage,
          model: queued.model,
          billingCost: queued.billingCost,
        }})
        controller.close()
      } catch (error) {
        push({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to generate image',
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
