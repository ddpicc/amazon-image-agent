'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

interface AnnouncementFormProps {
  initialAnnouncement: {
    id: string
    title: string
    body: string
    isActive: boolean
    startsAt: string | null
    endsAt: string | null
    ctaLabel: string | null
    ctaHref: string | null
    updatedAt: string
  } | null
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16)
}

export default function AdminAnnouncementForm({ initialAnnouncement }: AnnouncementFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initialAnnouncement?.title ?? '')
  const [body, setBody] = useState(initialAnnouncement?.body ?? '')
  const [isActive, setIsActive] = useState(initialAnnouncement?.isActive ?? false)
  const [startsAt, setStartsAt] = useState(toDateTimeLocalValue(initialAnnouncement?.startsAt ?? null))
  const [endsAt, setEndsAt] = useState(toDateTimeLocalValue(initialAnnouncement?.endsAt ?? null))
  const [ctaLabel, setCtaLabel] = useState(initialAnnouncement?.ctaLabel ?? '')
  const [ctaHref, setCtaHref] = useState(initialAnnouncement?.ctaHref ?? '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const lastUpdatedText = useMemo(() => {
    if (!initialAnnouncement?.updatedAt) {
      return '当前还没有配置过公告'
    }

    return `最近一次保存：${new Date(initialAnnouncement.updatedAt).toLocaleString('zh-CN', {
      hour12: false,
      timeZone: 'Asia/Shanghai',
    })}`
  }, [initialAnnouncement?.updatedAt])

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch('/api/admin/announcement', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          isActive,
          startsAt,
          endsAt,
          ctaLabel,
          ctaHref,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '保存失败')
      }

      setMessage(isActive ? '公告已保存并启用' : '公告已保存为未启用状态')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '保存失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">公告配置</h3>
          <p className="mt-1 text-sm text-slate-500">普通用户首次访问时弹窗展示一次，之后不再弹出；全部历史公告可在用户的「通知」页面查看。</p>
        </div>
        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{isActive ? '启用中' : '未启用'}</span>
      </div>

      <div className="mt-2 text-xs text-slate-500">{lastUpdatedText}</div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-800">公告标题</label>
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="input-field" placeholder="例如：本周五晚上 22:00 进行系统维护" />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-800">公告正文</label>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} className="input-field min-h-40 resize-y" placeholder="填写需要展示给用户的公告内容。" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-800">开始时间</label>
          <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="input-field" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-800">结束时间</label>
          <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="input-field" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-800">CTA 文案</label>
          <input value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} className="input-field" placeholder="例如：查看详情" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-800">CTA 链接</label>
          <input value={ctaHref} onChange={(event) => setCtaHref(event.target.value)} className="input-field" placeholder="例如：/points 或 https://example.com" />
        </div>

        <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          保存后立即作为当前公告对普通用户生效
        </label>
      </div>

      <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="mt-4 inline-flex rounded-full bg-amazon-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400">
        {isSubmitting ? '保存中...' : '保存公告'}
      </button>

      {message && <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
      {error && <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    </div>
  )
}
