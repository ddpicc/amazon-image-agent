import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { formatDateTimeInBeijing, formatNullableDateTimeInBeijing } from '@/lib/date'
import { prisma } from '@/lib/prisma'
import {
  formatOperationKind,
  formatOperationSource,
  getDiagnosticToneClass,
  getOperationDiagnostic,
} from '../operation-diagnostics'

function formatStatus(status: string) {
  if (status === 'SUCCEEDED') return '成功'
  if (status === 'FAILED') return '失败'
  if (status === 'PROCESSING') return '处理中'
  if (status === 'QUEUED') return '排队中'
  return '进行中'
}

function formatProviderType(providerType: string) {
  if (providerType === 'TEXT') return '文本 Provider'
  if (providerType === 'IMAGE') return '生图 Provider'
  return providerType
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getRoutingSnapshot(attempt: {
  requestSnapshotJson: unknown
  responseSnapshotJson: unknown
}) {
  const response = asRecord(attempt.responseSnapshotJson)
  const request = asRecord(attempt.requestSnapshotJson)
  return asRecord(response?.routing) || asRecord(request?.routing)
}

function formatBudget(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '未记录'
  if (value % 60000 === 0) return `${value / 60000} 分钟`
  return `${value}ms`
}

function formatRoutePhase(value: unknown) {
  if (value === 'primary') return '主路由'
  if (value === 'fallback') return 'GLM 备用路由'
  return '未记录'
}

function formatTimeoutScope(value: unknown) {
  if (value === 'primary-phase-total') return '主路由总预算'
  if (value === 'fallback-phase-total') return 'GLM 备用总预算'
  return '未记录'
}

function formatNextAction(value: unknown) {
  if (value === 'try-next-primary-provider') return '继续下一个 GPT Provider'
  if (value === 'switch-to-glm-fallback') return '切换到 GLM 备用模型'
  if (value === 'complete') return '调用成功，完成请求'
  if (value === 'fail-request') return '无可用后续路由，结束请求'
  return '未记录'
}

export default async function AdminOperationDetailPage({
  params,
}: {
  params: { id: string }
}) {
  await requireAdmin()

  const operation = await prisma.aiOperation.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      kind: true,
      sourcePage: true,
      entryPoint: true,
      status: true,
      errorMessage: true,
      completedAt: true,
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
          id: true,
          attemptIndex: true,
          providerType: true,
          providerName: true,
          baseUrl: true,
          model: true,
          status: true,
          durationMs: true,
          errorMessage: true,
          requestSnapshotJson: true,
          responseSnapshotJson: true,
        },
      },
      imageGenerationRequest: {
        select: {
          id: true,
          status: true,
          statusMessage: true,
          errorMessage: true,
          model: true,
          size: true,
          referenceImageCount: true,
          workerJobId: true,
          queuedAt: true,
          startedAt: true,
          completedAt: true,
          durationMs: true,
        },
      },
      analysisRecord: {
        select: {
          id: true,
          status: true,
          errorMessage: true,
          productName: true,
          category: true,
          referenceImageCount: true,
          completedAt: true,
          durationMs: true,
        },
      },
    },
  })

  if (!operation) {
    notFound()
  }

  const currentTextProviders = operation.attempts.some((attempt) => attempt.providerType === 'TEXT')
    ? await prisma.textProvider.findMany({
        where: { enabled: true },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        select: {
          name: true,
          model: true,
        },
      })
    : []

  const diagnostic = getOperationDiagnostic(operation)
  const failedAttempts = operation.attempts.filter((attempt) => attempt.status === 'FAILED')
  const textAttempts = operation.attempts.filter((attempt) => attempt.providerType === 'TEXT')
  const textRoutingSnapshots = textAttempts
    .map((attempt) => getRoutingSnapshot(attempt))
    .filter((snapshot): snapshot is Record<string, unknown> => Boolean(snapshot))
  const firstTextRouting = textRoutingSnapshots[0] || null
  const candidateProviders = Array.isArray(firstTextRouting?.candidateProviders)
    ? firstTextRouting.candidateProviders
        .map((candidate) => asRecord(candidate))
        .filter((candidate): candidate is Record<string, unknown> => Boolean(candidate))
    : []
  const displayedCandidateProviders = candidateProviders.length > 0
    ? candidateProviders
    : currentTextProviders.map((provider) => ({
        providerName: provider.name,
        model: provider.model,
        role: provider.model.toLowerCase() === 'glm-5.3-flash' ? 'fallback' : 'primary',
      }))
  const currentFallbackProvider = currentTextProviders.find((provider) => provider.model.toLowerCase() === 'glm-5.3-flash') || null
  const fallbackAttempt = textAttempts.find((attempt) => {
    const routing = getRoutingSnapshot(attempt)
    return routing?.routePhase === 'fallback' || attempt.model?.toLowerCase() === 'glm-5.3-flash'
  }) || null
  const primaryTimedOut = textAttempts.some((attempt) => {
    const routing = getRoutingSnapshot(attempt)
    return routing?.routePhase === 'primary' && routing.phaseTimedOut === true
  })
  const legacyFiveMinuteAbort = textRoutingSnapshots.length === 0 && textAttempts.some((attempt) => (
    /abort|timeout/i.test(attempt.errorMessage || '') && (attempt.durationMs || 0) >= 295000
  ))
  const textRouteOutcome = fallbackAttempt?.status === 'SUCCEEDED'
    ? '主路由失败或超时后，GLM 备用模型调用成功'
    : fallbackAttempt?.status === 'FAILED'
      ? '已切换 GLM 备用模型，但备用调用也失败'
      : primaryTimedOut
        ? '主路由总预算已耗尽，未记录到后续 GLM Attempt'
        : legacyFiveMinuteAbort
          ? '推断为主路由调用达到 5 分钟后被中止；旧记录没有保存后续路由原因'
          : textAttempts.some((attempt) => attempt.status === 'SUCCEEDED')
            ? '主路由文本模型调用成功，未启用 GLM 备用模型'
            : '文本模型调用失败，未记录到 GLM 备用 Attempt'
  const linkedStatus = operation.imageGenerationRequest?.status || operation.analysisRecord?.status || null
  const normalizedLinkedStatus = linkedStatus === 'QUEUED' || linkedStatus === 'PROCESSING' ? 'STARTED' : linkedStatus
  const statusMismatch = normalizedLinkedStatus !== null && normalizedLinkedStatus !== operation.status
  const diagnosticPanelClass = diagnostic.tone === 'danger'
    ? 'border-rose-200 bg-rose-50/70'
    : diagnostic.tone === 'warning'
      ? 'border-amber-200 bg-amber-50/70'
      : diagnostic.tone === 'progress'
        ? 'border-blue-200 bg-blue-50/70'
        : 'border-emerald-200 bg-emerald-50/60'

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">AI 操作诊断详情</h1>
            <p className="mt-2 text-sm text-slate-500">定位操作是否异常、失败阶段和原始错误；页面不加载或展示输出图片。</p>
          </div>
          <Link href="/admin/operations" className="inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors duration-200 hover:border-slate-300 hover:text-slate-900">
            返回诊断列表
          </Link>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="panel p-5">
            <div className="text-sm text-slate-500">用户</div>
            <div className="mt-2 truncate font-semibold text-slate-950" title={operation.user.email}>{operation.user.email}</div>
          </div>
          <div className="panel p-5">
            <div className="text-sm text-slate-500">操作</div>
            <div className="mt-2 font-semibold text-slate-950">{formatOperationKind(operation.kind)}</div>
            <div className="mt-1 text-xs text-slate-500">{formatOperationSource(operation.sourcePage)}</div>
          </div>
          <div className="panel p-5">
            <div className="text-sm text-slate-500">诊断状态</div>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${getDiagnosticToneClass(diagnostic.tone)}`}>
              {diagnostic.label}
            </span>
          </div>
          <div className="panel p-5">
            <div className="text-sm text-slate-500">总耗时</div>
            <div className="mt-2 font-semibold text-slate-950">{operation.durationMs === null ? '-' : `${operation.durationMs}ms`}</div>
            <div className="mt-1 text-xs text-slate-500">Provider 尝试 {operation.attempts.length} 次</div>
          </div>
        </section>

        <section className={`rounded-3xl border p-6 ${diagnosticPanelClass}`} aria-labelledby="diagnostic-result-title">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="diagnostic-result-title" className="text-lg font-semibold text-slate-950">诊断结果</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${getDiagnosticToneClass(diagnostic.tone)}`}>{diagnostic.label}</span>
              </div>
              <dl className="mt-5 grid gap-5 md:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">异常阶段</dt>
                  <dd className="mt-2 text-sm font-medium text-slate-900">{diagnostic.stage}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">失败 Attempt</dt>
                  <dd className="mt-2 text-sm font-medium text-slate-900">{failedAttempts.length} 次</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">原始错误</dt>
                  <dd className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 ${diagnostic.error ? 'text-rose-800' : 'text-slate-600'}`}>
                    {diagnostic.error || '没有记录到错误信息'}
                  </dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">排查提示</dt>
                  <dd className="mt-2 text-sm leading-6 text-slate-700">{diagnostic.hint}</dd>
                </div>
              </dl>
            </div>
          </div>

          {statusMismatch && (
            <div role="alert" className="mt-5 rounded-2xl border border-amber-300 bg-white/70 px-4 py-3 text-sm text-amber-900">
              状态不一致：操作记录为“{formatStatus(operation.status)}”，关联任务为“{formatStatus(linkedStatus || '')}”。这可能表示回调或状态同步没有完整更新。
            </div>
          )}
        </section>

        <section className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-950">操作信息</h2>
          <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-4">
            <div><dt className="text-slate-500">操作 ID</dt><dd className="mt-1 break-all font-mono text-xs text-slate-900">{operation.id}</dd></div>
            <div><dt className="text-slate-500">入口</dt><dd className="mt-1 break-all text-slate-900">{operation.entryPoint || '-'}</dd></div>
            <div><dt className="text-slate-500">创建时间</dt><dd className="mt-1 text-slate-900">{formatDateTimeInBeijing(operation.createdAt)}</dd></div>
            <div><dt className="text-slate-500">完成时间</dt><dd className="mt-1 text-slate-900">{formatNullableDateTimeInBeijing(operation.completedAt)}</dd></div>
          </dl>
        </section>

        {operation.imageGenerationRequest && (
          <section className="panel p-6">
            <h2 className="text-lg font-semibold text-slate-950">生图执行链路</h2>
            <p className="mt-1 text-sm text-slate-500">只展示任务状态和排障字段，不读取输出图片。</p>
            <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div><dt className="text-slate-500">生图任务 ID</dt><dd className="mt-1 break-all font-mono text-xs text-slate-900">{operation.imageGenerationRequest.id}</dd></div>
              <div><dt className="text-slate-500">Worker 任务 ID</dt><dd className="mt-1 break-all font-mono text-xs text-slate-900">{operation.imageGenerationRequest.workerJobId || '-'}</dd></div>
              <div><dt className="text-slate-500">任务状态</dt><dd className="mt-1 font-medium text-slate-900">{formatStatus(operation.imageGenerationRequest.status)}</dd></div>
              <div><dt className="text-slate-500">状态说明</dt><dd className="mt-1 break-words text-slate-900">{operation.imageGenerationRequest.statusMessage || '-'}</dd></div>
              <div><dt className="text-slate-500">模型</dt><dd className="mt-1 break-all text-slate-900">{operation.imageGenerationRequest.model || '-'}</dd></div>
              <div><dt className="text-slate-500">尺寸</dt><dd className="mt-1 text-slate-900">{operation.imageGenerationRequest.size || '-'}</dd></div>
              <div><dt className="text-slate-500">参考图数量</dt><dd className="mt-1 text-slate-900">{operation.imageGenerationRequest.referenceImageCount}</dd></div>
              <div><dt className="text-slate-500">任务耗时</dt><dd className="mt-1 text-slate-900">{operation.imageGenerationRequest.durationMs === null ? '-' : `${operation.imageGenerationRequest.durationMs}ms`}</dd></div>
              <div><dt className="text-slate-500">排队时间</dt><dd className="mt-1 text-slate-900">{formatNullableDateTimeInBeijing(operation.imageGenerationRequest.queuedAt)}</dd></div>
              <div><dt className="text-slate-500">开始处理</dt><dd className="mt-1 text-slate-900">{formatNullableDateTimeInBeijing(operation.imageGenerationRequest.startedAt)}</dd></div>
              <div><dt className="text-slate-500">完成时间</dt><dd className="mt-1 text-slate-900">{formatNullableDateTimeInBeijing(operation.imageGenerationRequest.completedAt)}</dd></div>
              <div><dt className="text-slate-500">任务错误</dt><dd className="mt-1 break-words text-rose-700">{operation.imageGenerationRequest.errorMessage || '-'}</dd></div>
            </dl>
          </section>
        )}

        {operation.analysisRecord && (
          <section className="panel p-6">
            <h2 className="text-lg font-semibold text-slate-950">分析执行链路</h2>
            <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div><dt className="text-slate-500">分析记录 ID</dt><dd className="mt-1 break-all font-mono text-xs text-slate-900">{operation.analysisRecord.id}</dd></div>
              <div><dt className="text-slate-500">分析状态</dt><dd className="mt-1 font-medium text-slate-900">{formatStatus(operation.analysisRecord.status)}</dd></div>
              <div><dt className="text-slate-500">商品</dt><dd className="mt-1 break-words text-slate-900">{operation.analysisRecord.productName || '-'}</dd></div>
              <div><dt className="text-slate-500">类目</dt><dd className="mt-1 break-words text-slate-900">{operation.analysisRecord.category || '-'}</dd></div>
              <div><dt className="text-slate-500">参考图数量</dt><dd className="mt-1 text-slate-900">{operation.analysisRecord.referenceImageCount}</dd></div>
              <div><dt className="text-slate-500">分析耗时</dt><dd className="mt-1 text-slate-900">{operation.analysisRecord.durationMs === null ? '-' : `${operation.analysisRecord.durationMs}ms`}</dd></div>
              <div><dt className="text-slate-500">完成时间</dt><dd className="mt-1 text-slate-900">{formatNullableDateTimeInBeijing(operation.analysisRecord.completedAt)}</dd></div>
              <div><dt className="text-slate-500">分析错误</dt><dd className="mt-1 break-words text-rose-700">{operation.analysisRecord.errorMessage || '-'}</dd></div>
            </dl>
          </section>
        )}

        {textAttempts.length > 0 && (
          <section className="panel p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">文本模型路由诊断</h2>
                <p className="mt-1 text-sm text-slate-500">只展示超时预算、候选路由和实际切换结果，不展示 Prompt 或原始 JSON。</p>
              </div>
              <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${fallbackAttempt?.status === 'SUCCEEDED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : failedAttempts.length > 0 ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                实际尝试 {textAttempts.length} 次
              </span>
            </div>

            <dl className="mt-5 grid gap-x-6 gap-y-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-slate-500">路由策略</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {firstTextRouting?.strategy === 'primary-budget-then-glm-fallback'
                    ? '主路由共用总预算 → GLM 强制备用'
                    : '旧记录，未保存路由策略'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">候选 Provider</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {typeof firstTextRouting?.candidateProviderCount === 'number'
                    ? `${firstTextRouting.candidateProviderCount} 个（主路由 ${firstTextRouting.primaryProviderCount || 0} 个）`
                    : `历史未记录；当前启用 ${currentTextProviders.length} 个`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">主路由总预算</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {firstTextRouting ? formatBudget(firstTextRouting.phaseBudgetMs) : legacyFiveMinuteAbort ? '约 5 分钟（根据耗时推断）' : '未记录'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">GLM 备用</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {typeof firstTextRouting?.fallbackModel === 'string'
                    ? `${firstTextRouting.fallbackModel}（另有 ${formatBudget(firstTextRouting.phaseBudgetMs)}）`
                    : fallbackAttempt?.model || (currentFallbackProvider ? `${currentFallbackProvider.model}（当前配置）` : '未配置')}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">思考模式</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {firstTextRouting?.reasoningMode === 'not-explicitly-configured'
                    ? '未显式开启，由上游默认行为决定'
                    : '未记录；当前代码未显式传入'}
                </dd>
              </div>
              <div className="sm:col-span-2 xl:col-span-3">
                <dt className="text-slate-500">本次判断</dt>
                <dd className="mt-1 font-medium text-slate-900">{textRouteOutcome}</dd>
              </div>
            </dl>

            {displayedCandidateProviders.length > 0 && (
              <div className="mt-5 border-t border-slate-200 pt-5">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {candidateProviders.length > 0 ? '请求开始时的候选顺序' : '当前启用优先级（旧记录没有历史快照）'}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {displayedCandidateProviders.map((candidate, index) => {
                    const isFallback = candidate.role === 'fallback' || candidate.role === 'forced-fallback'
                    const roleLabel = candidate.role === 'forced-fallback'
                      ? '（强制备用）'
                      : candidate.role === 'fallback'
                        ? '（普通备用）'
                        : ''
                    return (
                      <span key={`${String(candidate.providerName)}-${index}`} className={`rounded-full px-3 py-1.5 text-xs font-medium ${isFallback ? 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200' : 'bg-slate-100 text-slate-700'}`}>
                        {index + 1}. {String(candidate.providerName || '-')} · {String(candidate.model || '-')} {roleLabel}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="panel overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-slate-950">Provider Attempt 链路</h2>
            <p className="mt-1 text-sm text-slate-500">按实际尝试顺序展示 Provider、模型、耗时和每次错误。</p>
          </div>
          {operation.attempts.length === 0 ? (
            <div className="px-6 py-10 text-sm text-slate-500">
              当前操作没有独立 Attempt 记录。生图任务由远端 Worker 执行时，主要查看上方“生图执行链路”。
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {operation.attempts.map((attempt) => {
                const routing = getRoutingSnapshot(attempt)
                const responseSnapshot = asRecord(attempt.responseSnapshotJson)
                return (
                  <article key={attempt.id} className={attempt.status === 'FAILED' ? 'bg-rose-50/30 px-6 py-5' : 'px-6 py-5'}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">第 {attempt.attemptIndex} 次尝试</h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${attempt.status === 'FAILED' ? 'bg-rose-50 text-rose-700 ring-rose-200' : attempt.status === 'SUCCEEDED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-blue-50 text-blue-700 ring-blue-200'}`}>
                        {formatStatus(attempt.status)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">{attempt.durationMs === null ? '-' : `${attempt.durationMs}ms`}</div>
                  </div>
                  <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                    <div><dt className="text-slate-500">Provider 类型</dt><dd className="mt-1 text-slate-900">{formatProviderType(attempt.providerType)}</dd></div>
                    <div><dt className="text-slate-500">Provider</dt><dd className="mt-1 text-slate-900">{attempt.providerName || '-'}</dd></div>
                    <div><dt className="text-slate-500">模型</dt><dd className="mt-1 break-all text-slate-900">{attempt.model || '-'}</dd></div>
                    <div><dt className="text-slate-500">Base URL</dt><dd className="mt-1 break-all text-slate-900">{attempt.baseUrl || '-'}</dd></div>
                  </dl>
                  {attempt.providerType === 'TEXT' && (
                    <dl className="mt-4 grid gap-x-6 gap-y-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                      <div><dt className="text-slate-500">路由阶段</dt><dd className="mt-1 font-medium text-slate-900">{formatRoutePhase(routing?.routePhase)}</dd></div>
                      <div><dt className="text-slate-500">阶段总预算</dt><dd className="mt-1 font-medium text-slate-900">{formatBudget(routing?.phaseBudgetMs)}</dd></div>
                      <div><dt className="text-slate-500">超时范围</dt><dd className="mt-1 font-medium text-slate-900">{formatTimeoutScope(routing?.timeoutScope)}</dd></div>
                      <div><dt className="text-slate-500">后续动作</dt><dd className="mt-1 font-medium text-slate-900">{formatNextAction(routing?.nextAction)}</dd></div>
                      <div><dt className="text-slate-500">是否由本地中止</dt><dd className="mt-1 font-medium text-slate-900">{responseSnapshot?.aborted === true ? '是' : responseSnapshot?.aborted === false ? '否' : /abort/i.test(attempt.errorMessage || '') ? '是（根据错误推断）' : '未记录'}</dd></div>
                      <div><dt className="text-slate-500">阶段是否耗尽</dt><dd className="mt-1 font-medium text-slate-900">{routing?.phaseTimedOut === true ? '是' : routing?.phaseTimedOut === false ? '否' : legacyFiveMinuteAbort ? '疑似是（旧记录）' : '未记录'}</dd></div>
                    </dl>
                  )}
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">本次错误</div>
                    <div className={`mt-2 whitespace-pre-wrap break-words text-sm ${attempt.errorMessage ? 'text-rose-700' : 'text-slate-500'}`}>{attempt.errorMessage || '未记录错误'}</div>
                  </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

      </div>
    </main>
  )
}
