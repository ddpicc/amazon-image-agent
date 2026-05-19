import { NextRequest } from 'next/server'
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

  try {
    const formData = await request.formData()
    const sourceImage = formData.get('sourceImage')

    if (!(sourceImage instanceof File)) {
      return new Response(JSON.stringify({ error: 'Source image is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const [image] = await createReferenceImagePayloadsFromFiles([sourceImage])
    const result = await analyzeImageToPrompt({ image })

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Reverse prompt error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to analyze image' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
