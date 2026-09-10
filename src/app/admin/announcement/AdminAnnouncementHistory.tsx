'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface AdminAnnouncementHistoryItem {
  id: string
  title: string
  body: string
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  ctaLabel: string | null
  ctaHref: string | null
  publishedAt: string | null
  createdAt: string
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '未设置'
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
}

function getAnnouncementStatus(item: AdminAnnouncementHistoryItem, now: number) {
  const startsAt = item.startsAt ? new Date(item.startsAt).getTime() : null
  const endsAt = item.endsAt ? new Date(item.endsAt).getTime() : null

  if (item.isActive && (startsAt === null || startsAt <= now) && (endsAt === null || endsAt >= now)) {
    return { label: '当前生效', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
  }
  if (item.isActive && startsAt !== null && startsAt > now) {
    return { label: '等待生效', className: 'bg-blue-50 text-blue-700 ring-blue-200' }
  }
  if (endsAt !== null && endsAt < now) {
    return { label: '已过期', className: 'bg-slate-100 text-slate-600 ring-slate-200' }
  }
  if (item.publishedAt) {
    return { label: '历史公告', className: 'bg-amber-50 text-amber-700 ring-amber-200' }
  }
  return { label: '未发布', className: 'bg-slate-100 text-slate-600 ring-slate-200' }
}

export default function AdminAnnouncementHistory({ initialItems, currentTime }: { initialItems: AdminAnnouncementHistoryItem[]; currentTime: string }) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [pendingDelete, setPendingDelete] = useState<AdminAnnouncementHistoryItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const now = new Date(currentTime).getTime()

  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

  const handleDelete = async () => {
    if (!pendingDelete || deletingId) {
      return
    }

    setDeletingId(pendingDelete.id)
    setMessage('')
    setError('')

    try {
      const response = await fetch(`/api/admin/announcement/${encodeURIComponent(pendingDelete.id)}`, {
        method: 'DELETE',
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '删除公告失败')
      }

      const deletedTitle = pendingDelete.title
      setItems((currentItems) => currentItems.filter((item) => item.id !== pendingDelete.id))
      setPendingDelete(null)
      setMessage(`公告“${deletedTitle || '未命名公告'}”已删除`)
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '删除公告失败')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">历史公告</h2>
          <p className="mt-1 text-sm text-slate-500">共 {items.length} 条，删除后也会从普通用户的通知历史中移除。</p>
        </div>
      </div>

      {message && <div role="status" className="mx-5 mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:mx-6">{message}</div>}
      {error && <div role="alert" className="mx-5 mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-6">{error}</div>}

      {items.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <div className="text-sm font-medium text-slate-700">暂无历史公告</div>
          <p className="mt-1 text-sm text-slate-500">保存第一条公告后会显示在这里。</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {items.map((item) => {
            const status = getAnnouncementStatus(item, now)
            return (
              <article key={item.id} className="px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-base font-semibold text-slate-950">{item.title || '未命名公告'}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${status.className}`}>{status.label}</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.body || '未填写公告正文'}</p>

                    {item.ctaLabel && item.ctaHref && (
                      <div className="mt-3 text-sm text-slate-500">
                        CTA：<span className="font-medium text-slate-700">{item.ctaLabel}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="break-all">{item.ctaHref}</span>
                      </div>
                    )}

                    <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs text-slate-500 sm:grid-cols-2 xl:grid-cols-4">
                      <div><dt className="inline text-slate-400">创建：</dt><dd className="inline">{formatDateTime(item.createdAt)}</dd></div>
                      <div><dt className="inline text-slate-400">发布：</dt><dd className="inline">{formatDateTime(item.publishedAt)}</dd></div>
                      <div><dt className="inline text-slate-400">开始：</dt><dd className="inline">{formatDateTime(item.startsAt)}</dd></div>
                      <div><dt className="inline text-slate-400">结束：</dt><dd className="inline">{formatDateTime(item.endsAt)}</dd></div>
                    </dl>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPendingDelete(item)
                      setError('')
                    }}
                    className="inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition-colors duration-200 hover:bg-rose-50"
                  >
                    删除
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {pendingDelete && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4"
          role="presentation"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !deletingId) {
              setPendingDelete(null)
            }
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletingId) {
              setPendingDelete(null)
            }
          }}
        >
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-announcement-title" aria-describedby="delete-announcement-description" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 id="delete-announcement-title" className="text-xl font-semibold text-slate-950">确认删除这条公告？</h3>
            <p id="delete-announcement-description" className="mt-3 text-sm leading-6 text-slate-600">
              “{pendingDelete.title || '未命名公告'}”将从管理员历史和普通用户通知中永久移除，此操作无法撤销。
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPendingDelete(null)} disabled={Boolean(deletingId)} className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                取消
              </button>
              <button type="button" autoFocus onClick={handleDelete} disabled={Boolean(deletingId)} className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300">
                {deletingId ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
