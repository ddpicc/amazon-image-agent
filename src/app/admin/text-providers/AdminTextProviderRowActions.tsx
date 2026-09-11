'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface AdminTextProviderRowActionsProps {
  provider: {
    id: string
    name: string
    model: string
    priority: number
    enabled: boolean
    routingRole: 'AUTO' | 'FALLBACK' | 'FORCED_FALLBACK'
  }
  canMoveUp: boolean
  canMoveDown: boolean
}

export default function AdminTextProviderRowActions({ provider, canMoveUp, canMoveDown }: AdminTextProviderRowActionsProps) {
  const router = useRouter()
  const isForcedFallbackModel = provider.model.trim().toLowerCase() === 'glm-5.3-flash'
  const [priority, setPriority] = useState(String(provider.priority))
  const [routingRole, setRoutingRole] = useState(provider.routingRole)
  const [newApiKey, setNewApiKey] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSavingPriority, setIsSavingPriority] = useState(false)
  const [isSavingRoutingRole, setIsSavingRoutingRole] = useState(false)
  const [isMovingUp, setIsMovingUp] = useState(false)
  const [isMovingDown, setIsMovingDown] = useState(false)
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false)
  const [isRotatingKey, setIsRotatingKey] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const resetFeedback = () => {
    setMessage('')
    setError('')
  }

  const handlePrioritySave = async () => {
    setIsSavingPriority(true)
    resetFeedback()

    try {
      const response = await fetch(`/api/admin/text-providers/${provider.id}/priority`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: Number(priority) }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '更新优先级失败')
      }

      setMessage('优先级已更新')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新优先级失败')
    } finally {
      setIsSavingPriority(false)
    }
  }

  const handleMove = async (direction: 'up' | 'down') => {
    const setLoading = direction === 'up' ? setIsMovingUp : setIsMovingDown
    setLoading(true)
    resetFeedback()

    try {
      const response = await fetch(`/api/admin/text-providers/${provider.id}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '移动 provider 失败')
      }

      setMessage(direction === 'up' ? '已上移一位' : '已下移一位')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '移动 provider 失败')
    } finally {
      setLoading(false)
    }
  }

  const handleRoutingRoleSave = async () => {
    setIsSavingRoutingRole(true)
    resetFeedback()

    try {
      const response = await fetch(`/api/admin/text-providers/${provider.id}/routing-role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routingRole }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '更新路由角色失败')
      }

      setMessage('路由角色已更新')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新路由角色失败')
    } finally {
      setIsSavingRoutingRole(false)
    }
  }

  const handleEnabledToggle = async () => {
    setIsTogglingEnabled(true)
    resetFeedback()

    try {
      const response = await fetch(`/api/admin/text-providers/${provider.id}/enabled`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !provider.enabled }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '更新状态失败')
      }

      setMessage(provider.enabled ? '已禁用 provider' : '已启用 provider')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新状态失败')
    } finally {
      setIsTogglingEnabled(false)
    }
  }

  const handleRotateApiKey = async () => {
    setIsRotatingKey(true)
    resetFeedback()

    try {
      const response = await fetch(`/api/admin/text-providers/${provider.id}/api-key`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: newApiKey }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '更新 API key 失败')
      }

      setMessage('API key 已轮换')
      setNewApiKey('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新 API key 失败')
    } finally {
      setIsRotatingKey(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`确认删除 provider ${provider.name}？删除前请确保它已经被禁用。`)) {
      return
    }

    setIsDeleting(true)
    resetFeedback()

    try {
      const response = await fetch(`/api/admin/text-providers/${provider.id}`, {
        method: 'DELETE',
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '删除 provider 失败')
      }

      setMessage('Provider 已删除')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除 provider 失败')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Quick reorder</div>
            <div className="mt-1 text-sm text-slate-600">更适合日常调序，保留下面的数字优先级精调。</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => handleMove('up')} disabled={!canMoveUp || isMovingUp || isMovingDown} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-300 text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300">
              {isMovingUp ? '…' : '↑'}
            </button>
            <button type="button" onClick={() => handleMove('down')} disabled={!canMoveDown || isMovingUp || isMovingDown} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-300 text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300">
              {isMovingDown ? '…' : '↓'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[148px] flex-1">
            <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Priority</div>
            <input value={priority} onChange={(e) => setPriority(e.target.value)} className="input-field" />
          </label>
          <button type="button" onClick={handlePrioritySave} disabled={isSavingPriority} className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400">
            {isSavingPriority ? '保存中...' : '保存优先级'}
          </button>
          <label className="min-w-[180px] flex-1">
            <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Routing role</div>
            <select value={routingRole} onChange={(e) => setRoutingRole(e.target.value as typeof routingRole)} className="input-field" disabled={isForcedFallbackModel}>
              <option value="AUTO">按优先级执行</option>
              <option value="FALLBACK">普通备用</option>
              <option value="FORCED_FALLBACK" disabled={!isForcedFallbackModel}>强制备用</option>
            </select>
          </label>
          <button type="button" onClick={handleRoutingRoleSave} disabled={isSavingRoutingRole || isForcedFallbackModel} className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400">
            {isSavingRoutingRole ? '保存中...' : '保存角色'}
          </button>
          <button type="button" onClick={handleEnabledToggle} disabled={isTogglingEnabled} className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-400 ${provider.enabled ? 'bg-slate-700 hover:bg-slate-800' : 'bg-amazon-blue hover:bg-blue-600'}`}>
            {isTogglingEnabled ? '处理中...' : (provider.enabled ? '禁用' : '启用')}
          </button>
          <button type="button" onClick={handleDelete} disabled={isDeleting} className="inline-flex rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400">
            {isDeleting ? '删除中...' : '删除'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <input
          type="password"
          value={newApiKey}
          onChange={(e) => setNewApiKey(e.target.value)}
          className="input-field"
          placeholder="输入新的 API key（旧 key 不可见）"
          autoComplete="new-password"
        />
        <button type="button" onClick={handleRotateApiKey} disabled={isRotatingKey} className="inline-flex rounded-full bg-amazon-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400">
          {isRotatingKey ? '更新中...' : '轮换 API Key'}
        </button>
      </div>

      {isForcedFallbackModel && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          `glm-5.3-flash` 由系统固定作为强制备用，不能改为普通路由角色。
        </div>
      )}

      {!isForcedFallbackModel && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-500">
          AUTO 与普通备用都按 Priority 排序参与主阶段；只有强制备用会在主阶段 5 分钟预算耗尽后执行。
        </div>
      )}

      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    </div>
  )
}
