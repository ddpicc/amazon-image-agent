'use client'

import { useEffect, useMemo, useState } from 'react'

interface RechargePackageItem {
  id: string
  name: string
  points: number
  priceCents: number
  currency: string
  displayOrder: number
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
  updatedAt: string
}

interface PaymentOrderResult {
  id: string
  outTradeNo: string
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED'
  amountCents: number
  currency: string
  payType: 'alipay' | 'wxpay'
  payUrl: string
  payUrl2: string
  qrcode: string
  img: string
  providerOrderId: string | null
  createdAt: string
  paymentPackage: {
    id: string
    name: string
    points: number
  }
}

function formatMoney(amountCents: number, currency: string) {
  if (currency === 'CNY') {
    return `¥${(amountCents / 100).toFixed(2)}`
  }

  return `${currency} ${(amountCents / 100).toFixed(2)}`
}

export default function RechargePageClient({
  initialPackages,
  initialPackageId,
}: {
  initialPackages: RechargePackageItem[]
  initialPackageId: string
}) {
  const [selectedPackageId, setSelectedPackageId] = useState(initialPackageId)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [payType, setPayType] = useState<'wxpay' | 'alipay'>('wxpay')
  const [createdOrder, setCreatedOrder] = useState<PaymentOrderResult | null>(null)

  const selectedPackage = useMemo(
    () => initialPackages.find((item) => item.id === selectedPackageId) || null,
    [initialPackages, selectedPackageId],
  )

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; outTradeNo?: string }
      if (data?.type !== 'recharge_paid') return

      setMessage(`订单 ${data.outTradeNo || ''} 已支付，积分已到账。`)
      setCreatedOrder((prev) => (prev ? { ...prev, status: 'PAID' } : prev))
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleCreateOrder = async () => {
    if (!selectedPackageId) return

    setIsSubmitting(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/points/payment-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ packageId: selectedPackageId, type: payType }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '创建订单失败')
      }

      setCreatedOrder(payload)
      const payWindowUrl = `/points/recharge/pay?outTradeNo=${encodeURIComponent(payload.outTradeNo)}`
      window.open(payWindowUrl, '_blank', 'width=430,height=760')
      setMessage(`充值订单已创建：${payload.outTradeNo}，请在新窗口完成支付。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建订单失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section className="panel p-6">
        <h2 className="text-lg font-semibold text-slate-950">选择积分包</h2>
        <div className="mt-4 space-y-3">
          {initialPackages.length === 0 ? (
            <p className="text-sm text-slate-500">暂时还没有可购买的积分包。</p>
          ) : initialPackages.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedPackageId(item.id)}
              className={`w-full rounded-2xl border p-4 text-left transition ${selectedPackageId === item.id ? 'border-amazon-orange bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">{item.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.points} 积分</div>
                </div>
                <div className="text-sm font-semibold text-slate-900">{formatMoney(item.priceCents, item.currency)}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPayType('wxpay')}
            className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${payType === 'wxpay' ? 'border-amazon-orange bg-orange-50 text-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
          >
            微信支付
          </button>
          <button
            type="button"
            onClick={() => setPayType('alipay')}
            className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${payType === 'alipay' ? 'border-amazon-orange bg-orange-50 text-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
          >
            支付宝
          </button>
        </div>

        <button
          type="button"
          onClick={handleCreateOrder}
          disabled={isSubmitting || !selectedPackageId}
          className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-amazon-orange px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSubmitting ? '创建中...' : '创建并拉起支付'}
        </button>
        {message && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
        {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      </section>

      <section className="space-y-6">
        <div className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-950">订单预览</h2>
          {selectedPackage ? (
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <div>套餐：{selectedPackage.name}</div>
              <div>积分：{selectedPackage.points}</div>
              <div>金额：{formatMoney(selectedPackage.priceCents, selectedPackage.currency)}</div>
              <div>支付方式：{payType === 'wxpay' ? '微信支付' : '支付宝'}</div>
              <div>说明：创建订单后会打开独立支付页，自动轮询支付状态。</div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">请选择一个积分包。</p>
          )}
        </div>

        {createdOrder && (
          <div className="panel p-6">
            <h2 className="text-lg font-semibold text-slate-950">已创建订单</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <div>订单号：{createdOrder.id}</div>
              <div>商户单号：{createdOrder.outTradeNo}</div>
              <div>状态：{createdOrder.status}</div>
              <div>套餐：{createdOrder.paymentPackage.name}</div>
              <div>积分：{createdOrder.paymentPackage.points}</div>
              <div>金额：{formatMoney(createdOrder.amountCents, createdOrder.currency)}</div>
              <div>创建时间：{new Date(createdOrder.createdAt).toLocaleString()}</div>
            </div>
            {createdOrder.img ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <img src={createdOrder.img} alt="支付二维码" className="mx-auto h-48 w-48" />
                <div className="mt-2 text-center text-xs text-slate-500">也可以直接扫码支付</div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
