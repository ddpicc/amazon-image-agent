import Image from 'next/image'
import Link from 'next/link'

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1.35fr_1fr] lg:px-8">
        <div>
          <Link href="/" className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-900">
            PageMint
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
            面向跨境卖家的 AI 商品图片工作台，让图片生产更清晰、更高效。
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-900">联系与支持</h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">产品咨询、功能反馈或使用支持，欢迎通过微信联系我。</p>
          <div className="mt-4 inline-flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Image
              src="/wechat-contact-qr.png"
              alt="微信联系二维码"
              width={112}
              height={112}
              className="h-28 w-28 rounded-lg bg-white"
            />
            <p className="text-sm font-medium leading-6 text-slate-700">微信扫码<br />联系我</p>
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
