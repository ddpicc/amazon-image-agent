'use client'

import Link from 'next/link'
import { useState } from 'react'

export interface NotificationItem {
  id: string
  title: string
  body: string
  ctaLabel: string | null
  ctaHref: string | null
  timeText: string
  isCurrent: boolean
}

export default function NotificationsList({ items }: { items: NotificationItem[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const expanded = expandedIds.has(item.id)
        return (
          <article key={item.id} className="panel overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(item.id)}
              aria-expanded={expanded}
              className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left transition hover:bg-slate-50"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-950">{item.title}</h2>
                  {item.isCurrent ? (
                    <span className="rounded-full bg-amazon-orange/10 px-2.5 py-0.5 text-xs font-semibold text-orange-600">当前公告</span>
                  ) : null}
                </div>
                <time className="mt-1 block text-xs text-slate-400">{item.timeText}</time>
              </div>
              <svg
                className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {expanded ? (
              <div className="border-t border-slate-100 px-6 py-5">
                <div className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{item.body}</div>
                {item.ctaLabel && item.ctaHref ? (
                  <div className="mt-4">
                    <Link href={item.ctaHref} className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950">
                      {item.ctaLabel}
                      <span className="ml-1.5">→</span>
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
