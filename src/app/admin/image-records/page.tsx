import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { formatDateTimeInBeijing } from '@/lib/date'
import { formatInternalPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 20

interface AdminImageRecordsPageProps {
  searchParams?: {
    page?: string
  }
}

function normalizePage(value?: string) {
  const parsed = Number.parseInt(value || '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function buildPageHref(page: number) {
  return page <= 1 ? '/admin/image-records' : `/admin/image-records?page=${page}`
}

function getRecordType(record: {
  billingScene: string | null
  sourcePage: string
  imageType: string | null
}) {
  if (record.billingScene === 'aplus' || record.imageType?.startsWith('aplus-')) {
    return 'A+'
  }

  if (record.sourcePage === 'AMAZON' || record.billingScene === 'amazon') {
    return '亚马逊产品图'
  }

  return '其他'
}

export default async function AdminImageRecordsPage({ searchParams }: AdminImageRecordsPageProps) {
  await requireAdmin()

  const requestedPage = normalizePage(searchParams?.page)
  const total = await prisma.imageGenerationRequest.count()
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(requestedPage, totalPages)
  const skip = (currentPage - 1) * PAGE_SIZE

  const records = await prisma.imageGenerationRequest.findMany({
    orderBy: { createdAt: 'desc' },
    skip,
    take: PAGE_SIZE,
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

        <div className="panel p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">调用列表</h2>
              <p className="mt-1 text-sm text-slate-500">按创建时间倒序展示，每页 {PAGE_SIZE} 条。</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              共 {total} 条
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-3 pr-4">用户</th>
                  <th className="pb-3 pr-4">类型</th>
                  <th className="pb-3 pr-4">模型</th>
                  <th className="pb-3 pr-4">积分</th>
                  <th className="pb-3 pr-4">时间</th>
                  <th className="pb-3 pr-4">耗时</th>
                  <th className="pb-3 pr-4">状态</th>
                  <th className="pb-3">产出</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">暂无生图调用记录。</td>
                  </tr>
                ) : records.map((record: AdminImageRecord) => (
                  <tr key={record.id} className="border-t border-slate-200 align-top">
                    <td className="py-4 pr-4 text-slate-700">{record.user.email}</td>
                    <td className="py-4 pr-4 text-slate-700">{getRecordType(record)}</td>
                    <td className="max-w-48 break-all py-4 pr-4 text-slate-700">{record.model || '-'}</td>
                    <td className="py-4 pr-4 text-slate-700">{record.billingCost === null ? '-' : formatInternalPoints(record.billingCost)}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatDateTimeInBeijing(record.createdAt)}</td>
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

          {total > 0 && (
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                第 {currentPage} / {totalPages} 页
              </div>
              <div className="flex items-center gap-3">
                {currentPage > 1 ? (
                  <Link href={buildPageHref(currentPage - 1)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900">
                    上一页
                  </Link>
                ) : (
                  <span className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-400">
                    上一页
                  </span>
                )}
                {currentPage < totalPages ? (
                  <Link href={buildPageHref(currentPage + 1)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900">
                    下一页
                  </Link>
                ) : (
                  <span className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-400">
                    下一页
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
