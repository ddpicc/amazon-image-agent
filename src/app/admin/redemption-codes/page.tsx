import AdminCreateRedemptionCodesForm from './AdminCreateRedemptionCodesForm'
import CopyCodeButton from './CopyCodeButton'
import { requireAdmin } from '@/lib/auth'
import { formatDateTimeInBeijing, formatNullableDateTimeInBeijing } from '@/lib/date'
import { formatPoints, toDisplayPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'

export default async function AdminRedemptionCodesPage() {
  await requireAdmin()

  const [codes, packages] = await Promise.all([
    prisma.redemptionCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        redemptionPackage: true,
        redeemedBy: true,
        createdBy: true,
      },
    }),
    prisma.pointsPackage.findMany({
      orderBy: [
        { displayOrder: 'asc' },
        { createdAt: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        points: true,
      },
    }),
  ])

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">兑换码记录</h1>
          </div>
        </div>

        <div className="panel p-6">
          <AdminCreateRedemptionCodesForm packages={packages.map((item) => ({ ...item, points: toDisplayPoints(item.points) }))} />
        </div>

        <div className="panel overflow-x-auto p-6">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-3 pr-4">创建时间</th>
                <th className="pb-3 pr-4">兑换码</th>
                <th className="pb-3 pr-4">积分包</th>
                <th className="pb-3 pr-4">积分</th>
                <th className="pb-3 pr-4">批次</th>
                <th className="pb-3 pr-4">状态</th>
                <th className="pb-3 pr-4">过期时间</th>
                <th className="pb-3 pr-4">兑换用户</th>
                <th className="pb-3">创建人</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id} className="border-t border-slate-200">
                  <td className="py-4 pr-4 text-slate-700">{formatDateTimeInBeijing(code.createdAt)}</td>
                  <td className="py-4 pr-4 text-slate-700">
                    {code.plainCode ? (
                      <div className="inline-flex items-center gap-2">
                        <code className="rounded bg-slate-100 px-2 py-1 text-xs">{code.plainCode}</code>
                        <CopyCodeButton code={code.plainCode} />
                      </div>
                    ) : '-'}
                  </td>
                  <td className="py-4 pr-4 text-slate-700">{code.redemptionPackage?.name || '-'}</td>
                  <td className="py-4 pr-4 text-slate-700">{formatPoints(toDisplayPoints(code.points))}</td>
                  <td className="py-4 pr-4 text-slate-700">{code.batchId || '-'}</td>
                  <td className="py-4 pr-4 text-slate-700">{code.status}</td>
                  <td className="py-4 pr-4 text-slate-700">{formatNullableDateTimeInBeijing(code.expiresAt)}</td>
                  <td className="py-4 pr-4 text-slate-700">{code.redeemedBy?.email || '-'}</td>
                  <td className="py-4 text-slate-700">{code.createdBy.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
