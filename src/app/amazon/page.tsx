import AmazonPageClient from './AmazonPageClient'
import { AmazonResumeState, normalizePromptResults, isBasicAnalysisResult, parseStoredReferenceImages } from '@/lib/amazon-workflow'
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
      initialResumeState = {
        analysisId: record.id,
        productName: record.productName,
        description: record.description,
        category: record.category,
        targetAudience: record.targetAudience,
        status: record.status,
        createdAt: record.createdAt.toISOString(),
        errorMessage: record.errorMessage,
        referenceImages: parseStoredReferenceImages(record.referenceImagesJson),
        basicAnalysisResult: isBasicAnalysisResult(record.analysisJson) ? record.analysisJson : null,
        promptResults: normalizePromptResults(record.promptPlanJson),
        currentBranch: null,
      }
    }
  }

  return <AmazonPageClient initialResumeState={initialResumeState} initialPointsBalance={pointsBalance} />
}
