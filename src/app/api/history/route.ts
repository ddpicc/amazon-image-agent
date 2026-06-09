import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { syncActiveImageGenerationRequests } from '@/lib/image-generation-service'
import { toDisplayPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [analysisRecords, initialImageRequests] = await Promise.all([
    prisma.analysisRecord.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.imageGenerationRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        assets: true,
        pointsLedgerEntry: true,
      },
    }),
  ])

  const activeRequestIds = initialImageRequests
    .filter((record) => record.workerJobId && (record.status === 'STARTED' || record.status === 'QUEUED' || record.status === 'PROCESSING'))
    .map((record) => record.id)

  if (activeRequestIds.length > 0) {
    await syncActiveImageGenerationRequests(activeRequestIds)
  }

  const imageRequests = activeRequestIds.length > 0
    ? await prisma.imageGenerationRequest.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          assets: true,
          pointsLedgerEntry: true,
        },
      })
    : initialImageRequests

  return NextResponse.json({
    analysisRecords,
    imageRequests: imageRequests.map((record) => ({
      ...record,
      statusMessage: record.statusMessage,
      pointsLedgerEntry: record.pointsLedgerEntry ? {
        ...record.pointsLedgerEntry,
        pointsDelta: toDisplayPoints(record.pointsLedgerEntry.pointsDelta),
      } : null,
    })),
  })
}
