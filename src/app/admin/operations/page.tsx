import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { formatDateTimeInBeijing } from '@/lib/date'
import { prisma } from '@/lib/prisma'
import {
  formatOperationKind,
  formatOperationSource,
  getDiagnosticToneClass,
  getOperationDiagnostic,
} from './operation-diagnostics'

function parseDateInput(value: string | undefined, endOfDay = false) {
  if (!value) return null
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  const parsed = new Date(`${value}${suffix}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const KIND_OPTIONS = [
  { value: 'IMAGE_GENERATION', label: '生图' },
  { value: 'ANALYSIS', label: '分析 / Prompt' },
]

const STATUS_OPTIONS = [
  { value: 'STARTED', label: '进行中' },
  { value: 'SUCCEEDED', label: '成功' },
  { value: 'FAILED', label: '失败' },
]

interface OperationSearchParams {
  kind?: string
  status?: string
  user?: string
  from?: string
  to?: string
}

function buildStatusHref(searchParams: OperationSearchParams | undefined, nextStatus: string) {
  const params = new URLSearchParams()
  if (searchParams?.kind) params.set('kind', searchParams.kind)
  if (searchParams?.user) params.set('user', searchParams.user)
  if (searchParams?.from) params.set('from', searchParams.from)
  if (searchParams?.to) params.set('to', searchParams.to)
  if (nextStatus) params.set('status', nextStatus)
  const query = params.toString()
  return query ? `/admin/operations?${query}` : '/admin/operations'
}

export default async function AdminOperationsPage({
  searchParams,
}: {
  searchParams?: OperationSearchParams
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
    select: {
      id: true,
      kind: true,
      sourcePage: true,
      status: true,
      errorMessage: true,
      durationMs: true,
      createdAt: true,
      user: {
        select: {
          email: true,
        },
      },
      attempts: {
        orderBy: { attemptIndex: 'asc' },
        select: {
          status: true,
          errorMessage: true,
        },
      },
      imageGenerationRequest: {
        select: {
          status: true,
          statusMessage: true,
          errorMessage: true,
          workerJobId: true,
        },
      },
      analysisRecord: {
        select: {
          status: true,
          errorMessage: true,
        },
      },
    },
  })

  const now = Date.now()
  const rows = operations.map((operation) => ({
    operation,
    diagnostic: getOperationDiagnostic(operation, now),
  }))
  const failedCount = rows.filter(({ operation }) => operation.status === 'FAILED').length
  const runningCount = rows.filter(({ operation }) => operation.status === 'STARTED').length
  const succeededCount = rows.filter(({ operation }) => operation.status === 'SUCCEEDED').length
  const attentionCount = rows.filter(({ diagnostic }) => diagnostic.needsAttention).length

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">AI 操作诊断</h1>
          <p className="mt-2 text-sm text-slate-500">检查生图和分析是否失败、失败发生在哪个阶段，以及系统记录到了什么错误。</p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="当前结果状态概览">
          <div className="panel border-amber-200 bg-amber-50/60 p-5">
            <div className="text-sm font-medium text-amber-700">需关注</div>
            <div className="mt-2 text-3xl font-semibold text-amber-950">{attentionCount}</div>
            <div className="mt-1 text-xs text-amber-700/80">失败、疑似卡住或重试后成功</div>
          </div>
          <Link href={buildStatusHref(searchParams, 'FAILED')} className="panel cursor-pointer p-5 transition-colors duration-200 hover:border-rose-300 hover:bg-rose-50/40">
            <div className="text-sm font-medium text-rose-700">失败</div>
            <div className="mt-2 text-3xl font-semibold text-rose-950">{failedCount}</div>
            <div className="mt-1 text-xs text-slate-500">点击仅查看失败记录</div>
          </Link>
          <div className="panel p-5">
            <div className="text-sm font-medium text-blue-700">进行中</div>
            <div className="mt-2 text-3xl font-semibold text-slate-950">{runningCount}</div>
            <div className="mt-1 text-xs text-slate-500">超过 15 分钟会标记疑似卡住</div>
          </div>
          <div className="panel p-5">
            <div className="text-sm font-medium text-emerald-700">成功</div>
            <div className="mt-2 text-3xl font-semibold text-slate-950">{succeededCount}</div>
            <div className="mt-1 text-xs text-slate-500">包含最终成功的重试操作</div>
          </div>
        </section>

        <section className="panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">筛选诊断记录</h2>
            <Link href={buildStatusHref(searchParams, 'FAILED')} className="cursor-pointer text-sm font-semibold text-rose-700 transition-colors hover:text-rose-800">
              只看失败
            </Link>
          </div>
          <form className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="text-sm text-slate-600">
              <div className="mb-2 font-medium text-slate-700">操作类型</div>
              <select name="kind" defaultValue={kind} className="input-field">
                <option value="">全部</option>
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              <div className="mb-2 font-medium text-slate-700">执行状态</div>
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
            <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-5">
              <button type="submit" className="cursor-pointer rounded-full bg-amazon-blue px-5 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-blue-600">
                应用筛选
              </button>
              <Link href="/admin/operations" className="cursor-pointer rounded-full border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 transition-colors duration-200 hover:border-slate-300 hover:text-slate-900">
                清空筛选
              </Link>
            </div>
          </form>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-5 text-sm text-slate-500">
            当前结果 {operations.length} 条，最多显示最近 100 条匹配记录。错误摘要来自操作、关联任务和 Provider Attempt 记录。
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">时间 / 用户</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                  <th className="px-4 py-3 font-medium">诊断状态</th>
                  <th className="px-4 py-3 font-medium">失败阶段</th>
                  <th className="px-4 py-3 font-medium">错误摘要</th>
                  <th className="px-4 py-3 font-medium">尝试 / 耗时</th>
                  <th className="px-6 py-3 text-right font-medium">详情</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-14 text-center text-slate-500">没有符合当前筛选条件的操作记录。</td>
                  </tr>
                ) : rows.map(({ operation, diagnostic }) => (
                  <tr key={operation.id} className={`border-t border-slate-200 align-top ${diagnostic.needsAttention ? 'bg-amber-50/20' : 'bg-white'}`}>
                    <td className="px-6 py-4">
                      <div className="whitespace-nowrap font-medium text-slate-800">{formatDateTimeInBeijing(operation.createdAt)}</div>
                      <div className="mt-1 max-w-56 truncate text-xs text-slate-500" title={operation.user.email}>{operation.user.email}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-800">{formatOperationKind(operation.kind)}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatOperationSource(operation.sourcePage)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${getDiagnosticToneClass(diagnostic.tone)}`}>
                        {diagnostic.label}
                      </span>
                    </td>
                    <td className="max-w-48 px-4 py-4 text-slate-700">{diagnostic.stage}</td>
                    <td className="max-w-md px-4 py-4">
                      <div className={diagnostic.error ? 'line-clamp-3 break-words text-rose-700' : 'text-slate-400'} title={diagnostic.error || undefined}>
                        {diagnostic.error || '未记录异常'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-700">
                      <div>{operation.attempts.length} 次</div>
                      <div className="mt-1 text-xs text-slate-500">{operation.durationMs === null ? '-' : `${operation.durationMs}ms`}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/admin/operations/${operation.id}`} className="cursor-pointer font-semibold text-amazon-blue transition-colors hover:text-blue-600">
                        查看诊断
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
