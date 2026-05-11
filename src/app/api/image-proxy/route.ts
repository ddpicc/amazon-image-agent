import { NextRequest, NextResponse } from 'next/server'
import { isProxyableImageUrl, verifySignedImageProxyUrl } from '@/lib/image-proxy'

export async function GET(request: NextRequest) {
  const sourceUrl = request.nextUrl.searchParams.get('url') || ''
  const expires = request.nextUrl.searchParams.get('expires') || ''
  const signature = request.nextUrl.searchParams.get('signature') || ''

  if (!isProxyableImageUrl(sourceUrl)) {
    return new NextResponse('Invalid image URL', { status: 400 })
  }

  if (!verifySignedImageProxyUrl(sourceUrl, expires, signature)) {
    return new NextResponse('Invalid or expired signature', { status: 403 })
  }

  try {
    const upstreamResponse = await fetch(sourceUrl, {
      cache: 'no-store',
    })

    if (!upstreamResponse.ok) {
      return new NextResponse('Failed to fetch upstream image', { status: 502 })
    }

    const contentType = upstreamResponse.headers.get('content-type') || 'image/png'
    const cacheControl = upstreamResponse.headers.get('cache-control') || 'public, max-age=3600'
    const arrayBuffer = await upstreamResponse.arrayBuffer()

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
      },
    })
  } catch (error) {
    console.error('Image proxy error:', error)
    return new NextResponse('Failed to proxy image', { status: 500 })
  }
}
