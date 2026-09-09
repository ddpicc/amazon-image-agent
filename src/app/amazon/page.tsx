import AmazonPageClient from './AmazonPageClient'
import { AmazonResumeState, buildAmazonResumeState } from '@/lib/amazon-workflow'
import { requireNonAdminUser } from '@/lib/auth'
import { listEnabledImageModelOptions } from '@/lib/image-model-config'
import { getUserPointsBalance } from '@/lib/points'
import { prisma } from '@/lib/prisma'

interface AmazonPageProps {
  searchParams?: {
    analysisId?: string
    step?: string
  }
}

export default async function AmazonPage({ searchParams }: AmazonPageProps) {
  const user = await requireNonAdminUser()
  const [pointsBalance, imageModels] = await Promise.all([
    getUserPointsBalance(user.id),
    listEnabledImageModelOptions(),
  ])
  const analysisId = searchParams?.analysisId
  let initialResumeState: AmazonResumeState | null = null

  if (analysisId) {
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

    if (record) {
      initialResumeState = buildAmazonResumeState(record, { imageRequests })
    }
  }

  return <AmazonPageClient initialResumeState={initialResumeState} initialPointsBalance={pointsBalance} imageModels={imageModels} />
}
