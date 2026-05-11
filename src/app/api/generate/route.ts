import { NextRequest, NextResponse } from 'next/server'
import { generateImage } from '@/lib/openai'
import { AspectRatio, RenderSize, SIZE_OPTIONS, getDefaultSizeForAspectRatio, getSizesForAspectRatio } from '@/lib/image-options'

function isRenderSize(value: string | null): value is RenderSize {
  return SIZE_OPTIONS.some((option) => option.value === value)
}

function getValidSize(size: string | null, aspectRatio: AspectRatio): RenderSize {
  if (isRenderSize(size) && getSizesForAspectRatio(aspectRatio).some((option) => option.value === size)) {
    return size
  }

  return getDefaultSizeForAspectRatio(aspectRatio)
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const prompt = formData.get('prompt') as string
    const imageType = formData.get('imageType') as string
    const aspectRatio = (formData.get('aspectRatio') as AspectRatio | null) || '1:1'
    const size = formData.get('size') as string | null
    const referenceImages = [
      ...formData.getAll('referenceImages'),
      ...(!formData.get('referenceImage') ? [] : [formData.get('referenceImage')]),
    ].filter((item): item is File => item instanceof File)

    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      )
    }

    if (!referenceImages.length) {
      return NextResponse.json(
        { error: 'At least one reference image is required' },
        { status: 400 }
      )
    }

    const validSize = getValidSize(size, aspectRatio)

    const imagePayloads = await Promise.all(
      referenceImages.slice(0, 3).map(async (image) => {
        const arrayBuffer = await image.arrayBuffer()
        return {
          data: Buffer.from(arrayBuffer).toString('base64'),
          mediaType: image.type || 'image/jpeg',
        }
      })
    )

    const result = await generateImage({
      prompt: prompt.trim(),
      referenceImages: imagePayloads,
      size: validSize,
      aspectRatio,
    })

    return NextResponse.json({
      ...result,
      imageType,
      aspectRatio,
      size: validSize,
    })
  } catch (error) {
    console.error('Generate error:', error)
    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    )
  }
}
