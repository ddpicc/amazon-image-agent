import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [analysisRecords, imageRequests] = await Promise.all([
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

  return NextResponse.json({
    analysisRecords,
    imageRequests,
  })
}
