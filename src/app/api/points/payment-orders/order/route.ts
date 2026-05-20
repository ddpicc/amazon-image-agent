import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { applyPaymentOrderSuccess, getPaymentOrderForUser } from '@/lib/points'
import { toDisplayPoints } from '@/lib/points-config'
import { getZPayConfig } from '@/lib/payments/zpay'

type VerifyOrderBody = {
  outTradeNo?: string
}

type ZPayOrderQueryResponse = {
  code?: number | string
  msg?: string
  trade_no?: string
  out_trade_no?: string
  type?: string
  pid?: string | number
  addtime?: string
  endtime?: string
  name?: string
  money?: string | number
  status?: string | number
}

function serializeOrder(order: NonNullable<Awaited<ReturnType<typeof getPaymentOrderForUser>>>) {
  return {
    id: order.id,
    outTradeNo: order.outTradeNo,
    amountCents: order.amountCents,
    status: order.status,
    payType: order.payType,
    payUrl: order.payUrl,
    payUrl2: order.payUrl2,
    qrcode: order.qrcodeUrl,
    img: order.qrcodeImg,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    paymentPackage: {
      id: order.paymentPackage.id,
      name: order.paymentPackage.name,
      points: toDisplayPoints(order.paymentPackage.points),
    },
  }
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const outTradeNo = String(request.nextUrl.searchParams.get('outTradeNo') ?? '').trim()
    if (!outTradeNo) {
      return NextResponse.json({ error: '缺少 outTradeNo' }, { status: 400 })
    }

    const order = await getPaymentOrderForUser({ userId: user.id, outTradeNo })
    if (!order) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 })
    }

    return NextResponse.json({ order: serializeOrder(order) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询订单失败' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as VerifyOrderBody
    const outTradeNo = String(body.outTradeNo ?? '').trim()
    if (!outTradeNo) {
      return NextResponse.json({ error: '缺少 outTradeNo' }, { status: 400 })
    }

    const localOrder = await getPaymentOrderForUser({ userId: user.id, outTradeNo })
    if (!localOrder) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 })
    }

    if (localOrder.status === 'PAID') {
      return NextResponse.json({
        order: serializeOrder(localOrder),
        verified: true,
      })
    }

    const { pid, key, gateway } = getZPayConfig()
    const queryUrl = new URL(`${gateway}/api.php`)
    queryUrl.searchParams.set('act', 'order')
    queryUrl.searchParams.set('pid', pid)
    queryUrl.searchParams.set('key', key)
    queryUrl.searchParams.set('out_trade_no', outTradeNo)

    const upstream = await fetch(queryUrl.toString(), {
      method: 'GET',
      cache: 'no-store',
    })
    const rawText = await upstream.text()

    let remote: ZPayOrderQueryResponse = {}
    try {
      remote = JSON.parse(rawText) as ZPayOrderQueryResponse
    } catch {
      return NextResponse.json({ error: '查询上游订单状态失败' }, { status: 502 })
    }

    const code = Number(remote.code ?? 0)
    if (!Number.isFinite(code) || code !== 1) {
      return NextResponse.json({ error: String(remote.msg ?? '查询订单失败') }, { status: 502 })
    }

    const paidStatus = Number(remote.status ?? 0)
    if (paidStatus === 1) {
      const amount = Number(remote.money ?? localOrder.amountCents / 100)
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: '上游返回金额不合法' }, { status: 502 })
      }

      await applyPaymentOrderSuccess({
        outTradeNo,
        providerOrderId: String(remote.trade_no ?? '').trim() || undefined,
        paidAmountCents: Math.round(amount * 100),
        notifyPayload: {
          source: 'manual_order_query',
          queriedAt: new Date().toISOString(),
          remote,
        },
        paidAt: new Date(),
      })
    }

    const order = await getPaymentOrderForUser({ userId: user.id, outTradeNo })
    if (!order) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 })
    }

    return NextResponse.json({
      order: serializeOrder(order),
      verified: paidStatus === 1,
      remoteStatus: paidStatus,
      remoteMsg: String(remote.msg ?? ''),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询订单状态失败' },
      { status: 500 },
    )
  }
}
