import AmazonPageClient from './AmazonPageClient'
import { AmazonResumeState, BasicAnalysisResult, PromptGenerationResult, StoredReferenceImage } from '@/lib/amazon-workflow'
import { requireUser } from '@/lib/auth'
import { getUserPointsBalance } from '@/lib/points'
import { prisma } from '@/lib/prisma'

interface AmazonPageProps {
  searchParams?: {
    analysisId?: string
    step?: string
  }
}

export default async function AmazonPage({ searchParams }: AmazonPageProps) {
  const user = await requireUser()
  const pointsBalance = await getUserPointsBalance(user.id)
  const analysisId = searchParams?.analysisId
  const requestedStep = searchParams?.step === 'generate' ? 'generate' : 'analysis'
  let initialResumeState: AmazonResumeState | null = null

  if (analysisId) {
    const record = await prisma.analysisRecord.findFirst({
      where: {
        id: analysisId,
        userId: user.id,
      },
    })

    if (record) {
      initialResumeState = {
        analysisId: record.id,
        productName: record.productName,
        description: record.description,
        category: record.category,
        targetAudience: record.targetAudience,
        status: record.status,
        createdAt: record.createdAt.toISOString(),
        errorMessage: record.errorMessage,
        referenceImages: (record.referenceImagesJson as StoredReferenceImage[] | null) || [],
        basicAnalysisResult: (record.analysisJson as BasicAnalysisResult | null) || null,
        promptGenerationResult: (record.promptPlanJson as PromptGenerationResult | null) || null,
      }
    }
  }

  return <AmazonPageClient initialResumeState={initialResumeState} initialStep={requestedStep} initialPointsBalance={pointsBalance} />
}
