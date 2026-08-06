import Link from 'next/link'
import { redirect } from 'next/navigation'
import AnnouncementModal from '@/components/AnnouncementModal'
import { getCurrentUser } from '@/lib/auth'
import { getActiveAnnouncement } from '@/lib/announcements'

const entries = [
  {
    href: '/amazon',
    eyebrow: '亚马逊工作流',
    title: '做 Amazon 图片',
    description: '上传商品信息与参考图，先做分析，再生成适合 Amazon listing 的整套图片或单张图片。',
    bullets: ['商品分析 + 提示词生成', '图片规范与参考图建议', '支持整套图与单张精修'],
    accent: 'from-amazon-orange/20 via-orange-100 to-white',
  },
  {
    href: '/playground',
    eyebrow: '自由生成',
    title: '单张自由生成',
    description: '独立测试页，直接组合提示词、参考图、宽高比与尺寸，快速验证单张图片效果。',
    bullets: ['不依赖商品分析', '自由选择比例与尺寸', '适合测试构图、风格与参考图效果'],
    accent: 'from-amazon-blue/20 via-sky-100 to-white',
  },
  {
    href: '/reverse-prompt',
    eyebrow: '灵感拆解',
    title: '以图生提示词',
    description: '上传一张目标图，让 AI 拆解出可直接继续编辑和生图的提示词，再配合参考图做二次生成。',
    bullets: ['先看图再反推提示词', '支持复制、编辑后继续生图', '适合复刻风格、构图与质感方向'],
    accent: 'from-violet-200/70 via-fuchsia-50 to-white',
  },
]

export default async function Home() {
  const user = await getCurrentUser()

  if (user?.role === 'ADMIN') {
    redirect('/admin')
  }

  const announcement = user ? await getActiveAnnouncement() : null

  return (
    <>
      <AnnouncementModal
        isLoggedIn={Boolean(user)}
        announcement={announcement
          ? {
              id: announcement.id,
              title: announcement.title,
              body: announcement.body,
              ctaLabel: announcement.ctaLabel,
              ctaHref: announcement.ctaHref,
            }
          : null}
      />
      <main className="bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_58%,#ffffff_100%)]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <section className="relative overflow-hidden border-b border-slate-200 pb-10 sm:pb-14">
            <div className="absolute -right-24 -top-36 h-80 w-80 rounded-full bg-orange-100/70 blur-3xl" />
            <div className="absolute -left-20 bottom-0 h-40 w-40 rounded-full bg-sky-100/60 blur-3xl" />
            <div className="relative max-w-3xl">
              <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
                PageMint
              </span>
              <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
                让商品图片生产，<br className="hidden sm:block" />更有章法。
              </h1>
            </div>
          </section>

          <section className="mt-10" aria-labelledby="workflow-heading">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-amazon-blue">选择工作流</p>
                <h2 id="workflow-heading" className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">从这里开始</h2>
              </div>
              <p className="text-sm text-slate-500">按你的当前任务选择入口</p>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {entries.map((entry) => (
                <Link
                key={entry.href}
                href={entry.href}
                className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-6 py-7 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_40px_rgba(15,23,42,0.10)] ${entry.accent}`}
              >
                <div className="absolute inset-0 bg-gradient-to-br opacity-70" />
                <div className="relative">
                  <span className="inline-flex rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 backdrop-blur">
                    {entry.eyebrow}
                  </span>
                  <h2 className="mt-5 text-2xl font-semibold text-slate-950">
                    {entry.title}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {entry.description}
                  </p>
                  <ul className="mt-6 space-y-3 text-sm text-slate-700">
                    {entry.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-900" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {user ? '进入工作流' : '登录后进入工作流'}
                    <span className="transition group-hover:translate-x-1">→</span>
                  </div>
                </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
