'use client'

import { useMemo, useState } from 'react'
import { formatPoints } from '@/lib/points-config'

interface AdjustableUser {
  id: string
  email: string
  pointsBalance: number
}

function createRequestId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function AdminAdjustPointsButton({
  user,
  onAdjusted,
}: {
  user: AdjustableUser
  onAdjusted: (pointsBalance: number, pointsDelta: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [targetBalance, setTargetBalance] = useState('')
  const [reason, setReason] = useState('')
  const [requestId, setRequestId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const parsedTargetBalance = Number(targetBalance)
  const predictedDelta = useMemo(() => (
    targetBalance.trim() && Number.isFinite(parsedTargetBalance)
      ? parsedTargetBalance - user.pointsBalance
      : null
  ), [parsedTargetBalance, targetBalance, user.pointsBalance])

  const openDialog = () => {
    setTargetBalance(formatPoints(user.pointsBalance))
    setReason('')
    setRequestId(createRequestId())
    setError('')
    setOpen(true)
  }

  const closeDialog = () => {
    if (submitting) return
    setOpen(false)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetBalance: parsedTargetBalance, reason, requestId }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '积分调整失败')
      }

      onAdjusted(payload.pointsBalance, payload.pointsDelta)
      setOpen(false)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '积分调整失败')
    } finally {
      setSubmitting(false)
    }
  }

  const invalidTarget = !Number.isFinite(parsedTargetBalance)
    || parsedTargetBalance < 0
    || Math.abs(parsedTargetBalance * 10 - Math.round(parsedTargetBalance * 10)) > 0.000001
  const submitDisabled = submitting
    || invalidTarget
    || predictedDelta === 0
    || reason.trim().length < 2

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="cursor-pointer whitespace-nowrap rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-amazon-blue hover:bg-blue-50 hover:text-amazon-blue"
      >
        调整积分
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby={`adjust-points-${user.id}`}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={`adjust-points-${user.id}`} className="text-xl font-semibold text-slate-950">调整用户积分</h2>
                <p className="mt-1 break-all text-sm text-slate-500">{user.email}</p>
              </div>
              <button type="button" onClick={closeDialog} disabled={submitting} aria-label="关闭积分调整窗口" className="cursor-pointer rounded-full px-2 text-2xl leading-8 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed">×</button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                当前余额：<span className="font-semibold text-slate-950">{formatPoints(user.pointsBalance)} 积分</span>
              </div>

              <label className="block text-sm font-medium text-slate-800">
                调整后余额
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.1"
                  required
                  autoFocus
                  value={targetBalance}
                  onChange={(event) => setTargetBalance(event.target.value)}
                  className="input-field mt-2"
                />
              </label>

              {predictedDelta !== null && predictedDelta !== 0 && !invalidTarget && (
                <div className={`rounded-2xl px-4 py-3 text-sm ${predictedDelta > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                  本次将{predictedDelta > 0 ? '增加' : '扣除'} <span className="font-semibold">{formatPoints(Math.abs(predictedDelta))} 积分</span>
                </div>
              )}

              <label className="block text-sm font-medium text-slate-800">
                调整原因
                <textarea
                  required
                  minLength={2}
                  maxLength={200}
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="例如：活动补发、异常扣费返还"
                  className="input-field mt-2 resize-none"
                />
              </label>

              {error && <div aria-live="polite" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

              <div className="flex gap-3">
                <button type="button" onClick={closeDialog} disabled={submitting} className="flex-1 cursor-pointer rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed">取消</button>
                <button type="submit" disabled={submitDisabled} className="flex-1 cursor-pointer rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                  {submitting ? '调整中...' : '确认调整'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
