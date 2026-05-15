import { NextRequest } from 'next/server'
import { requireApiUser } from '@/lib/auth'

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

  return new Response(upstream.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
