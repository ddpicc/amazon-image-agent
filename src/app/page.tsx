import Link from 'next/link'
import { redirect } from 'next/navigation'
import AnnouncementModal from '@/components/AnnouncementModal'
import { getCurrentUser } from '@/lib/auth'
import { getActiveAnnouncement } from '@/lib/announcements'

// 新增工作流入口：往这里加一项即可。
// icon 可选（见 ENTRY_ICONS），不填或填了未知 key 会用通用图标；accent 填一段 tailwind 渐变类。
const entries = [
  {
    href: '/amazon',
    icon: 'bag',
    eyebrow: '亚马逊工作流',
    title: '做 Amazon 图片',
    description: '上传商品信息与参考图，先做分析，再生成适合 Amazon listing 的整套图片或单张图片。',
    bullets: ['商品分析 + 提示词生成', '图片规范与参考图建议', '支持整套图与单张精修'],
    accent: 'from-amazon-orange/20 via-orange-100 to-white',
    iconTone: 'bg-orange-100 text-orange-600',
  },
  {
    href: '/playground',
    icon: 'sparkles',
    eyebrow: '自由生成',
    title: '单张自由生成',
    description: '独立测试页，直接组合提示词、参考图、宽高比与尺寸，快速验证单张图片效果。',
    bullets: ['不依赖商品分析', '自由选择比例与尺寸', '适合测试构图、风格与参考图效果'],
    accent: 'from-amazon-blue/20 via-sky-100 to-white',
    iconTone: 'bg-sky-100 text-sky-600',
  },
]

// 即将上线的工作流入口：先占位展示（不可点击）。上线时把对应项搬进上面的 entries 数组即可。
const upcomingEntries = [
  {
    icon: 'shield-check',
    eyebrow: '图片工具',
    title: '平台合规体检',
    description: '上传商品图，按 Amazon、Temu 等平台的主图规范逐项检查，输出可执行的整改建议。',
    bullets: ['白底、占比、水印逐项检查', '覆盖多平台主图规范', '不通过项给出整改方向'],
    accent: 'from-emerald-100/60 via-teal-50 to-white',
    iconTone: 'bg-emerald-100 text-emerald-600',
  },
  {
    icon: 'photo',
    eyebrow: 'Temu 工作流',
    title: '做 Temu 图片',
    description: '按 Temu 上架图片的尺寸与规范，从商品分析到成品图一步到位生成。',
    bullets: ['符合 Temu 图片规格', '商品分析 + 提示词生成', '支持整套图与单张精修'],
    accent: 'from-rose-100/60 via-orange-50 to-white',
    iconTone: 'bg-rose-100 text-rose-600',
  },
  {
    icon: 'link',
    eyebrow: '货源复刻',
    title: '1688 / 拼多多链接生图',
    description: '粘贴 1688 或拼多多商品链接，抓取商品图后直接进入生成流程，产出电商成品图。',
    bullets: ['无需手动上传商品图', '自动抓取主图与 SKU 图', '抓取后接现有生成流程'],
    accent: 'from-violet-200/60 via-fuchsia-50 to-white',
    iconTone: 'bg-violet-100 text-violet-600',
  },
  {
    icon: 'wrench',
    eyebrow: '图片工具箱',
    title: '图片处理工具箱',
    description: '上传图片即可抠白底、精修并提升质感，支持一张图适配多平台尺寸，图内文案还能翻译成目标语言。',
    bullets: ['抠白底、精修、提升质感', '一张图适配多平台尺寸', '图内文案翻译成目标语言'],
    accent: 'from-cyan-100/60 via-sky-50 to-white',
    iconTone: 'bg-cyan-100 text-cyan-600',
  },
]

// 24x24 描边风格图标（heroicons outline 路径），需要新图标时在这里登记 key。
const ENTRY_ICONS: Record<string, string> = {
  bag: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z',
  sparkles:
    'M9.813 15.904 9.5 16.5l-.313-.596a3.75 3.75 0 0 0-1.591-1.591L7 14l.596-.313a3.75 3.75 0 0 0 1.591-1.591L9.5 11.5l.313.596a3.75 3.75 0 0 0 1.591 1.591L12 14l-.596.313a3.75 3.75 0 0 0-1.591 1.591ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z',
  'shield-check':
    'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
  photo:
    'm2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
  link: 'M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244',
  wrench:
    'M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z',
}
const FALLBACK_ICON =
  'M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z'

const heroChips = ['Amazon · Temu 生图', '合规体检', '1688 / 拼多多链接生图', '抠白底 · 精修 · 翻译', '自由生成']

// 卡片不满一行时用占位卡补齐，保持网格完整；新增入口后占位卡会自动减少。
const fillerCount = (3 - ((entries.length + upcomingEntries.length) % 3)) % 3

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
        <section className="relative overflow-hidden border-b border-slate-200">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute -top-40 bottom-0 right-[-10rem] w-[46rem] rounded-full bg-[radial-gradient(closest-side,rgba(255,153,0,0.20),transparent)]" />
            <div className="absolute -bottom-24 left-[-8rem] h-72 w-[34rem] rounded-full bg-[radial-gradient(closest-side,rgba(20,110,180,0.12),transparent)]" />
          </div>
          <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 shadow-sm">
                PageMint
                <span className="h-1 w-1 rounded-full bg-amazon-orange" />
                商品图片工作台
              </span>
              <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
                让商品图片生产，<br className="hidden sm:block" />
                <span className="text-amazon-orange">更有章法</span>。
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                面向跨境与电商平台卖家的图片一站式工作台，从商品分析、AI 成图到合规体检、多平台适配。选择下方入口开始，生成的图片和历史都会自动留存。
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {heroChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-slate-200 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <section aria-labelledby="workflow-heading">
            <div>
              <p className="text-sm font-medium text-amazon-blue">选择工作流</p>
              <h2 id="workflow-heading" className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">从这里开始</h2>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {entries.map((entry) => (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className={`group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white px-6 py-7 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_18px_40px_rgba(15,23,42,0.10)] ${entry.accent}`}
                >
                  <div className="relative flex items-start justify-between gap-4">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/80 shadow-sm backdrop-blur ${entry.iconTone}`}>
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d={ENTRY_ICONS[entry.icon] ?? FALLBACK_ICON} />
                      </svg>
                    </span>
                    <span className="inline-flex rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 backdrop-blur">
                      {entry.eyebrow}
                    </span>
                  </div>
                  <div className="relative mt-6 flex grow flex-col">
                    <h3 className="text-2xl font-semibold text-slate-950">{entry.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{entry.description}</p>
                    <ul className="mt-6 space-y-3 text-sm text-slate-700">
                      {entry.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-3">
                          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amazon-blue" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
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

              {upcomingEntries.map((entry) => (
                <div
                  key={entry.title}
                  className={`relative flex flex-col rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-7 ${entry.accent}`}
                >
                  <div className="relative flex items-start justify-between gap-4">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/80 shadow-sm ${entry.iconTone}`}>
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d={ENTRY_ICONS[entry.icon] ?? FALLBACK_ICON} />
                      </svg>
                    </span>
                    <span className="inline-flex rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 backdrop-blur">
                      {entry.eyebrow}
                    </span>
                  </div>
                  <div className="relative mt-6 flex grow flex-col">
                    <h3 className="text-2xl font-semibold text-slate-950">{entry.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{entry.description}</p>
                    <ul className="mt-6 space-y-3 text-sm text-slate-700">
                      {entry.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-3">
                          <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-8">
                      <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">即将上线</span>
                    </div>
                  </div>
                </div>
              ))}

              {Array.from({ length: fillerCount }).map((_, index) => (
                <div
                  key={`filler-${index}`}
                  className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 px-6 py-7 text-center"
                  aria-hidden="true"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </span>
                  <p className="mt-4 text-sm font-semibold text-slate-500">更多工作流整理中</p>
                  <p className="mt-1 text-xs text-slate-400">新入口会陆续加到这里</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
