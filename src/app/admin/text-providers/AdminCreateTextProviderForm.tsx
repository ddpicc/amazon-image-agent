'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function AdminCreateTextProviderForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [vendor, setVendor] = useState('openai-compatible')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('gpt-5.4')
  const [priority, setPriority] = useState('100')
  const [routingRole, setRoutingRole] = useState<'AUTO' | 'FALLBACK'>('AUTO')
  const [enabled, setEnabled] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch('/api/admin/text-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          vendor,
          baseUrl,
          model,
          priority: Number(priority),
          routingRole,
          enabled,
          apiKey,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '创建失败')
      }

      setMessage(`已创建 provider：${payload.name}`)
      setName('')
      setVendor('openai-compatible')
      setBaseUrl('')
      setModel('gpt-5.4')
      setPriority('100')
      setRoutingRole('AUTO')
      setEnabled(true)
      setApiKey('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">新增 Text Provider</h3>
          <p className="mt-1 text-sm text-slate-500">文本分析、Prompt 生成走这里的 provider 池。</p>
        </div>
        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Write-only key</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="名称，例如 primary" />
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} className="input-field" placeholder="vendor，例如 openai-compatible" />
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="input-field" placeholder="Base URL，例如 https://api.example.com/v1" />
        <input
          value={model}
          onChange={(e) => {
            const nextModel = e.target.value
            setModel(nextModel)
          }}
          className="input-field"
          placeholder="模型，例如 gpt-5.4"
        />
        <input value={priority} onChange={(e) => setPriority(e.target.value)} className="input-field" placeholder="优先级，数字越小越优先" />
        <label>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Routing role</div>
          <select value={routingRole} onChange={(e) => setRoutingRole(e.target.value as typeof routingRole)} className="input-field">
            <option value="AUTO">普通 Provider</option>
            <option value="FALLBACK">备用 Provider</option>
          </select>
        </label>
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          创建后立即启用
        </label>
        <div className="md:col-span-2">
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="input-field" placeholder="输入 API key（保存后不可回看）" autoComplete="new-password" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">普通 Provider 按 Priority（数字越小越优先）依次尝试；主路由 5 分钟超时或全部快速失败后，切换备用 Provider。</p>
      <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="mt-4 inline-flex rounded-full bg-amazon-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400">
        {isSubmitting ? '创建中...' : '创建 Provider'}
      </button>
      {message && <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
      {error && <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    </div>
  )
}
