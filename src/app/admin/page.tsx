import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { formatDateTimeInBeijing, formatNullableDateTimeInBeijing } from '@/lib/date'
import { formatPoints, toDisplayPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'

function getStartOfTodayInBeijing() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const partValue = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value

  return new Date(`${partValue('year')}-${partValue('month')}-${partValue('day')}T00:00:00+08:00`)
}

function formatMoney(amountCents: number) {
  return `¥${(amountCents / 100).toFixed(2)}`
}

export default async function AdminWorkbenchPage() {
  await requireAdmin()

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const startOfTodayInBeijing = getStartOfTodayInBeijing()

  const [
    totalUsers,
    newUsers7d,
    userBalanceAggregate,
    paidOrders,
    paidOrders7d,
    generationDebitsToday,
    recentImageFailures,
    recentAnalysisFailures,
    textProviderIssues,
    recentPayments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.user.aggregate({
      _sum: { pointsBalance: true },
    }),
    prisma.paymentOrder.aggregate({
      where: { status: 'PAID' },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.paymentOrder.aggregate({
      where: {
        status: 'PAID',
        paidAt: { gte: sevenDaysAgo },
      },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.pointsLedgerEntry.aggregate({
      where: {
        type: 'GENERATION_DEBIT',
        createdAt: { gte: startOfTodayInBeijing },
      },
      _sum: { pointsDelta: true },
      _count: { _all: true },
    }),
    prisma.imageGenerationRequest.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        entryApi: true,
        errorMessage: true,
        user: {
          select: { email: true },
        },
      },
    }),
    prisma.analysisRecord.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        productName: true,
        errorMessage: true,
        user: {
          select: { email: true },
        },
      },
    }),
    prisma.textProvider.findMany({
      where: {
        OR: [
          { enabled: false },
          { failureCount: { gt: 0 } },
          { cooldownUntil: { gt: new Date() } },
        ],
      },
      orderBy: [
        { cooldownUntil: 'desc' },
        { failureCount: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: 5,
      select: {
        id: true,
        name: true,
        model: true,
        enabled: true,
        failureCount: true,
        cooldownUntil: true,
        updatedAt: true,
      },
    }),
    prisma.paymentOrder.findMany({
      where: { status: 'PAID' },
      orderBy: { paidAt: 'desc' },
      take: 5,
      include: {
        user: { select: { email: true } },
        paymentPackage: { select: { name: true, points: true } },
      },
    }),
  ])

  const totalRechargeAmountCents = paidOrders._sum.amountCents ?? 0
  const recentRechargeAmountCents = paidOrders7d._sum.amountCents ?? 0
  const spentPointsToday = Math.abs(generationDebitsToday._sum.pointsDelta ?? 0)
  const totalBalancePoints = toDisplayPoints(userBalanceAggregate._sum.pointsBalance ?? 0)

  const cards = [
    {
      label: '用户总数',
      value: `${totalUsers}`,
      hint: `近 7 天新增 ${newUsers7d}`,
    },
    {
      label: '余额汇总',
      value: `${formatPoints(totalBalancePoints)} 积分`,
      hint: '当前所有用户账户余额汇总',
    },
    {
      label: '累计充值',
      value: formatMoney(totalRechargeAmountCents),
      hint: `近 7 天 ${formatMoney(recentRechargeAmountCents)} / ${paidOrders7d._count._all} 笔`,
    },
    {
      label: '今日消耗',
      value: `${formatPoints(toDisplayPoints(spentPointsToday))} 积分`,
      hint: `今日已扣除 ${generationDebitsToday._count._all} 次`,
    },
  ]

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员工作台</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">运营总览</h1>
            <p className="mt-2 text-sm text-slate-500">查看用户、充值、消耗、失败请求与 Provider 健康状态，作为管理员日常运营与排障入口。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/users" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
              用户总览
            </Link>
            <Link href="/admin/points" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
              积分与充值
            </Link>
            <Link href="/admin/operations" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
              AI 操作
            </Link>
            <Link href="/admin/image-records" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
              生图记录
            </Link>
            <Link href="/admin/image-models" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
              生图模型
            </Link>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="panel p-6">
              <div className="text-sm text-slate-500">{card.label}</div>
              <div className="mt-3 text-3xl font-semibold text-slate-950">{card.value}</div>
              <div className="mt-2 text-sm text-slate-500">{card.hint}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="panel p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">最近失败的生图请求</h2>
                <p className="mt-1 text-sm text-slate-500">优先查看最新失败、报错和线路信息。</p>
              </div>
              <Link href="/admin/image-records" className="text-sm font-medium text-amazon-blue hover:text-blue-600">
                查看全部
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {recentImageFailures.length === 0 ? (
                <p className="text-sm text-slate-500">最近没有失败的生图请求。</p>
              ) : recentImageFailures.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-medium text-slate-900">{item.user.email}</div>
                    <div className="text-xs text-slate-500">{formatDateTimeInBeijing(item.createdAt)}</div>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">接口：{item.entryApi}</div>
                  <div className="mt-2 text-sm text-rose-600">{item.errorMessage || '未记录错误信息'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">最近失败的分析请求</h2>
                <p className="mt-1 text-sm text-slate-500">帮助定位文本分析与提示词链路问题。</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {recentAnalysisFailures.length === 0 ? (
                <p className="text-sm text-slate-500">最近没有失败的分析请求。</p>
              ) : recentAnalysisFailures.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-medium text-slate-900">{item.user.email}</div>
                    <div className="text-xs text-slate-500">{formatDateTimeInBeijing(item.createdAt)}</div>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">商品：{item.productName}</div>
                  <div className="mt-2 text-sm text-rose-600">{item.errorMessage || '未记录错误信息'}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="panel p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">最近充值到账</h2>
                <p className="mt-1 text-sm text-slate-500">快速查看近期付费转化与套餐情况。</p>
              </div>
              <Link href="/admin/points" className="text-sm font-medium text-amazon-blue hover:text-blue-600">
                查看积分与充值
              </Link>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4">用户</th>
                    <th className="pb-3 pr-4">套餐</th>
                    <th className="pb-3 pr-4">金额</th>
                    <th className="pb-3 pr-4">积分</th>
                    <th className="pb-3">到账时间</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((order) => (
                    <tr key={order.id} className="border-t border-slate-200">
                      <td className="py-4 pr-4 text-slate-700">{order.user.email}</td>
                      <td className="py-4 pr-4 text-slate-700">{order.paymentPackage.name}</td>
                      <td className="py-4 pr-4 text-slate-700">{formatMoney(order.amountCents)}</td>
                      <td className="py-4 pr-4 text-slate-700">{formatPoints(toDisplayPoints(order.paymentPackage.points))}</td>
                      <td className="py-4 text-slate-700">{formatNullableDateTimeInBeijing(order.paidAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">异常文本 Provider</h2>
                <p className="mt-1 text-sm text-slate-500">图片线路已迁到远端 worker，这里只关注文本链路的禁用、冷却与失败情况。</p>
              </div>
              <Link href="/admin/providers" className="text-sm font-medium text-amazon-blue hover:text-blue-600">
                查看 Provider
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {textProviderIssues.length === 0 ? (
                <p className="text-sm text-slate-500">当前没有异常文本 Provider。</p>
              ) : textProviderIssues.map((provider) => (
                <div key={provider.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{provider.name}</div>
                      <div className="mt-1 text-sm text-slate-600">{provider.model}</div>
                    </div>
                    <div className="text-xs text-slate-500">更新于 {formatDateTimeInBeijing(provider.updatedAt)}</div>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">失败次数：{provider.failureCount}</div>
                  <div className="mt-1 text-sm text-slate-600">状态：{provider.enabled ? '启用中' : '已禁用'}</div>
                  <div className="mt-1 text-sm text-slate-600">冷却至：{formatNullableDateTimeInBeijing(provider.cooldownUntil)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
