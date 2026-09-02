import Image from 'next/image'
import Link from 'next/link'

const quickLinks = [
  { href: '/amazon', label: '做 Amazon 图片' },
  { href: '/playground', label: '单张自由生成' },
  { href: '/points', label: '积分中心' },
  { href: '/history', label: '我的历史' },
]

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1.3fr] lg:px-8">
        <div>
          <Link href="/" className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-900">
            PageMint
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
            面向跨境卖家的 AI 商品图片工作台，让图片生产更清晰、更高效。
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-900">快速导航</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {quickLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-slate-600 transition hover:text-slate-950">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-900">联系与支持</h2>
          <div className="mt-4 inline-flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Image
              src="/wechat-contact-qr.png"
              alt="微信联系二维码"
              width={96}
              height={96}
              className="h-24 w-24 rounded-lg bg-white"
            />
            <div>
              <p className="text-sm font-semibold text-slate-800">微信扫码添加</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">产品咨询 · 功能反馈 · 使用支持</p>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-100">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} PageMint. All rights reserved.</span>
          <span>AI 生成结果请在使用前自行核验。</span>
        </div>
      </div>
    </footer>
  )
}
