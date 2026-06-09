import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createQueuedImageGenerationRequest, submitQueuedImageGenerationRequest } from '@/lib/image-generation-service'
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
import { uploadReferenceImagesForGeneration } from '@/lib/reference-images'

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

function createRequestId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function resolveBillingScene(sourcePage: string, rawBillingScene: string | null): GenerationBillingScene {
  if (rawBillingScene === 'amazon' || rawBillingScene === 'aplus' || rawBillingScene === 'reverse-prompt' || rawBillingScene === 'playground') {
    return rawBillingScene
  }

  return sourcePage === 'amazon' ? 'amazon' : 'playground'
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId()

  try {
    const user = await requireApiUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
      console.warn('[api/generate] rejected request', {
        requestId,
        reason: 'missing_prompt',
      })
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      )
    }

    const trimmedPrompt = prompt.trim()
    const validSize = isAPlus ? HIDDEN_APLUS_RENDER_SIZE : getValidSize(size, aspectRatio)
    const upstreamPrompt = isAPlus ? appendHiddenAPlusSizeRequirement(trimmedPrompt) : trimmedPrompt

    console.info('[api/generate] upstream dispatch', {
      requestId,
      imageType: imageType || 'unknown',
      mode: (referenceImages.length > 0 || referenceImageUrls.length > 0) ? 'edit' : 'generate',
      payloadImageCount: referenceImages.length || referenceImageUrls.length,
    })

    let persistedRefImages: Awaited<ReturnType<typeof uploadReferenceImagesForGeneration>>

    if (referenceImages.length > 0) {
      const tempId = createRequestId()
      persistedRefImages = await uploadReferenceImagesForGeneration({
        requestId: tempId,
        files: referenceImages,
      })
    } else if (referenceImageUrls.length > 0) {
      persistedRefImages = referenceImageUrls.slice(0, 3).map((url: string, index: number) => ({
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
      entryApi: '/api/generate',
      imageType: imageType || null,
      aspectRatio,
      size: validSize,
      referenceImages: persistedRefImages,
    })

    await submitQueuedImageGenerationRequest(queued.requestId)

    return NextResponse.json({
      requestId: queued.requestId,
      operationId: queued.operationId,
      status: queued.status,
      statusMessage: queued.statusMessage,
      imageType,
      aspectRatio,
      size: validSize,
      revisedPrompt: isAPlus ? trimmedPrompt : stripHiddenAPlusSizeRequirement(trimmedPrompt),
    }, { status: 202 })
  } catch (error) {
    console.error('[api/generate] request failed', {
      requestId,
      error,
    })
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate image',
      },
      { status: 500 }
    )
  }
}
