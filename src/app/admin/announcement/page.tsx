import AdminAnnouncementForm from './AdminAnnouncementForm'
import AdminAnnouncementHistory from './AdminAnnouncementHistory'
import { requireAdmin } from '@/lib/auth'
import { getAnnouncementHistory, getLatestAnnouncement } from '@/lib/announcements'

export default async function AdminAnnouncementPage() {
  await requireAdmin()

  const currentTime = new Date().toISOString()
  const [announcement, history] = await Promise.all([
    getLatestAnnouncement(),
    getAnnouncementHistory(),
  ])

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">登录公告</h1>
            <p className="mt-2 text-sm text-slate-500">发布登录公告，并在这里查看或删除全部历史记录。</p>
          </div>
        </div>

        <section className="panel p-6">
          <AdminAnnouncementForm
            key={announcement?.id ?? 'new-announcement'}
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

        <AdminAnnouncementHistory
          currentTime={currentTime}
          initialItems={history.map((item) => ({
            id: item.id,
            title: item.title,
            body: item.body,
            isActive: item.isActive,
            startsAt: item.startsAt?.toISOString() ?? null,
            endsAt: item.endsAt?.toISOString() ?? null,
            ctaLabel: item.ctaLabel,
            ctaHref: item.ctaHref,
            publishedAt: item.publishedAt?.toISOString() ?? null,
            createdAt: item.createdAt.toISOString(),
          }))}
        />
      </div>
    </main>
  )
}
