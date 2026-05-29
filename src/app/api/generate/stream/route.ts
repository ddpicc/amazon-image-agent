import { NextRequest } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { generateImage } from '@/lib/openai'
import {
  appendHiddenAPlusSizeRequirement,
  AspectRatio,
  HIDDEN_APLUS_RENDER_SIZE,
  RenderSize,
  SIZE_OPTIONS,
  stripHiddenAPlusSizeRequirement,
  getDefaultSizeForAspectRatio,
  getSizesForAspectRatio,
} from '@/lib/image-options'
import { GenerationBillingScene } from '@/lib/points-config'
import { createReferenceImagePayloadsFromFiles, createReferenceImagePayloadsFromUrls } from '@/lib/reference-images'

type StreamEvent =
  | { type: 'status'; message: string }
  | {
      type: 'result'
      data: {
        requestId: string
        imageUrl: string
        revisedPrompt: string
        size: RenderSize
        aspectRatio?: AspectRatio
        routeSummary: any
      }
    }
  | { type: 'error'; message: string }

function isRenderSize(value: string | null): value is RenderSize {
  return SIZE_OPTIONS.some((option) => option.value === value)
}

function getValidSize(size: string | null, aspectRatio: AspectRatio): RenderSize {
  if (size === HIDDEN_APLUS_RENDER_SIZE) {
    return HIDDEN_APLUS_RENDER_SIZE
  }

  if (size === '1024x640') {
    return '1024x640'
  }

  if (isRenderSize(size) && getSizesForAspectRatio(aspectRatio).some((option) => option.value === size)) {
    return size
  }

  return getDefaultSizeForAspectRatio(aspectRatio)
}

function formatEvent(event: StreamEvent) {
  return `${JSON.stringify(event)}\n`
}

function resolveBillingScene(sourcePage: string, rawBillingScene: string | null): GenerationBillingScene {
  if (rawBillingScene === 'amazon' || rawBillingScene === 'aplus' || rawBillingScene === 'reverse-prompt' || rawBillingScene === 'playground') {
    return rawBillingScene
  }

  return sourcePage === 'amazon' ? 'amazon' : 'playground'
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
        const billingScene = resolveBillingScene(sourcePage, formData.get('billingScene') as string | null)
        const aspectRatio = (formData.get('aspectRatio') as AspectRatio | null) || '1:1'
        const size = formData.get('size') as string | null
        const referenceImageUrlsRaw = formData.get('referenceImageUrls') as string | null
        const referenceImages = [
          ...formData.getAll('referenceImages'),
          ...(!formData.get('referenceImage') ? [] : [formData.get('referenceImage')]),
        ].filter((item): item is File => item instanceof File)
        const referenceImageUrls = referenceImageUrlsRaw
          ? JSON.parse(referenceImageUrlsRaw).filter((item: unknown): item is string => typeof item === 'string' && item.length > 0)
          : []
        const isAPlus = sourcePage === 'amazon' && imageType.startsWith('aplus-')

        if (!prompt?.trim()) {
          push({ type: 'error', message: 'Prompt is required' })
          controller.close()
          return
        }

        const trimmedPrompt = prompt.trim()
        const validSize = isAPlus ? HIDDEN_APLUS_RENDER_SIZE : getValidSize(size, aspectRatio)
        const upstreamPrompt = isAPlus ? appendHiddenAPlusSizeRequirement(trimmedPrompt) : trimmedPrompt
        const imagePayloads = referenceImages.length > 0
          ? await createReferenceImagePayloadsFromFiles(referenceImages)
          : await createReferenceImagePayloadsFromUrls(referenceImageUrls)

        const result = await generateImage({
          userId: user.id,
          prompt: upstreamPrompt,
          referenceImages: imagePayloads,
          size: validSize,
          aspectRatio,
          imageType: imageType || undefined,
          sourcePage: sourcePage === 'amazon' ? 'amazon' : 'playground',
          billingScene,
          entryApi: '/api/generate/stream',
          onStatus: async (message) => {
            push({ type: 'status', message })
          },
        })

        push({
          type: 'result',
          data: {
            ...result,
            revisedPrompt: isAPlus ? trimmedPrompt : stripHiddenAPlusSizeRequirement(result.revisedPrompt),
          },
        })
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
