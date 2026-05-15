import HistoryPageClient, { HistoryPageData } from './HistoryPageClient'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function HistoryPage() {
  const user = await requireUser()
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
      },
    }),
  ])

  const initialData: HistoryPageData = {
    analysisRecords: analysisRecords.map((record) => ({
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    })),
    imageRequests: imageRequests.map((record) => ({
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      assets: record.assets.map((asset) => ({
        ...asset,
        createdAt: asset.createdAt.toISOString(),
      })),
    })),
  }

  return <HistoryPageClient initialData={initialData} />
}
