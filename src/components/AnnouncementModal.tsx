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

  const dismissedKey = useMemo(() => {
    return announcement ? `announcement:dismissed:${announcement.id}` : ''
  }, [announcement])

  useEffect(() => {
    if (!announcement || !isLoggedIn || !dismissedKey) {
      setIsOpen(false)
      return
    }

    const dismissed = window.localStorage.getItem(dismissedKey)
    setIsOpen(!dismissed)
  }, [announcement, dismissedKey, isLoggedIn])

  const handleClose = () => {
    if (dismissedKey) {
      window.localStorage.setItem(dismissedKey, '1')
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
      </div>
    </div>
  )
}
