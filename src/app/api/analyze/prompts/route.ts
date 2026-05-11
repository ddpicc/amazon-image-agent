import { NextRequest, NextResponse } from 'next/server'
import { generateAllPrompts } from '@/lib/anthropic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { productName, description, category, targetAudience, referenceImages, analysisSummary } = body

    if (!productName || !description) {
      return NextResponse.json(
        { error: 'Product name and description are required' },
        { status: 400 }
      )
    }

    const result = await generateAllPrompts(
      productName,
      description,
      category || 'General',
      targetAudience || 'General consumers',
      referenceImages || [],
      analysisSummary || ''
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('Generate prompts error:', error)
    return NextResponse.json(
      { error: 'Failed to generate prompts' },
      { status: 500 }
    )
  }
}