import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { formatDateTimeInBeijing } from '@/lib/date'
import { formatPoints, toDisplayPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'

export default async function AdminUsersPage() {
  await requireAdmin()

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      invitedBy: {
        select: {
          email: true,
        },
      },
      pointsBalance: true,
      createdAt: true,
      _count: {
        select: {
          paymentOrders: true,
          imageGenerationRequests: true,
          analysisRecords: true,
        },
      },
      paymentOrders: {
        where: { status: 'PAID' },
        orderBy: { paidAt: 'desc' },
        select: {
          amountCents: true,
          paidAt: true,
          paymentPackage: {
            select: { points: true },
          },
        },
      },
      pointsLedgerEntries: {
        where: { type: 'GENERATION_DEBIT' },
        select: {
          pointsDelta: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">用户总览</h1>
            <p className="mt-2 text-sm text-slate-500">查看每个用户的余额、充值、消耗与最近活跃情况，作为后续用户详情页的基础。</p>
          </div>
          <Link href="/admin" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回工作台
          </Link>
        </div>

        <div className="panel overflow-x-auto p-6">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-3 pr-4">邮箱</th>
                <th className="pb-3 pr-4">邀请人</th>
                <th className="pb-3 pr-4">角色</th>
                <th className="pb-3 pr-4">注册时间</th>
                <th className="pb-3 pr-4">当前余额</th>
                <th className="pb-3 pr-4">总充值金额</th>
                <th className="pb-3 pr-4">总充值积分</th>
                <th className="pb-3 pr-4">总消耗积分</th>
                <th className="pb-3 pr-4">最近活跃</th>
                <th className="pb-3 pr-4">生图次数</th>
                <th className="pb-3">分析次数</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const totalRechargeAmountCents = user.paymentOrders.reduce((sum, order) => sum + order.amountCents, 0)
                const totalRechargePoints = user.paymentOrders.reduce((sum, order) => sum + order.paymentPackage.points, 0)
                const totalSpentPoints = Math.abs(user.pointsLedgerEntries.reduce((sum, entry) => sum + entry.pointsDelta, 0))
                const lastRechargeAt = user.paymentOrders[0]?.paidAt ?? null
                const lastSpendAt = user.pointsLedgerEntries[0]?.createdAt ?? null
                const lastActiveAt = [lastRechargeAt, lastSpendAt, user.createdAt]
                  .filter((value): value is Date => value instanceof Date)
                  .sort((a, b) => b.getTime() - a.getTime())[0]

                return (
                  <tr key={user.id} className="border-t border-slate-200 align-top">
                    <td className="py-4 pr-4 text-slate-700">{user.email}</td>
                    <td className="py-4 pr-4 text-slate-700">{user.invitedBy?.email ?? '-'}</td>
                    <td className="py-4 pr-4 text-slate-700">{user.role}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatDateTimeInBeijing(user.createdAt)}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatPoints(toDisplayPoints(user.pointsBalance))}</td>
                    <td className="py-4 pr-4 text-slate-700">¥{(totalRechargeAmountCents / 100).toFixed(2)}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatPoints(toDisplayPoints(totalRechargePoints))}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatPoints(toDisplayPoints(totalSpentPoints))}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatDateTimeInBeijing(lastActiveAt)}</td>
                    <td className="py-4 pr-4 text-slate-700">{user._count.imageGenerationRequests}</td>
                    <td className="py-4 text-slate-700">{user._count.analysisRecords}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
