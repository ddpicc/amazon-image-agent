import { completeAiOperation, getAiOperationExpiryDate, startAiOperation } from '@/lib/ai-operations'
import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { fetch1688Product } from '@/lib/1688-product'
import { create1688SelectionToken } from '@/lib/1688-selection-token'

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const operation = await startAiOperation({ userId: user.id, kind: 'ANALYSIS', sourcePage: '1688-product', entryPoint: '/api/1688/product', inputSummary: { stage: '正在解析商品链接并获取图片' }, expiresAt: getAiOperationExpiryDate() })
  try {
    const body = await request.json() as { source?: unknown; url?: unknown }
    const source = typeof body.source === 'string' ? body.source : body.url
    if (typeof source !== 'string' || !source.trim()) {
      throw new Error('请输入 1688 商品链接或 offerid')
    }

    const result = await fetch1688Product(source)
    await completeAiOperation({ operationId: operation.id, status: 'SUCCEEDED', outputSummary: { offerId: result.offerId, imageCount: result.images.length } })
    return NextResponse.json({
      result: {
        ...result,
        selectionToken: create1688SelectionToken(user.id, result),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '1688 商品信息获取失败，请稍后重试'
    await completeAiOperation({ operationId: operation.id, status: 'FAILED', errorMessage: message }).catch(() => undefined)
    const status = message.includes('尚未配置') ? 503 : message.includes('请输入') ? 400 : 502
    console.error('[api/1688/product] lookup failed', {
      userId: user.id,
      message,
    })
    return NextResponse.json({ error: message }, { status })
  }
}
