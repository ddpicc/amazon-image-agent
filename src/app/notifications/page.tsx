import Link from 'next/link'
import { requireNonAdminUser } from '@/lib/auth'
import { getActiveAnnouncement, getPublishedAnnouncements } from '@/lib/announcements'
import NotificationsList, { NotificationItem } from './NotificationsList'

function formatAnnouncementTime(value: Date) {
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
}

export default async function NotificationsPage() {
  await requireNonAdminUser()

  const [announcements, activeAnnouncement] = await Promise.all([
    getPublishedAnnouncements(),
    getActiveAnnouncement(),
  ])

  const items: NotificationItem[] = announcements.map((announcement) => ({
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    ctaLabel: announcement.ctaLabel,
    ctaHref: announcement.ctaHref,
    timeText: formatAnnouncementTime(announcement.publishedAt ?? announcement.createdAt),
    isCurrent: activeAnnouncement?.id === announcement.id,
  }))

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">通知中心</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">系统通知</h1>
            <p className="mt-2 text-sm text-slate-500">平台公告与更新说明都会归档在这里，按时间从近到远排列，点击标题可展开查看。</p>
          </div>
          <Link href="/" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回首页
          </Link>
        </div>

        {items.length === 0 ? (
          <section className="panel flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
            </span>
            <p className="mt-4 text-sm font-semibold text-slate-500">暂无通知</p>
            <p className="mt-1 text-xs text-slate-400">有新公告时会第一时间通知你</p>
          </section>
        ) : (
          <NotificationsList items={items} />
        )}
      </div>
    </main>
  )
}
