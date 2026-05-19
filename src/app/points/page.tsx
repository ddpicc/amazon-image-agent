import Link from 'next/link'
import PointsPageClient, { PointsPageData } from './PointsPageClient'
import { requireUser } from '@/lib/auth'
import { getPointsSummary } from '@/lib/points'

export default async function PointsPage() {
  const user = await requireUser()
  const summary = await getPointsSummary(user.id)

  const initialData: PointsPageData = {
    user: summary.user,
    packages: summary.packages.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    ledgerEntries: summary.ledgerEntries.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    paymentOrders: summary.paymentOrders.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      paymentPackage: {
        ...item.paymentPackage,
        createdAt: item.paymentPackage.createdAt.toISOString(),
        updatedAt: item.paymentPackage.updatedAt.toISOString(),
      },
    })),
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">积分中心</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">充值与兑换</h1>
            <p className="mt-2 text-sm text-slate-500">生成 1 张图片固定消耗 1 积分，先兑换即可开始使用。</p>
          </div>
          <Link href="/" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回首页
          </Link>
        </div>

        <PointsPageClient initialData={initialData} />
      </div>
    </main>
  )
}
