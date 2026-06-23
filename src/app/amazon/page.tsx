import AmazonPageClient from './AmazonPageClient'
import { AmazonResumeState, buildAmazonResumeState } from '@/lib/amazon-workflow'
import { requireNonAdminUser } from '@/lib/auth'
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
  const pointsBalance = await getUserPointsBalance(user.id)
  const analysisId = searchParams?.analysisId
  let initialResumeState: AmazonResumeState | null = null

  if (analysisId) {
    const record = await prisma.analysisRecord.findFirst({
      where: {
        id: analysisId,
        userId: user.id,
      },
    })

    if (record) {
      initialResumeState = buildAmazonResumeState(record)
    }
  }

  return <AmazonPageClient initialResumeState={initialResumeState} initialPointsBalance={pointsBalance} />
}
