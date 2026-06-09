import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { buildImageGenerationRouteSummary, getImageGenerationStatusRecord, syncImageGenerationRequestFromWorkerSafely } from '@/lib/image-generation-service'
import { toDisplayPoints } from '@/lib/points-config'
import { isImageGenerationActive } from '@/lib/image-generation'

export async function GET(
  request: NextRequest,
  { params }: { params: { requestId: string } },
) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { requestId } = params

  let record = await getImageGenerationStatusRecord(requestId)

  if (!record) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (record.userId !== user.id && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (isImageGenerationActive(record.status as any) && record.workerJobId) {
    record = (await syncImageGenerationRequestFromWorkerSafely(requestId)) || record
  }

  const active = isImageGenerationActive(record.status as any)
  const routeSummary = buildImageGenerationRouteSummary(record)

  return NextResponse.json({
    requestId: record.id,
    operationId: record.operationId,
    status: record.status,
    statusMessage: record.statusMessage,
    errorMessage: record.errorMessage,
    prompt: record.prompt,
    revisedPrompt: record.revisedPrompt,
    imageUrl: record.assets[0]?.cosUrl || null,
    imageType: record.imageType,
    size: record.size,
    aspectRatio: record.aspectRatio,
    active,
    routeSummary,
    pointsLedgerEntry: record.pointsLedgerEntry
      ? {
          ...record.pointsLedgerEntry,
          pointsDelta: toDisplayPoints(record.pointsLedgerEntry.pointsDelta),
        }
      : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })
}
