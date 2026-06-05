'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function AdminPaymentOrderRowActions({
  order,
}: {
  order: {
    id: string
    outTradeNo: string | null
    status: string
  }
}) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSettle = async () => {
    if (order.status !== 'PENDING') {
      return
    }

    const confirmed = window.confirm(
      `确认将订单 ${order.outTradeNo || order.id} 标记为已支付并正式入账？此操作会更新订单状态并写入 PAYMENT_RECHARGE 流水。`,
    )
    if (!confirmed) {
      return
    }

    setIsSubmitting(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch(`/api/admin/payment-orders/${order.id}/settle`, {
        method: 'POST',
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '手动入账失败')
      }

      setMessage('订单已入账')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '手动入账失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (order.status !== 'PENDING') {
    return <span className="text-xs text-slate-400">-</span>
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSettle}
        disabled={isSubmitting}
        className="inline-flex rounded-full border border-amazon-blue px-3 py-1.5 text-xs font-semibold text-amazon-blue transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
      >
        {isSubmitting ? '处理中...' : '确认已支付并入账'}
      </button>
      {message ? <div className="text-xs text-emerald-600">{message}</div> : null}
      {error ? <div className="text-xs text-rose-600">{error}</div> : null}
    </div>
  )
}
