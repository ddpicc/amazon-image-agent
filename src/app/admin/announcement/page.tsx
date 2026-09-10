import Link from 'next/link'
import AdminAnnouncementForm from './AdminAnnouncementForm'
import { requireAdmin } from '@/lib/auth'
import { getLatestAnnouncement } from '@/lib/announcements'

export default async function AdminAnnouncementPage() {
  await requireAdmin()

  const announcement = await getLatestAnnouncement()

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">登录公告</h1>
            <p className="mt-2 text-sm text-slate-500">为普通用户配置首次访问时弹出的公告，历史公告会保留在通知页。</p>
          </div>
          <Link href="/admin" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回工作台
          </Link>
        </div>

        <section className="panel p-6">
          <AdminAnnouncementForm
            initialAnnouncement={announcement ? {
              id: announcement.id,
              title: announcement.title,
              body: announcement.body,
              isActive: announcement.isActive,
              startsAt: announcement.startsAt ? announcement.startsAt.toISOString() : null,
              endsAt: announcement.endsAt ? announcement.endsAt.toISOString() : null,
              ctaLabel: announcement.ctaLabel,
              ctaHref: announcement.ctaHref,
              updatedAt: announcement.updatedAt.toISOString(),
            } : null}
          />
        </section>
      </div>
    </main>
  )
}
