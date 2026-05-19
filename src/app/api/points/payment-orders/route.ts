import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { PaymentOrderStatus } from '@prisma/client'
import { createPendingPaymentOrder, updatePaymentOrderAfterCreate } from '@/lib/points'
import { buildZPaySign, getZPayConfig, normalizeMoneyFromCents, parseZPayCode, type ZPayPayType } from '@/lib/payments/zpay'

type CreateOrderBody = {
  packageId?: string
  type?: ZPayPayType
  cid?: string
}

type ZPayCreateResponse = {
  code?: number | string
  msg?: string
  O_id?: string
  trade_no?: string
  payurl?: string
  payurl2?: string
  qrcode?: string
  img?: string
  [key: string]: unknown
}

const ALLOWED_TYPES: ZPayPayType[] = ['alipay', 'wxpay']

function readClientIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) {
      return first
    }
  }

  const real = request.headers.get('x-real-ip')?.trim()
  if (real) {
    return real
  }

  return '127.0.0.1'
}

function makeOutTradeNo() {
  const ts = Date.now().toString()
  const rand = Math.floor(Math.random() * 900000 + 100000).toString()
  return `PO${ts}${rand}`.slice(0, 32)
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as CreateOrderBody
    const packageId = typeof body.packageId === 'string' ? body.packageId : ''
    const payType = typeof body.type === 'string' ? body.type : 'wxpay'
    const cid = typeof body.cid === 'string' ? body.cid.trim() : ''

    if (!packageId) {
      return NextResponse.json({ error: '请选择积分包' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(payType as ZPayPayType)) {
      return NextResponse.json({ error: '支付方式仅支持 alipay 或 wxpay' }, { status: 400 })
    }

    const outTradeNo = makeOutTradeNo()
    const localOrder = await createPendingPaymentOrder({
      userId: user.id,
      packageId,
      outTradeNo,
      payType,
      provider: 'zpay',
    })

    const money = normalizeMoneyFromCents(localOrder.amountCents)
    const productName = process.env.ZPAY_PRODUCT_NAME?.trim() || `${localOrder.paymentPackage.name}`
    const origin = (process.env.APP_BASE_URL?.trim() || request.nextUrl.origin).replace(/\/+$/, '')
    const notifyUrl = process.env.ZPAY_NOTIFY_URL?.trim() || `${origin}/api/points/payment-orders/notify`
    const { pid, key, gateway } = getZPayConfig()

    const basePayload: Record<string, string> = {
      pid,
      type: payType,
      out_trade_no: outTradeNo,
      notify_url: notifyUrl,
      name: productName,
      money,
      clientip: readClientIp(request),
      param: user.id,
    }

    if (cid) {
      basePayload.cid = cid
    }

    const zpayPayload = {
      ...basePayload,
      sign: buildZPaySign(basePayload, key),
      sign_type: 'MD5',
    }

    const formData = new FormData()
    for (const [k, v] of Object.entries(zpayPayload)) {
      formData.append(k, v)
    }

    const upstream = await fetch(`${gateway}/mapi.php`, {
      method: 'POST',
      body: formData,
      cache: 'no-store',
    })
    const raw = await upstream.text()

    let data: ZPayCreateResponse = {}
    try {
      data = JSON.parse(raw) as ZPayCreateResponse
    } catch {
      data = {
        code: 0,
        msg: raw.slice(0, 500) || 'ZPAY 返回格式不正确',
      }
    }

    const code = parseZPayCode(data.code)
    const order = await updatePaymentOrderAfterCreate({
      outTradeNo,
      status: code === 1 ? PaymentOrderStatus.PENDING : PaymentOrderStatus.FAILED,
      providerOrderId: typeof data.trade_no === 'string' ? data.trade_no : null,
      payUrl: typeof data.payurl === 'string' ? data.payurl : '',
      payUrl2: typeof data.payurl2 === 'string' ? data.payurl2 : '',
      qrcodeUrl: typeof data.qrcode === 'string' ? data.qrcode : '',
      qrcodeImg: typeof data.img === 'string' ? data.img : '',
      metadata: {
        packageName: localOrder.paymentPackage.name,
        points: localOrder.paymentPackage.points,
        zpayPayload: data,
      },
    })

    if (code !== 1) {
      return NextResponse.json(
        { error: typeof data.msg === 'string' ? data.msg : '拉起支付失败', outTradeNo },
        { status: 502 },
      )
    }

    return NextResponse.json({
      id: order.id,
      outTradeNo: order.outTradeNo,
      status: order.status,
      amountCents: order.amountCents,
      currency: order.currency,
      payType: order.payType,
      payUrl: order.payUrl,
      payUrl2: order.payUrl2,
      qrcode: order.qrcodeUrl,
      img: order.qrcodeImg,
      providerOrderId: order.providerOrderId,
      createdAt: order.createdAt,
      paymentPackage: {
        id: localOrder.paymentPackage.id,
        name: localOrder.paymentPackage.name,
        points: localOrder.paymentPackage.points,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建充值订单失败' },
      { status: 400 },
    )
  }
}
