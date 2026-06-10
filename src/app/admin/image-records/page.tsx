import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { formatDateTimeInBeijing } from '@/lib/date'
import { prisma } from '@/lib/prisma'

export default async function AdminImageRecordsPage() {
  await requireAdmin()

  const records = await prisma.imageGenerationRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: true,
    },
  })
  type AdminImageRecord = (typeof records)[number]

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">生图调用记录</h1>
          </div>
          <Link href="/admin" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回工作台
          </Link>
        </div>

        <div className="panel overflow-x-auto p-6">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-3 pr-4">用户</th>
                <th className="pb-3 pr-4">时间</th>
                <th className="pb-3 pr-4">接口</th>
                <th className="pb-3 pr-4">耗时</th>
                <th className="pb-3 pr-4">状态</th>
                <th className="pb-3">产出</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record: AdminImageRecord) => (
                <tr key={record.id} className="border-t border-slate-200 align-top">
                  <td className="py-4 pr-4 text-slate-700">{record.user.email}</td>
                  <td className="py-4 pr-4 text-slate-700">{formatDateTimeInBeijing(record.createdAt)}</td>
                  <td className="py-4 pr-4 text-slate-700">{record.entryApi}</td>
                  <td className="py-4 pr-4 text-slate-700">{record.durationMs ? `${record.durationMs}ms` : '-'}</td>
                  <td className="py-4 pr-4 text-slate-700">{record.status}</td>
                  <td className="py-4">
                    {record.imageUrl ? (
                      <a href={record.imageUrl} target="_blank" className="block">
                        <img src={record.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
                      </a>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
