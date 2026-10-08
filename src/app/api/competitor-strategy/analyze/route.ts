import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { analyzeCompetitorImageStrategy } from '@/lib/competitor-image-strategy'
import { resolveStrategySource, STRATEGY_MARKETPLACES } from '@/lib/competitor-image-source'
import type { AmazonMarketplace } from '@/lib/competitor-strategy-types'
import { readWorkflowForm, runWorkflow, WorkflowInputError } from '@/lib/workflow-reports'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return runWorkflow(request, user.id, 'competitor-strategy', async (context) => {
    const form = await readWorkflowForm(request, context.signal)
    const uploads = ['competitorImages', 'ownImages'].flatMap((key) => form.getAll(key)).filter((item): item is File => item instanceof File)
    if (uploads.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) throw new WorkflowInputError('两组上传图片总大小不能超过 50 MB。')
    await context.stage('正在检查并下载已确认的图序')
    const resolve = async (prefix: 'competitor' | 'own') => {
      const mode = String(form.get(`${prefix}Mode`) || 'none')
      if (prefix === 'own' && mode === 'none') return null
      const marketplace = String(form.get(`${prefix}Marketplace`) || 'US') as AmazonMarketplace
      if ((mode !== 'asin' && mode !== 'upload') || !STRATEGY_MARKETPLACES.has(marketplace)) throw new WorkflowInputError('请选择有效的图片来源和站点。')
      let indexes: unknown
      try { indexes = JSON.parse(String(form.get(`${prefix}ImageIndexes`) || '[]')) } catch { throw new WorkflowInputError('图片顺序无效，请重新确认。') }
      return resolveStrategySource({ mode, marketplace, label: prefix === 'competitor' ? '竞品' : '我方商品', files: form.getAll(`${prefix}Images`).filter((item): item is File => item instanceof File && item.size > 0), token: String(form.get(`${prefix}SelectionToken`) || ''), indexes, userId: user.id, signal: context.signal })
    }
    const [competitor, own] = await Promise.all([resolve('competitor'), resolve('own')])
    if (!competitor) throw new WorkflowInputError('请提供竞品图片。')
    const summary = (source: typeof competitor | null) => source ? { mode: source.mode, asin: source.asin, marketplace: source.marketplace, productTitle: source.productTitle, provider: source.provider, imageCount: source.images.length, originalImageIndexes: source.originalImageIndexes } : null
    await context.snapshot({ competitor: summary(competitor), own: summary(own) })
    await context.stage('正在分析销售任务、视觉表达和差异方案')
    return analyzeCompetitorImageStrategy({ competitor, own, operationId: context.operationId, signal: context.signal })
  })
}
