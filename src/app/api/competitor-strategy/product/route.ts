import { completeAiOperation, getAiOperationExpiryDate, startAiOperation } from '@/lib/ai-operations'
import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { fetchAmazonProduct } from '@/lib/amazon-product'
import { STRATEGY_MARKETPLACES } from '@/lib/competitor-image-source'
import type { AmazonMarketplace } from '@/lib/competitor-strategy-types'
import { signProductSelection } from '@/lib/product-selection-token'
export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const operation = await startAiOperation({ userId: user.id, kind: 'ANALYSIS', sourcePage: 'competitor-product', entryPoint: '/api/competitor-strategy/product', inputSummary: { stage: '正在获取商品图片供确认' }, expiresAt: getAiOperationExpiryDate() })
  try {
    const { asin, marketplace } = await request.json()
    if (typeof asin !== 'string' || !STRATEGY_MARKETPLACES.has(marketplace as AmazonMarketplace)) throw new Error('请输入有效 ASIN 和站点。')
    const product = await fetchAmazonProduct(asin, marketplace)
    await completeAiOperation({ operationId: operation.id, status: 'SUCCEEDED', outputSummary: { asin: product.asin, marketplace: product.marketplace, provider: product.provider, imageCount: product.images.length } })
    return NextResponse.json({ product: { ...product, selectionToken: signProductSelection(user.id, product) } })
  } catch (error) {
    await completeAiOperation({ operationId: operation.id, status: 'FAILED', errorMessage: error instanceof Error ? error.message : '商品图片获取失败' }).catch(() => undefined)
    return NextResponse.json({ error: '商品图片获取失败，请稍后重试或改用上传图片。' }, { status: 502 })
  }
}
