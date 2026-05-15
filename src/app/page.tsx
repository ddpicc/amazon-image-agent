import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'

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
]

export default async function Home() {
  const user = await getCurrentUser()

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,153,0,0.12),_transparent_32%),linear-gradient(180deg,#fff_0%,#f8fafc_100%)]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-10 sm:px-6 lg:px-8">
        <div className="panel relative overflow-hidden px-6 py-8 sm:px-10 sm:py-12">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-amazon-orange/10 to-transparent lg:block" />
          <div className="relative max-w-3xl">
            <span className="inline-flex rounded-full bg-amazon-dark px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/90">
              Amazon 图片生成助手
            </span>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              选择更适合你的商品图片工作流。
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
              你可以选择结构化的 Amazon 图片流程，用于正式商品图生产；也可以进入单张自由生成页，快速测试提示词、参考图和构图方向。
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {entries.map((entry) => (
            <Link
              key={entry.href}
              href={entry.href}
              className={`panel group relative overflow-hidden px-6 py-7 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_30px_80px_rgba(15,23,42,0.14)] ${entry.accent}`}
            >
              <div className="absolute inset-0 bg-gradient-to-br opacity-90" />
              <div className="relative">
                <span className="inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
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
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-900" />
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
      </div>
    </main>
  )
}
