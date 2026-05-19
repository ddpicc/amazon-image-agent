import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { refineReversePrompt } from '@/lib/anthropic'

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { extractedPrompt, userIntent } = body

    if (!extractedPrompt || !String(extractedPrompt).trim()) {
      return NextResponse.json({ error: 'Extracted prompt is required' }, { status: 400 })
    }

    const result = await refineReversePrompt(String(extractedPrompt), typeof userIntent === 'string' ? userIntent : '')
    return NextResponse.json(result)
  } catch (error) {
    console.error('Reverse prompt refine error:', error)
    return NextResponse.json({ error: 'Failed to refine reverse prompt' }, { status: 500 })
  }
}
