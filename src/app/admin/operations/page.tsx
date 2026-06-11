import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { formatDateTimeInBeijing, formatNullableDateTimeInBeijing } from '@/lib/date'
import { prisma } from '@/lib/prisma'

function formatOperationKind(kind: string) {
  if (kind === 'IMAGE_GENERATION') return '生图'
  if (kind === 'ANALYSIS') return '商品分析 / Prompt'
  if (kind === 'REVERSE_PROMPT_ANALYZE') return '反推提示词'
  if (kind === 'REVERSE_PROMPT_REFINE') return '反推提示词润色'
  return kind
}

function formatOperationStatus(status: string) {
  if (status === 'SUCCEEDED') return '成功'
  if (status === 'FAILED') return '失败'
  return '进行中'
}

function parseDateInput(value: string | undefined, endOfDay = false) {
  if (!value) return null
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  const parsed = new Date(`${value}${suffix}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const KIND_OPTIONS = [
  { value: 'IMAGE_GENERATION', label: '生图' },
  { value: 'ANALYSIS', label: '商品分析 / Prompt' },
  { value: 'REVERSE_PROMPT_ANALYZE', label: '反推提示词' },
  { value: 'REVERSE_PROMPT_REFINE', label: '反推提示词润色' },
]

const STATUS_OPTIONS = [
  { value: 'STARTED', label: '进行中' },
  { value: 'SUCCEEDED', label: '成功' },
  { value: 'FAILED', label: '失败' },
]

export default async function AdminOperationsPage({
  searchParams,
}: {
  searchParams?: {
    kind?: string
    status?: string
    user?: string
    from?: string
    to?: string
  }
}) {
  await requireAdmin()

  const kind = typeof searchParams?.kind === 'string' ? searchParams.kind : ''
  const status = typeof searchParams?.status === 'string' ? searchParams.status : ''
  const user = typeof searchParams?.user === 'string' ? searchParams.user.trim() : ''
  const from = typeof searchParams?.from === 'string' ? searchParams.from : ''
  const to = typeof searchParams?.to === 'string' ? searchParams.to : ''

  const createdAtFilter: { gte?: Date; lte?: Date } = {}
  const fromDate = parseDateInput(from)
  const toDate = parseDateInput(to, true)
  if (fromDate) createdAtFilter.gte = fromDate
  if (toDate) createdAtFilter.lte = toDate

  const operations = await prisma.aiOperation.findMany({
    where: {
      ...(kind ? { kind: kind as any } : {}),
      ...(status ? { status: status as any } : {}),
      ...(user ? {
        user: {
          email: {
            contains: user,
            mode: 'insensitive',
          },
        },
      } : {}),
      ...(fromDate || toDate ? { createdAt: createdAtFilter } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: {
        select: {
          email: true,
        },
      },
      attempts: {
        orderBy: { attemptIndex: 'asc' },
      },
      imageGenerationRequest: {
        select: {
          imageUrl: true,
        },
      },
    },
  })

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">AI 操作记录</h1>
            <p className="mt-2 text-sm text-slate-500">统一查看商品分析、反推提示词和图片生成操作，支持按类型、状态、用户和时间筛选后下钻详情。</p>
          </div>
          <Link href="/admin" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回工作台
          </Link>
        </div>

        <section className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-950">筛选</h2>
          <form className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="text-sm text-slate-600">
              <div className="mb-2 font-medium text-slate-700">类型</div>
              <select name="kind" defaultValue={kind} className="input-field">
                <option value="">全部</option>
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              <div className="mb-2 font-medium text-slate-700">状态</div>
              <select name="status" defaultValue={status} className="input-field">
                <option value="">全部</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              <div className="mb-2 font-medium text-slate-700">用户邮箱</div>
              <input name="user" defaultValue={user} className="input-field" placeholder="按邮箱模糊搜索" />
            </label>
            <label className="text-sm text-slate-600">
              <div className="mb-2 font-medium text-slate-700">开始日期</div>
              <input type="date" name="from" defaultValue={from} className="input-field" />
            </label>
            <label className="text-sm text-slate-600">
              <div className="mb-2 font-medium text-slate-700">结束日期</div>
              <input type="date" name="to" defaultValue={to} className="input-field" />
            </label>
            <div className="md:col-span-2 xl:col-span-5 flex flex-wrap gap-3">
              <button type="submit" className="rounded-full bg-amazon-blue px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-600">
                应用筛选
              </button>
              <Link href="/admin/operations" className="rounded-full border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                清空筛选
              </Link>
            </div>
          </form>
        </section>

        <div className="panel overflow-x-auto p-6">
          <div className="mb-4 text-sm text-slate-500">当前结果 {operations.length} 条，最多显示最近 100 条匹配记录。</div>
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-3 pr-4">时间</th>
                <th className="pb-3 pr-4">用户</th>
                <th className="pb-3 pr-4">类型</th>
                <th className="pb-3 pr-4">状态</th>
                <th className="pb-3 pr-4">尝试数</th>
                <th className="pb-3 pr-4">耗时</th>
                <th className="pb-3 pr-4">输出图</th>
                <th className="pb-3 pr-4">过期时间</th>
                <th className="pb-3">详情</th>
              </tr>
            </thead>
            <tbody>
              {operations.map((operation) => (
                <tr key={operation.id} className="border-t border-slate-200 align-top">
                  <td className="py-4 pr-4 text-slate-700">{formatDateTimeInBeijing(operation.createdAt)}</td>
                  <td className="py-4 pr-4 text-slate-700">{operation.user.email}</td>
                  <td className="py-4 pr-4 text-slate-700">{formatOperationKind(operation.kind)}</td>
                  <td className="py-4 pr-4 text-slate-700">{formatOperationStatus(operation.status)}</td>
                  <td className="py-4 pr-4 text-slate-700">{operation.attempts.length}</td>
                  <td className="py-4 pr-4 text-slate-700">{operation.durationMs ? `${operation.durationMs}ms` : '-'}</td>
                  <td className="py-4 pr-4 text-slate-700">{operation.imageGenerationRequest?.imageUrl ? 1 : 0}</td>
                  <td className="py-4 pr-4 text-slate-700">{formatNullableDateTimeInBeijing(operation.expiresAt)}</td>
                  <td className="py-4 text-slate-700">
                    <Link href={`/admin/operations/${operation.id}`} className="font-medium text-amazon-blue hover:text-blue-600">
                      查看
                    </Link>
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
