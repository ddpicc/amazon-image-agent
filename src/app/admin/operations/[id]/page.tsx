import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { formatDateTimeInBeijing, formatNullableDateTimeInBeijing } from '@/lib/date'
import { prisma } from '@/lib/prisma'

function prettyJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2)
}

function formatOperationKind(kind: string) {
  if (kind === 'IMAGE_GENERATION') return '生图'
  if (kind === 'ANALYSIS') return '商品分析 / Prompt'
  return kind
}

function formatOperationStatus(status: string) {
  if (status === 'SUCCEEDED') return '成功'
  if (status === 'FAILED') return '失败'
  return '进行中'
}

export default async function AdminOperationDetailPage({
  params,
}: {
  params: { id: string }
}) {
  await requireAdmin()

  const operation = await prisma.aiOperation.findUnique({
    where: { id: params.id },
    include: {
      user: {
        select: {
          email: true,
        },
      },
      attempts: {
        orderBy: { attemptIndex: 'asc' },
      },
      imageGenerationRequest: true,
      analysisRecord: true,
    },
  })

  if (!operation) {
    notFound()
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">AI 操作详情</h1>
            <p className="mt-2 text-sm text-slate-500">查看完整输入摘要、最终 prompt、attempt 链路、输出图片和快照数据，辅助调优与排障。</p>
          </div>
          <Link href="/admin/operations" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回操作列表
          </Link>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="panel p-6">
            <div className="text-sm text-slate-500">用户</div>
            <div className="mt-3 text-lg font-semibold text-slate-950">{operation.user.email}</div>
          </div>
          <div className="panel p-6">
            <div className="text-sm text-slate-500">类型</div>
            <div className="mt-3 text-lg font-semibold text-slate-950">{formatOperationKind(operation.kind)}</div>
          </div>
          <div className="panel p-6">
            <div className="text-sm text-slate-500">状态</div>
            <div className="mt-3 text-lg font-semibold text-slate-950">{formatOperationStatus(operation.status)}</div>
          </div>
          <div className="panel p-6">
            <div className="text-sm text-slate-500">耗时</div>
            <div className="mt-3 text-lg font-semibold text-slate-950">{operation.durationMs ? `${operation.durationMs}ms` : '-'}</div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="panel p-6">
            <h2 className="text-lg font-semibold text-slate-950">基础信息</h2>
            <dl className="mt-4 space-y-3 text-sm text-slate-700">
              <div>
                <dt className="font-medium text-slate-500">入口</dt>
                <dd className="mt-1">{operation.entryPoint || '-'}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">来源页面</dt>
                <dd className="mt-1">{operation.sourcePage || '-'}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">创建时间</dt>
                <dd className="mt-1">{formatDateTimeInBeijing(operation.createdAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">完成时间</dt>
                <dd className="mt-1">{formatNullableDateTimeInBeijing(operation.completedAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">最终 Prompt</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words rounded-2xl bg-slate-50 p-3">{operation.finalPrompt || operation.imageGenerationRequest?.finalPrompt || operation.imageGenerationRequest?.revisedPrompt || '-'}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">错误信息</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-rose-600">{operation.errorMessage || operation.imageGenerationRequest?.errorMessage || operation.analysisRecord?.errorMessage || '-'}</dd>
              </div>
            </dl>
          </div>

          <div className="panel p-6">
            <h2 className="text-lg font-semibold text-slate-950">输出图片</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {!operation.imageGenerationRequest?.imageUrl ? (
                <p className="text-sm text-slate-500">当前操作没有保存输出图片。</p>
              ) : (
                <a href={operation.imageGenerationRequest.imageUrl} target="_blank" className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <img src={operation.imageGenerationRequest.imageUrl} alt="" className="h-40 w-full rounded-xl object-cover" />
                  <div className="mt-2 text-xs text-slate-500 break-all">{operation.imageGenerationRequest.imageUrl}</div>
                </a>
              )}
            </div>
          </div>
        </section>

        {operation.imageGenerationRequest && (
          <section className="panel p-6">
            <h2 className="text-lg font-semibold text-slate-950">生图调优信息</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4 text-sm text-slate-700">
              <div>原始 Prompt：<span className="font-medium text-slate-900">{operation.imageGenerationRequest.prompt}</span></div>
              <div>最终 Prompt：<span className="font-medium text-slate-900">{operation.imageGenerationRequest.finalPrompt || '-'}</span></div>
              <div>Revised Prompt：<span className="font-medium text-slate-900">{operation.imageGenerationRequest.revisedPrompt || '-'}</span></div>
              <div>参考图数量：<span className="font-medium text-slate-900">{operation.imageGenerationRequest.referenceImageCount}</span></div>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{prettyJson({
              imageUrl: operation.imageGenerationRequest.imageUrl,
              referenceImagesJson: operation.imageGenerationRequest.referenceImagesJson,
              requestSnapshotJson: operation.imageGenerationRequest.requestSnapshotJson,
            })}</pre>
          </section>
        )}

        <section className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-950">Attempt 链路</h2>
          <div className="mt-4 space-y-4">
            {operation.attempts.length === 0 ? (
              <p className="text-sm text-slate-500">当前操作没有独立 attempt 记录。</p>
            ) : operation.attempts.map((attempt) => (
              <div key={attempt.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">第 {attempt.attemptIndex} 次尝试</div>
                  <div className="text-xs text-slate-500">{attempt.durationMs ? `${attempt.durationMs}ms` : '-'}</div>
                </div>
                <div className="mt-2 grid gap-2 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
                  <div>状态：{formatOperationStatus(attempt.status)}</div>
                  <div>Provider：{attempt.providerName || '-'}</div>
                  <div>模型：{attempt.model || '-'}</div>
                  <div>Base URL：{attempt.baseUrl || '-'}</div>
                </div>
                <div className="mt-2 text-sm text-rose-600">{attempt.errorMessage || '-'}</div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Attempt Request Snapshot</div>
                    <pre className="mt-2 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{prettyJson(attempt.requestSnapshotJson)}</pre>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Attempt Response Snapshot</div>
                    <pre className="mt-2 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{prettyJson(attempt.responseSnapshotJson)}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="panel p-6">
            <h2 className="text-lg font-semibold text-slate-950">输入摘要 / 请求快照</h2>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{prettyJson({
              inputSummaryJson: operation.inputSummaryJson,
              requestSnapshotJson: operation.requestSnapshotJson,
              imageGenerationRequest: operation.imageGenerationRequest?.requestSnapshotJson,
              analysisRecord: operation.analysisRecord?.requestSnapshotJson,
            })}</pre>
          </div>

          <div className="panel p-6">
            <h2 className="text-lg font-semibold text-slate-950">输出摘要 / 响应快照</h2>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{prettyJson({
              outputSummaryJson: operation.outputSummaryJson,
              responseSnapshotJson: operation.responseSnapshotJson,
              analysisRecord: operation.analysisRecord?.responseSnapshotJson,
            })}</pre>
          </div>
        </section>
      </div>
    </main>
  )
}
