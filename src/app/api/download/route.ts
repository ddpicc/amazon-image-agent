import { NextRequest } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { addSyntheticPerformerMetadata } from '@/lib/synthetic-performer-metadata'

function sanitizeFilename(value: string | null) {
  if (!value) return 'download.png'
  return value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'download.png'
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const rawUrl = request.nextUrl.searchParams.get('url')
  const filename = sanitizeFilename(request.nextUrl.searchParams.get('filename'))
  const requestId = request.nextUrl.searchParams.get('requestId')

  if (!rawUrl) {
    return new Response(JSON.stringify({ error: 'Missing url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return new Response(JSON.stringify({ error: 'Unsupported protocol' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const upstream = await fetch(parsedUrl.toString(), {
    cache: 'no-store',
  })

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `Failed to fetch file: ${upstream.status}` }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream'

  if (!requestId) {
    return new Response(JSON.stringify({ error: 'Missing image generation request id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const generation = await prisma.imageGenerationRequest.findUnique({
    where: { id: requestId },
    select: { userId: true, imageUrl: true, containsSyntheticPerformer: true },
  })

  if (!generation || generation.userId !== user.id || generation.imageUrl !== rawUrl) {
    return new Response(JSON.stringify({ error: 'Image generation request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (generation.containsSyntheticPerformer) {
    const imageWithMetadata = addSyntheticPerformerMetadata(Buffer.from(await upstream.arrayBuffer()))
    if (!imageWithMetadata) {
      return new Response(JSON.stringify({ error: '此图片格式暂不支持写入合规元数据，请联系支持。' }), {
        status: 415,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(new Uint8Array(imageWithMetadata), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
