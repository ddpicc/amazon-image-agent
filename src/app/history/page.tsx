import HistoryPageClient, { HistoryPageData } from './HistoryPageClient'
import { requireNonAdminUser } from '@/lib/auth'
import { toDisplayPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'
import { isPromptGenerationComplete, normalizePromptResults } from '@/lib/amazon-workflow'

const ANALYSIS_PAGE_SIZE = 5
const IMAGE_PAGE_SIZE = 12

interface HistoryPageProps {
  searchParams?: {
    analysisPage?: string
    imagePage?: string
  }
}

function normalizePage(value?: string) {
  const parsed = Number.parseInt(value || '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const user = await requireNonAdminUser()
  const requestedAnalysisPage = normalizePage(searchParams?.analysisPage)
  const requestedImagePage = normalizePage(searchParams?.imagePage)

  const [analysisTotal, imageTotal] = await Promise.all([
    prisma.analysisRecord.count({
      where: { userId: user.id },
    }),
    prisma.imageGenerationRequest.count({
      where: { userId: user.id },
    }),
  ])

  const analysisTotalPages = Math.max(1, Math.ceil(analysisTotal / ANALYSIS_PAGE_SIZE))
  const currentAnalysisPage = Math.min(requestedAnalysisPage, analysisTotalPages)
  const analysisSkip = (currentAnalysisPage - 1) * ANALYSIS_PAGE_SIZE

  const imageTotalPages = Math.max(1, Math.ceil(imageTotal / IMAGE_PAGE_SIZE))
  const currentImagePage = Math.min(requestedImagePage, imageTotalPages)
  const imageSkip = (currentImagePage - 1) * IMAGE_PAGE_SIZE

  const [analysisRecords, imageRequests] = await Promise.all([
    prisma.analysisRecord.findMany({
      where: { userId: user.id },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      skip: analysisSkip,
      take: ANALYSIS_PAGE_SIZE,
    }),
    prisma.imageGenerationRequest.findMany({
      where: { userId: user.id },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      skip: imageSkip,
      take: IMAGE_PAGE_SIZE,
      include: {
        pointsLedgerEntry: true,
      },
    }),
  ])
  type AnalysisRecordItem = (typeof analysisRecords)[number]
  type ImageRequestItem = (typeof imageRequests)[number]

  const initialData: HistoryPageData = {
    analysisRecords: {
      items: analysisRecords.map((record: AnalysisRecordItem) => ({
        ...record,
        canResumeToPromptPage: isPromptGenerationComplete(normalizePromptResults(record.promptPlanJson).amazonSet),
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      })),
      page: currentAnalysisPage,
      pageSize: ANALYSIS_PAGE_SIZE,
      total: analysisTotal,
      totalPages: analysisTotalPages,
      hasNextPage: currentAnalysisPage < analysisTotalPages,
      hasPreviousPage: currentAnalysisPage > 1,
    },
    imageRequests: {
      items: imageRequests.map((record: ImageRequestItem) => ({
        ...record,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        pointsLedgerEntry: record.pointsLedgerEntry ? {
          ...record.pointsLedgerEntry,
          pointsDelta: toDisplayPoints(record.pointsLedgerEntry.pointsDelta),
          createdAt: record.pointsLedgerEntry.createdAt.toISOString(),
        } : null,
      })),
      page: currentImagePage,
      pageSize: IMAGE_PAGE_SIZE,
      total: imageTotal,
      totalPages: imageTotalPages,
      hasNextPage: currentImagePage < imageTotalPages,
      hasPreviousPage: currentImagePage > 1,
    },
  }

  return <HistoryPageClient initialData={initialData} />
}
