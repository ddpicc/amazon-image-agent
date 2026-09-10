import Link from 'next/link'
import { PointsLedgerType } from '@prisma/client'
import { requireAdmin } from '@/lib/auth'
import { formatDateTimeInBeijing } from '@/lib/date'
import { formatPoints, toCurrentDisplayPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 50

const typeLabels: Record<PointsLedgerType, string> = {
  REDEEM_CODE: '兑换码到账',
  PAYMENT_RECHARGE: '充值到账',
  GENERATION_DEBIT: '生成扣费',
  GENERATION_REFUND: '生成退款',
  SIGNUP_BONUS: '注册赠送',
  REFERRAL_INVITEE_BONUS: '受邀注册奖励',
  REFERRAL_INVITER_REWARD: '邀请人奖励',
  ADMIN_ADJUSTMENT: '管理员调整',
}

function normalizePage(value?: string) {
  const parsed = Number.parseInt(value || '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function getAdjustmentReason(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const reason = (metadata as Record<string, unknown>).reason
  return typeof reason === 'string' && reason.trim() ? reason : null
}

export default async function AdminPointsLedgerPage({ searchParams }: { searchParams?: { page?: string } }) {
  await requireAdmin()

  const total = await prisma.pointsLedgerEntry.count()
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(normalizePage(searchParams?.page), totalPages)
  const entries = await prisma.pointsLedgerEntry.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      user: { select: { email: true } },
    },
  })

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">内容与记录</div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">积分流水</h1>
          <p className="mt-2 text-sm text-slate-500">查看全部充值、消费、奖励、退款和管理员调整记录。</p>
        </div>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="font-semibold text-slate-950">全部流水</h2>
              <p className="mt-1 text-sm text-slate-500">管理员调整会同时记录实际变化、调整后余额和原因。</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">共 {total} 条</span>
          </div>

          <div className="overflow-x-auto px-6">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-4 pr-5">用户</th>
                  <th className="py-4 pr-5">类型</th>
                  <th className="py-4 pr-5">积分变动</th>
                  <th className="py-4 pr-5">变动后余额</th>
                  <th className="py-4 pr-5">原因</th>
                  <th className="py-4">时间</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr><td colSpan={6} className="border-t border-slate-200 py-12 text-center text-slate-500">暂无积分流水。</td></tr>
                ) : entries.map((entry) => {
                  const pointsDelta = toCurrentDisplayPoints(entry.pointsDelta, entry.metadata, entry.referenceType)
                  const balanceAfter = toCurrentDisplayPoints(entry.balanceAfter, entry.metadata, entry.referenceType)
                  const reason = getAdjustmentReason(entry.metadata)
                  return (
                    <tr key={entry.id} className="border-t border-slate-200 align-top">
                      <td className="whitespace-nowrap py-4 pr-5 text-slate-700">{entry.user.email}</td>
                      <td className="whitespace-nowrap py-4 pr-5 text-slate-700">{typeLabels[entry.type]}</td>
                      <td className={`whitespace-nowrap py-4 pr-5 font-semibold ${pointsDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {pointsDelta > 0 ? '+' : ''}{formatPoints(pointsDelta)}
                      </td>
                      <td className="whitespace-nowrap py-4 pr-5 text-slate-700">{formatPoints(balanceAfter)}</td>
                      <td className="min-w-48 py-4 pr-5 text-slate-600">{reason || '—'}</td>
                      <td className="whitespace-nowrap py-4 text-slate-500">{formatDateTimeInBeijing(entry.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {total > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">第 {page} / {totalPages} 页</div>
              <div className="flex gap-3">
                <Link
                  href={page <= 2 ? '/admin/points-ledger' : `/admin/points-ledger?page=${page - 1}`}
                  aria-disabled={page <= 1}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${page <= 1 ? 'pointer-events-none border-slate-200 text-slate-300' : 'cursor-pointer border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-950'}`}
                >
                  上一页
                </Link>
                <Link
                  href={`/admin/points-ledger?page=${page + 1}`}
                  aria-disabled={page >= totalPages}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${page >= totalPages ? 'pointer-events-none border-slate-200 text-slate-300' : 'cursor-pointer border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-950'}`}
                >
                  下一页
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
