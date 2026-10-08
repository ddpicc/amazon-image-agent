import AmazonPageClient from './AmazonPageClient'
import { AmazonResumeState, buildAmazonResumeState } from '@/lib/amazon-workflow'
import { requireNonAdminUser } from '@/lib/auth'
import { listEnabledImageModelOptions } from '@/lib/image-model-config'
import { getUserPointsBalance } from '@/lib/points'
import { prisma } from '@/lib/prisma'
import type { ProductInputInitialSource } from '@/components/ProductInput'
import type { CompetitorStrategyResult } from '@/lib/competitor-strategy-types'
import { buildStrategyRequirements } from '@/lib/strategy-handoff'
import { validateStrategyResult } from '@/lib/workflow-result-validation'

interface AmazonPageProps {
  searchParams?: {
    analysisId?: string
    strategyReport?: string
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

  let initialSourceProduct: ProductInputInitialSource | null = null
  let strategyError = ''
  if (searchParams?.strategyReport && !initialResumeState) {
    const report = await prisma.aiOperation.findFirst({ where: { id: searchParams.strategyReport, userId: user.id, sourcePage: 'competitor-strategy', status: 'SUCCEEDED', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })
    try {
      if (!report?.responseSnapshotJson) throw new Error('missing')
      const result = report.responseSnapshotJson as unknown as CompetitorStrategyResult
      validateStrategyResult(result, result.source.competitor.imageCount)
      initialSourceProduct = { productName: result.source.own?.productTitle || '', description: '', sourceLabel: '来自竞品策略报告 · 请补充我方商品信息与参考图', selectionToken: '', referenceImages: [], additionalRequirements: buildStrategyRequirements(result) }
    } catch { strategyError = '策略报告不存在、已过期或内容不完整。请返回历史查看，或手动填写商品信息。' }
  }
  return <>{strategyError && <p role="alert" className="mx-auto max-w-7xl p-4 text-rose-700">{strategyError}</p>}<AmazonPageClient initialResumeState={initialResumeState} initialPointsBalance={pointsBalance} imageModels={imageModels} initialSourceProduct={initialSourceProduct} /></>
}
