import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { getPointsSummary } from '@/lib/points'
import RechargePageClient from './RechargePageClient'

interface RechargePageProps {
  searchParams?: {
    packageId?: string
  }
}

export default async function RechargePage({ searchParams }: RechargePageProps) {
  const user = await requireUser()
  const summary = await getPointsSummary(user.id)
  const selectedPackageId = searchParams?.packageId || summary.packages[0]?.id || ''

  const initialPackages = summary.packages.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }))

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">充值入口</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">站内直接充值</h1>
            <p className="mt-2 text-sm text-slate-500">创建 ZPAY 订单后可直接扫码支付，支付成功后积分自动到账。</p>
          </div>
          <Link href="/points" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回积分中心
          </Link>
        </div>

        <RechargePageClient initialPackages={initialPackages} initialPackageId={selectedPackageId} />
      </div>
    </main>
  )
}
