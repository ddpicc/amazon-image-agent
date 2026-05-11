import OpenAI from 'openai'
import { AspectRatio, RenderSize } from '@/lib/image-options'
import { createSignedImageProxyUrl, isProxyableImageUrl } from '@/lib/image-proxy'

interface GenerateImageInput {
  prompt: string
  referenceImages: Array<{
    data: string
    mediaType: string
  }>
  size?: RenderSize
  aspectRatio?: AspectRatio
  requestUrl?: string
}

interface GenerateImageOutput {
  imageUrl: string
  revisedPrompt: string
  size: RenderSize
  aspectRatio?: AspectRatio
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.IMAGE_KEY
  const baseURL = process.env.IMAGE_URL

  if (!apiKey) {
    throw new Error('IMAGE_KEY environment variable is not set')
  }

  if (!baseURL) {
    throw new Error('IMAGE_URL environment variable is not set')
  }

  return new OpenAI({
    apiKey,
    baseURL,
  })
}

function getExtensionFromMediaType(mediaType: string): string {
  if (mediaType === 'image/png') return 'png'
  if (mediaType === 'image/webp') return 'webp'
  if (mediaType === 'image/gif') return 'gif'
  return 'jpg'
}

function toImageFile(
  referenceImage: { data: string; mediaType: string },
  index: number,
): File {
  const imageBuffer = Buffer.from(referenceImage.data, 'base64')
  const extension = getExtensionFromMediaType(referenceImage.mediaType)
  return new File([imageBuffer], `reference-${Date.now()}-${index}.${extension}`, {
    type: referenceImage.mediaType || 'image/jpeg',
  })
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const { prompt, referenceImages, size = '1024x1024', aspectRatio, requestUrl } = input

  if (!referenceImages.length) {
    throw new Error('At least one reference image is required')
  }

  const model = process.env.IMAGE_MODEL
  if (!model) {
    throw new Error('IMAGE_MODEL environment variable is not set')
  }

  const openai = getOpenAIClient()
  const imageFiles = referenceImages.slice(0, 3).map(toImageFile)

  try {
    const response = await openai.images.edit({
      model,
      image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
      prompt,
      n: 1,
      size,
      quality: 'medium',
      response_format: 'url',
    })

    if (!response.data || response.data.length === 0) {
      throw new Error('No image data returned from API')
    }

    const imageData = response.data[0]
    const rawImageUrl = (imageData as any).url || ''
    const imageUrl = requestUrl && rawImageUrl && isProxyableImageUrl(rawImageUrl)
      ? createSignedImageProxyUrl(rawImageUrl, requestUrl)
      : rawImageUrl

    return {
      imageUrl,
      revisedPrompt: (imageData as any).revised_prompt || prompt,
      size,
      aspectRatio,
    }
  } catch (error) {
    console.error('GPT-Image API error:', error)
    throw error
  }
}
