import Link from 'next/link'
import type { ReactNode } from 'react'
import { AttemptStatus, AiProviderType } from '@prisma/client'
import AdminCreateTextProviderForm from '@/app/admin/text-providers/AdminCreateTextProviderForm'
import AdminTextProviderRowActions from '@/app/admin/text-providers/AdminTextProviderRowActions'
import { requireAdmin } from '@/lib/auth'
import { formatNullableDateTimeInBeijing } from '@/lib/date'
import { prisma } from '@/lib/prisma'

function getProviderState(provider: {
  enabled: boolean
  cooldownUntil: Date | null
}) {
  if (!provider.enabled) {
    return {
      label: 'Disabled',
      className: 'border-slate-200 bg-slate-100 text-slate-600',
    }
  }

  if (provider.cooldownUntil && provider.cooldownUntil.getTime() > Date.now()) {
    return {
      label: 'Cooling down',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }

  return {
    label: 'Active',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }
}

function formatDate(value: Date | null) {
  return formatNullableDateTimeInBeijing(value)
}

function ProviderSection(props: {
  title: string
  description: string
  emptyText: string
  providers: Array<{
    id: string
    name: string
    vendor: string
    baseUrl: string
    model: string
    priority: number
    enabled: boolean
    failureCount: number
    lastFailureAt: Date | null
    lastSuccessAt: Date | null
    cooldownUntil: Date | null
    updatedAt: Date
    requestCount24h: number
    successCount24h: number
    avgDurationMs24h: number | null
    recentErrorMessage: string | null
  }>
  createForm: ReactNode
  rowActions: (provider: { id: string; name: string; priority: number; enabled: boolean }, canMoveUp: boolean, canMoveDown: boolean) => ReactNode
}) {
  const { title, description, emptyText, providers, createForm, rowActions } = props

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm text-slate-500">{description}</p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
            共 {providers.length} 条线路
          </div>
        </div>
      </div>

      {createForm}

      <div className="panel p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">线路列表</h3>
            <p className="mt-1 text-sm text-slate-500">优先级数字越小越优先；如需删除，请先禁用该 provider。</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {providers.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              {emptyText}
            </div>
          ) : (
            providers.map((provider) => {
              const state = getProviderState(provider)
              return (
                <div key={provider.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-4 lg:min-w-0 lg:flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="text-lg font-semibold text-slate-950">{provider.name}</h4>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${state.className}`}>
                          {state.label}
                        </span>
                        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                          Priority {provider.priority}
                        </span>
                      </div>

                      <div className="grid gap-4 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Vendor</div>
                          <div className="mt-1 break-all text-slate-900">{provider.vendor}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Base URL</div>
                          <div className="mt-1 break-all text-slate-900">{provider.baseUrl}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Model</div>
                          <div className="mt-1 break-all text-slate-900">{provider.model}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Failure count</div>
                          <div className="mt-1 text-slate-900">{provider.failureCount}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Last success</div>
                          <div className="mt-1 text-slate-900">{formatDate(provider.lastSuccessAt)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Last failure</div>
                          <div className="mt-1 text-slate-900">{formatDate(provider.lastFailureAt)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Cooldown until</div>
                          <div className="mt-1 text-slate-900">{formatDate(provider.cooldownUntil)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">24h requests</div>
                          <div className="mt-1 text-slate-900">{provider.requestCount24h}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">24h success rate</div>
                          <div className="mt-1 text-slate-900">{provider.requestCount24h > 0 ? `${Math.round((provider.successCount24h / provider.requestCount24h) * 100)}%` : '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">24h avg duration</div>
                          <div className="mt-1 text-slate-900">{provider.avgDurationMs24h ? `${Math.round(provider.avgDurationMs24h)}ms` : '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Recent error</div>
                          <div className="mt-1 break-all text-slate-900">{provider.recentErrorMessage || '-'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="w-full lg:w-[420px]">
                      {rowActions(
                        {
                          id: provider.id,
                          name: provider.name,
                          priority: provider.priority,
                          enabled: provider.enabled,
                        },
                        providers.findIndex((item) => item.id === provider.id) > 0,
                        providers.findIndex((item) => item.id === provider.id) < providers.length - 1,
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </section>
  )
}

export default async function AdminProvidersPage() {
  await requireAdmin()

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [textProviders, textAttempts24h] = await Promise.all([
    prisma.textProvider.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        vendor: true,
        baseUrl: true,
        model: true,
        priority: true,
        enabled: true,
        failureCount: true,
        lastFailureAt: true,
        lastSuccessAt: true,
        cooldownUntil: true,
        updatedAt: true,
      },
    }),
    prisma.aiOperationAttempt.findMany({
      where: {
        providerType: AiProviderType.TEXT,
        createdAt: { gte: since },
      },
      select: {
        providerId: true,
        providerName: true,
        status: true,
        durationMs: true,
        errorMessage: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const textProviderSummaries = textProviders.map((provider) => {
    const relatedAttempts = textAttempts24h.filter((attempt) => attempt.providerId === provider.id)

    return {
      ...provider,
      requestCount24h: relatedAttempts.length,
      successCount24h: relatedAttempts.filter((item) => item.status === AttemptStatus.SUCCEEDED).length,
      avgDurationMs24h: (() => {
        const durations = relatedAttempts.map((item) => item.durationMs).filter((value): value is number => typeof value === 'number')
        return durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null
      })(),
      recentErrorMessage: relatedAttempts.find((item) => item.errorMessage)?.errorMessage ?? null,
    }
  })

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Providers</h1>
            <p className="mt-2 text-sm text-slate-500">这里只维护文本 provider。图片线路已经迁到 `amazon-image-worker` 单独管理。</p>
          </div>
          <Link href="/admin" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回工作台
          </Link>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">图片线路</h2>
          <p className="mt-2 text-sm text-slate-500">
            Amazon、Playground 的生图任务现在统一提交到远端 `amazon-image-worker`。
            该 worker 自己维护图片 provider、队列、fallback 和对象存储；用户可见模型和积分在本站的
            {' '}<Link href="/admin/image-models" className="font-medium text-amazon-blue hover:text-blue-600">生图模型</Link> 中配置。
          </p>
        </section>

        <ProviderSection
          title="文本线路"
          description="产品分析、Prompt 生成走这里的 provider 池。"
          emptyText="当前还没有文本 provider，请先创建一条线路。"
          providers={textProviderSummaries}
          createForm={<AdminCreateTextProviderForm />}
          rowActions={(provider, canMoveUp, canMoveDown) => (
            <AdminTextProviderRowActions
              provider={provider}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
            />
          )}
        />
      </div>
    </main>
  )
}
