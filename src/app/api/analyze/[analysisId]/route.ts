import { NextRequest, NextResponse } from 'next/server'
import { buildAmazonResumeState } from '@/lib/amazon-workflow'
import { requireApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { analysisId: string } },
) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { analysisId } = params

  const [record, imageRequests] = await Promise.all([
    prisma.analysisRecord.findFirst({
      where: {
        id: analysisId,
        userId: user.id,
      },
    }),
    prisma.imageGenerationRequest.findMany({
      where: {
        analysisRecordId: analysisId,
        userId: user.id,
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    }),
  ])

  if (!record) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
  }

  const resumeState = buildAmazonResumeState(record, { imageRequests })

  return NextResponse.json({
    ...resumeState,
    active: record.status === 'STARTED',
  })
}
