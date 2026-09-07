'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function AdminCreatePackageForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [points, setPoints] = useState('')
  const [priceCents, setPriceCents] = useState('')
  const [displayOrder, setDisplayOrder] = useState('0')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch('/api/admin/points-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          points: Number(points),
          priceCents: Number(priceCents),
          displayOrder: Number(displayOrder),
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '创建失败')
      }

      setMessage(`已创建积分包：${payload.name}`)
      setName('')
      setPoints('')
      setPriceCents('')
      setDisplayOrder('0')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-base font-semibold text-slate-900">新建积分包</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="名称，例如 直播专享包" />
        <input value={points} onChange={(e) => setPoints(e.target.value)} className="input-field" placeholder="积分数量，例如 500" />
        <input value={priceCents} onChange={(e) => setPriceCents(e.target.value)} className="input-field" placeholder="价格分，例如 9900" />
        <input value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} className="input-field" placeholder="排序，例如 40" />
      </div>
      <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="mt-4 inline-flex rounded-full bg-amazon-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400">
        {isSubmitting ? '创建中...' : '创建积分包'}
      </button>
      {message && <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
      {error && <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    </div>
  )
}
