import { NextRequest, NextResponse } from 'next/server'
import { analyzeProduct } from '@/lib/anthropic'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const productName = formData.get('productName') as string
    const description = formData.get('description') as string
    const category = formData.get('category') as string
    const targetAudience = formData.get('targetAudience') as string
    const referenceImages = [
      ...formData.getAll('referenceImages'),
      ...(!formData.get('referenceImage') ? [] : [formData.get('referenceImage')]),
    ].filter((item): item is File => item instanceof File)

    if (!productName || !description) {
      return NextResponse.json(
        { error: 'Product name and description are required' },
        { status: 400 }
      )
    }

    const imagePayloads = await Promise.all(
      referenceImages.slice(0, 3).map(async (image) => {
        const arrayBuffer = await image.arrayBuffer()
        return {
          data: Buffer.from(arrayBuffer).toString('base64'),
          mediaType: image.type || 'image/jpeg',
        }
      })
    )

    const result = await analyzeProduct({
      productName,
      description,
      category: category || 'General',
      targetAudience: targetAudience || 'General consumers',
      referenceImages: imagePayloads
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Analyze error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze product' },
      { status: 500 }
    )
  }
}
