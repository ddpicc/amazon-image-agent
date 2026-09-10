import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { requireApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const THUMBNAIL_WIDTH = 640
const MAX_SOURCE_BYTES = 25 * 1024 * 1024
const SOURCE_FETCH_TIMEOUT_MS = 30_000

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

export async function GET(
  request: NextRequest,
  { params }: { params: { requestId: string } },
) {
  const user = await requireApiUser(request)
  if (!user) {
    return jsonError('Unauthorized', 401)
  }

  const generation = await prisma.imageGenerationRequest.findUnique({
    where: { id: params.requestId },
    select: {
      userId: true,
      status: true,
      imageUrl: true,
    },
  })

  if (!generation) {
    return jsonError('Image generation request not found', 404)
  }

  if (generation.userId !== user.id && user.role !== 'ADMIN') {
    return jsonError('Forbidden', 403)
  }

  if (generation.status !== 'SUCCEEDED' || !generation.imageUrl) {
    return jsonError('Generated image is not available', 404)
  }

  let sourceUrl: URL
  try {
    sourceUrl = new URL(generation.imageUrl)
  } catch {
    return jsonError('Generated image URL is invalid', 422)
  }

  if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
    return jsonError('Generated image URL protocol is unsupported', 422)
  }

  try {
    const upstream = await fetch(sourceUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
    })

    if (!upstream.ok) {
      return jsonError(`Failed to fetch generated image: ${upstream.status}`, 502)
    }

    const declaredBytes = Number(upstream.headers.get('content-length') || 0)
    if (declaredBytes > MAX_SOURCE_BYTES) {
      return jsonError('Generated image is too large to create a thumbnail', 413)
    }

    const sourceBuffer = Buffer.from(await upstream.arrayBuffer())
    if (sourceBuffer.byteLength > MAX_SOURCE_BYTES) {
      return jsonError('Generated image is too large to create a thumbnail', 413)
    }

    const thumbnail = await sharp(sourceBuffer, {
      failOn: 'warning',
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: THUMBNAIL_WIDTH,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80, effort: 4 })
      .toBuffer()

    return new Response(new Uint8Array(thumbnail), {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(thumbnail.byteLength),
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[generate/thumbnail] failed', {
      requestId: params.requestId,
      error: error instanceof Error ? error.message : error,
    })
    return jsonError('Failed to create generated image thumbnail', 502)
  }
}
