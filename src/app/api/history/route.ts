import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { syncActiveImageGenerationRequests } from '@/lib/image-generation-service'
import { areReferenceImagesExpired } from '@/lib/reference-images'
import { toDisplayPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'
import { isPromptGenerationComplete, normalizePromptResults } from '@/lib/amazon-workflow'

const DEFAULT_ANALYSIS_PAGE_SIZE = 5
const DEFAULT_IMAGE_PAGE_SIZE = 12

function normalizePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const analysisPageSize = normalizePositiveInt(searchParams.get('analysisPageSize'), DEFAULT_ANALYSIS_PAGE_SIZE)
  const requestedAnalysisPage = normalizePositiveInt(searchParams.get('analysisPage'), 1)
  const imagePageSize = normalizePositiveInt(searchParams.get('imagePageSize'), DEFAULT_IMAGE_PAGE_SIZE)
  const requestedImagePage = normalizePositiveInt(searchParams.get('imagePage'), 1)

  const [analysisTotal, imageTotal] = await Promise.all([
    prisma.analysisRecord.count({
      where: { userId: user.id },
    }),
    prisma.imageGenerationRequest.count({
      where: { userId: user.id },
    }),
  ])

  const analysisTotalPages = Math.max(1, Math.ceil(analysisTotal / analysisPageSize))
  const analysisPage = Math.min(requestedAnalysisPage, analysisTotalPages)
  const analysisSkip = (analysisPage - 1) * analysisPageSize

  const imageTotalPages = Math.max(1, Math.ceil(imageTotal / imagePageSize))
  const imagePage = Math.min(requestedImagePage, imageTotalPages)
  const imageSkip = (imagePage - 1) * imagePageSize

  const [analysisRecords, initialImageRequests] = await Promise.all([
    prisma.analysisRecord.findMany({
      where: { userId: user.id },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      skip: analysisSkip,
      take: analysisPageSize,
    }),
    prisma.imageGenerationRequest.findMany({
      where: { userId: user.id },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      skip: imageSkip,
      take: imagePageSize,
      include: {
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
        where: {
          userId: user.id,
          id: { in: initialImageRequests.map((record) => record.id) },
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        include: {
          pointsLedgerEntry: true,
        },
      })
    : initialImageRequests

  return NextResponse.json({
    analysisRecords: {
      items: analysisRecords.map((record) => ({
        ...record,
        canResumeToPromptPage: isPromptGenerationComplete(normalizePromptResults(record.promptPlanJson).amazonSet),
        referencesExpired: areReferenceImagesExpired(record.createdAt),
      })),
      page: analysisPage,
      pageSize: analysisPageSize,
      total: analysisTotal,
      totalPages: analysisTotalPages,
      hasNextPage: analysisPage < analysisTotalPages,
      hasPreviousPage: analysisPage > 1,
    },
    imageRequests: {
      items: imageRequests.map((record) => ({
        ...record,
        statusMessage: record.statusMessage,
        pointsLedgerEntry: record.pointsLedgerEntry ? {
          ...record.pointsLedgerEntry,
          pointsDelta: toDisplayPoints(record.pointsLedgerEntry.pointsDelta),
        } : null,
      })),
      page: imagePage,
      pageSize: imagePageSize,
      total: imageTotal,
      totalPages: imageTotalPages,
      hasNextPage: imagePage < imageTotalPages,
      hasPreviousPage: imagePage > 1,
    },
  })
}
