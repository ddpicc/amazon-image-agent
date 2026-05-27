'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface RedemptionPackageOption {
  id: string
  name: string
  points: number
}

export default function AdminCreateRedemptionCodesForm({ packages }: { packages: RedemptionPackageOption[] }) {
  const router = useRouter()
  const [packageId, setPackageId] = useState(packages[0]?.id || '')
  const [quantity, setQuantity] = useState('10')
  const [batchId, setBatchId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedPackage = packages.find((item) => item.id === packageId) || null

  const handlePackageChange = (value: string) => {
    setPackageId(value)
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setMessage('')
    setError('')
    setCodes([])

    try {
      const response = await fetch('/api/admin/redemption-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: packageId || undefined,
          quantity: Number(quantity),
          batchId: batchId || undefined,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '生成失败')
      }

      setMessage(`已生成 ${payload.codes.length} 个兑换码`)
      setCodes(payload.codes)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-base font-semibold text-slate-900">批量生成兑换码</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <select value={packageId} onChange={(e) => handlePackageChange(e.target.value)} className="input-field">
          {packages.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <input value={selectedPackage ? `${selectedPackage.points} 积分` : ''} readOnly className="input-field bg-slate-100 text-slate-500" placeholder="积分数量" />
        <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input-field" placeholder="数量，例如 10" />
        <input value={batchId} onChange={(e) => setBatchId(e.target.value)} className="input-field" placeholder="批次号，例如 douyin-20260518" />
      </div>
      <p className="mt-3 text-xs text-slate-500">兑换码积分跟随所选积分包，不能单独修改。未使用的兑换码默认 7 天后过期。</p>
      <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="mt-4 inline-flex rounded-full bg-amazon-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-400">
        {isSubmitting ? '生成中...' : '生成兑换码'}
      </button>
      {message && <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
      {error && <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {codes.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-medium text-slate-900">本次生成的兑换码</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {codes.map((code) => (
              <code key={code} className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700">{code}</code>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
