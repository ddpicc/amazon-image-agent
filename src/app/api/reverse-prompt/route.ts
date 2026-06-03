import { NextRequest } from 'next/server'
import { startAiOperation, completeAiOperation, getAiOperationExpiryDate } from '@/lib/ai-operations'
import { requireApiUser } from '@/lib/auth'
import { createReferenceImagePayloadsFromFiles } from '@/lib/reference-images'
import { analyzeImageToPrompt } from '@/lib/reverse-prompt'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let operationId: string | null = null

  try {
    const formData = await request.formData()
    const sourceImage = formData.get('sourceImage')

    if (!(sourceImage instanceof File)) {
      return new Response(JSON.stringify({ error: 'Source image is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    operationId = (await startAiOperation({
      userId: user.id,
      kind: 'REVERSE_PROMPT_ANALYZE',
      sourcePage: 'reverse-prompt',
      entryPoint: '/api/reverse-prompt',
      inputSummary: {
        fileName: sourceImage.name,
        mimeType: sourceImage.type || 'image/jpeg',
        sizeBytes: sourceImage.size,
      },
      requestSnapshot: {
        fileName: sourceImage.name,
        mimeType: sourceImage.type || 'image/jpeg',
        sizeBytes: sourceImage.size,
      },
      expiresAt: getAiOperationExpiryDate(),
    })).id

    const [image] = await createReferenceImagePayloadsFromFiles([sourceImage])
    const result = await analyzeImageToPrompt({
      image,
      operationId: operationId ?? undefined,
    })

    if (operationId) {
      await completeAiOperation({
        operationId,
        status: 'SUCCEEDED',
        finalPrompt: result.prompt,
        outputSummary: {
          summary: result.summary,
        },
        responseSnapshot: result,
      }).catch(() => undefined)
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    if (operationId) {
      await completeAiOperation({
        operationId,
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Failed to analyze image',
        responseSnapshot: {
          errorMessage: error instanceof Error ? error.message : 'Failed to analyze image',
        },
      }).catch(() => undefined)
    }

    console.error('Reverse prompt error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to analyze image' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
