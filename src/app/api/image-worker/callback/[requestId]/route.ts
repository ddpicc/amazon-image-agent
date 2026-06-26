import { NextRequest, NextResponse } from 'next/server'
import { verifyImageWorkerCallbackSignature } from '@/lib/crypto'
import { applyRemoteImageTaskToRequest } from '@/lib/image-generation-service'
import type { RemoteTaskRecord } from '@/lib/image-worker-client'

export async function POST(
  request: NextRequest,
  { params }: { params: { requestId: string } },
) {
  const { requestId } = params
  const signature = request.nextUrl.searchParams.get('signature') || ''

  if (!requestId || !signature || !verifyImageWorkerCallbackSignature(requestId, signature)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: RemoteTaskRecord
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid callback payload' }, { status: 400 })
  }

  if (!payload?.id || !payload?.status) {
    return NextResponse.json({ error: 'Invalid callback payload' }, { status: 400 })
  }

  try {
    const updated = await applyRemoteImageTaskToRequest(requestId, payload)
    if (!updated) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      requestId: updated.id,
      remoteRequestId: payload.id,
      status: updated.status,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to apply callback'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
