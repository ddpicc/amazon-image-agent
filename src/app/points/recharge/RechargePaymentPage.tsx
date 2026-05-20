'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatPoints } from '@/lib/points-config'

type OrderDto = {
  id: string
  outTradeNo: string | null
  amountCents: number
  status: string
  payType: string | null
  payUrl: string
  payUrl2: string
  qrcode: string
  img: string
  createdAt: string
  paidAt: string | null
  paymentPackage: {
    id: string
    name: string
    points: number
  }
}

type OrderResponse = {
  order?: OrderDto
  error?: string
}

function formatMoney(amountCents: number) {
  return `¥${(amountCents / 100).toFixed(2)}`
}

function getStatusText(status: string) {
  if (status === 'PAID') return '已支付'
  if (status === 'PENDING') return '待支付'
  if (status === 'FAILED') return '失败'
  if (status === 'CANCELLED') return '已取消'
  if (status === 'REFUNDED') return '已退款'
  return '创建中'
}

export default function RechargePaymentPage({ outTradeNo }: { outTradeNo: string }) {
  const [order, setOrder] = useState<OrderDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [autoChecking, setAutoChecking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadOrder = useCallback(async () => {
    if (!outTradeNo) return

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/points/payment-orders/order?outTradeNo=${encodeURIComponent(outTradeNo)}`, {
        cache: 'no-store',
      })
      const payload = (await response.json()) as OrderResponse
      if (!response.ok || !payload.order) {
        throw new Error(payload.error || '加载订单失败')
      }

      setOrder(payload.order)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载订单失败')
    } finally {
      setLoading(false)
    }
  }, [outTradeNo])

  useEffect(() => {
    void loadOrder()
  }, [loadOrder])

  useEffect(() => {
    if (!outTradeNo || order?.status === 'PAID') {
      return
    }

    let cancelled = false
    let timer: number | null = null

    const pollOnce = async () => {
      if (cancelled) return

      setAutoChecking(true)
      try {
        const response = await fetch('/api/points/payment-orders/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outTradeNo }),
        })
        const payload = (await response.json()) as OrderResponse
        if (!response.ok || !payload.order) {
          return
        }

        setOrder(payload.order)
        if (payload.order.status === 'PAID') {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              { type: 'recharge_paid', outTradeNo: payload.order.outTradeNo, amountCents: payload.order.amountCents },
              window.location.origin,
            )
          }
          window.close()
          return
        }
      } finally {
        setAutoChecking(false)
      }

      if (!cancelled) {
        timer = window.setTimeout(() => {
          void pollOnce()
        }, 10000)
      }
    }

    void pollOnce()

    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [order?.status, outTradeNo])

  const canClose = useMemo(() => order?.status === 'PAID', [order?.status])

  const handlePaidConfirm = async () => {
    if (!outTradeNo || confirming) return

    setConfirming(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/points/payment-orders/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outTradeNo }),
      })
      const payload = (await response.json()) as OrderResponse
      if (!response.ok || !payload.order) {
        throw new Error(payload.error || '查询订单状态失败')
      }

      setOrder(payload.order)
      if (payload.order.status !== 'PAID') {
        setMessage('订单尚未支付成功，请稍后再试。')
        return
      }

      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          { type: 'recharge_paid', outTradeNo: payload.order.outTradeNo, amountCents: payload.order.amountCents },
          window.location.origin,
        )
      }

      window.close()
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : '查询订单状态失败')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <>
      <style jsx global>{`
        body > header {
          display: none;
        }
      `}</style>
      <main className="min-h-screen bg-[#f8fafc] p-4">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amazon-orange">Pay</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-950">
          {order?.payType === 'alipay' ? '支付宝支付' : '微信扫码支付'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">商户单号：{outTradeNo || '-'}</p>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-500">支付金额</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{formatMoney(order?.amountCents ?? 0)}</p>
          <p className="mt-1 text-xs text-slate-500">状态：{getStatusText(order?.status ?? '')}</p>
          {order?.paymentPackage ? <p className="mt-1 text-xs text-slate-500">到账积分：{formatPoints(order.paymentPackage.points)}</p> : null}
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          {order?.img ? (
            <img src={order.img} alt="支付二维码" className="mx-auto h-56 w-56 rounded-lg border border-slate-200 bg-white p-1" />
          ) : (
            <p className="text-sm text-rose-600">二维码暂未生成，请点击刷新。</p>
          )}
          <p className="mt-3 text-center text-xs text-slate-500">
            {order?.payType === 'alipay' ? '请使用支付宝扫码完成支付' : '请使用微信扫码完成支付'}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadOrder()}
            disabled={loading}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
          >
            {loading ? '刷新中...' : '刷新状态'}
          </button>
          <button
            type="button"
            onClick={() => void handlePaidConfirm()}
            disabled={confirming}
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-60"
          >
            {confirming ? '查询中...' : '支付已完成'}
          </button>
        </div>

        {autoChecking && order?.status !== 'PAID' ? (
          <p className="mt-2 text-xs text-slate-500">正在自动查询支付状态（每 10 秒）...</p>
        ) : null}
        {canClose ? <p className="mt-2 text-xs text-emerald-600">订单已支付，可关闭窗口。</p> : null}
        {message ? <p className="mt-2 text-xs text-slate-500">{message}</p> : null}
        {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      </div>
      </main>
    </>
  )
}
