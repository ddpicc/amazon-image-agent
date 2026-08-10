'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

interface AnnouncementModalProps {
  announcement: {
    id: string
    title: string
    body: string
    ctaLabel: string | null
    ctaHref: string | null
  } | null
  isLoggedIn: boolean
}

export default function AnnouncementModal({ announcement, isLoggedIn }: AnnouncementModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [hideForToday, setHideForToday] = useState(false)

  const hideForTodayKey = useMemo(() => {
    return announcement ? `announcement:hidden-on:${announcement.id}` : ''
  }, [announcement])

  const today = () => {
    const date = new Date()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
  }

  useEffect(() => {
    if (!announcement || !isLoggedIn || !hideForTodayKey) {
      setIsOpen(false)
      return
    }

    setHideForToday(false)
    setIsOpen(window.localStorage.getItem(hideForTodayKey) !== today())
  }, [announcement, hideForTodayKey, isLoggedIn])

  const handleClose = () => {
    if (hideForTodayKey) {
      if (hideForToday) {
        window.localStorage.setItem(hideForTodayKey, today())
      } else {
        window.localStorage.removeItem(hideForTodayKey)
      }
    }
    setIsOpen(false)
  }

  if (!announcement || !isLoggedIn || !isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-8">
      <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.28)] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">系统公告</div>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950 sm:text-3xl">{announcement.title}</h2>
          </div>
          <button type="button" onClick={handleClose} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-900">
            关闭
          </button>
        </div>

        <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-600 sm:text-base">
          {announcement.body}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {announcement.ctaLabel && announcement.ctaHref ? (
            <Link href={announcement.ctaHref} onClick={handleClose} className="inline-flex items-center justify-center rounded-full bg-amazon-orange px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600">
              {announcement.ctaLabel}
            </Link>
          ) : null}
          <button type="button" onClick={handleClose} className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950">
            我知道了
          </button>
        </div>
        <label className="mt-5 flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={hideForToday}
            onChange={(event) => setHideForToday(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          今日不再显示
        </label>
      </div>
    </div>
  )
}
