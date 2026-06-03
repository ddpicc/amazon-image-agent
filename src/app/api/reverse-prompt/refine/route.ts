import { NextRequest, NextResponse } from 'next/server'
import { startAiOperation, completeAiOperation, getAiOperationExpiryDate } from '@/lib/ai-operations'
import { requireApiUser } from '@/lib/auth'
import { refineReversePrompt } from '@/lib/anthropic'

export async function POST(request: NextRequest) {
  let operationId: string | null = null

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

    operationId = (await startAiOperation({
      userId: user.id,
      kind: 'REVERSE_PROMPT_REFINE',
      sourcePage: 'reverse-prompt',
      entryPoint: '/api/reverse-prompt/refine',
      inputSummary: {
        extractedPromptLength: String(extractedPrompt).trim().length,
        userIntentLength: typeof userIntent === 'string' ? userIntent.trim().length : 0,
      },
      requestSnapshot: {
        extractedPrompt: String(extractedPrompt),
        userIntent: typeof userIntent === 'string' ? userIntent : '',
      },
      expiresAt: getAiOperationExpiryDate(),
    })).id

    const result = await refineReversePrompt(
      String(extractedPrompt),
      typeof userIntent === 'string' ? userIntent : '',
      operationId ?? undefined,
    )

    if (operationId) {
      await completeAiOperation({
        operationId,
        status: 'SUCCEEDED',
        finalPrompt: result.finalPrompt,
        outputSummary: {
          finalPromptLength: result.finalPrompt.length,
        },
        responseSnapshot: result,
      }).catch(() => undefined)
    }

    return NextResponse.json(result)
  } catch (error) {
    if (operationId) {
      await completeAiOperation({
        operationId,
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Failed to refine reverse prompt',
        responseSnapshot: {
          errorMessage: error instanceof Error ? error.message : 'Failed to refine reverse prompt',
        },
      }).catch(() => undefined)
    }

    console.error('Reverse prompt refine error:', error)
    return NextResponse.json({ error: 'Failed to refine reverse prompt' }, { status: 500 })
  }
}
