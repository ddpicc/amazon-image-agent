import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { generateImage } from '@/lib/openai'
import { AspectRatio, RenderSize, SIZE_OPTIONS, getDefaultSizeForAspectRatio, getSizesForAspectRatio } from '@/lib/image-options'
import { createReferenceImagePayloadsFromFiles, createReferenceImagePayloadsFromUrls } from '@/lib/reference-images'

function isRenderSize(value: string | null): value is RenderSize {
  return SIZE_OPTIONS.some((option) => option.value === value)
}

function getValidSize(size: string | null, aspectRatio: AspectRatio): RenderSize {
  if (isRenderSize(size) && getSizesForAspectRatio(aspectRatio).some((option) => option.value === size)) {
    return size
  }

  return getDefaultSizeForAspectRatio(aspectRatio)
}

function createRequestId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
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
    const imageType = formData.get('imageType') as string
    const sourcePage = (formData.get('sourcePage') as string) || 'playground'
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

    const validSize = getValidSize(size, aspectRatio)
    const trimmedPrompt = prompt.trim()

    console.info('[api/generate] request received', {
      requestId,
      imageType: imageType || 'unknown',
      aspectRatio,
      requestedSize: size || 'unspecified',
      resolvedSize: validSize,
      promptLength: trimmedPrompt.length,
      referenceImageCount: referenceImages.length || referenceImageUrls.length,
      referenceMediaTypes: referenceImages.map((image) => image.type || 'image/jpeg'),
    })

    const imagePayloads = referenceImages.length > 0
      ? await createReferenceImagePayloadsFromFiles(referenceImages)
      : await createReferenceImagePayloadsFromUrls(referenceImageUrls)

    console.info('[api/generate] upstream dispatch', {
      requestId,
      imageType: imageType || 'unknown',
      mode: imagePayloads.length > 0 ? 'edit' : 'generate',
      payloadImageCount: imagePayloads.length,
    })

    const result = await generateImage(
      {
        userId: user.id,
        prompt: trimmedPrompt,
        referenceImages: imagePayloads,
        size: validSize,
        aspectRatio,
        imageType: imageType || undefined,
        sourcePage: sourcePage === 'amazon' ? 'amazon' : 'playground',
        entryApi: '/api/generate',
      },
    )

    console.info('[api/generate] request succeeded', {
      requestId,
      imageType: imageType || 'unknown',
      returnedImageUrlKind: result.imageUrl.startsWith('data:') ? 'data-url' : (result.imageUrl ? 'url' : 'empty'),
      revisedPromptLength: result.revisedPrompt.length,
    })

    return NextResponse.json({
      ...result,
      imageUrl: result.imageUrl,
      imageType,
      aspectRatio,
      size: validSize,
    })
  } catch (error) {
    const routeSummary = typeof error === 'object' && error && 'routeSummary' in error
      ? (error as any).routeSummary
      : null
    console.error('[api/generate] request failed', {
      requestId,
      error,
    })
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate image',
        routeSummary,
      },
      { status: 500 }
    )
  }
}
