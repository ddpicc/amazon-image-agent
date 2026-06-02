import Link from 'next/link'
import type { ReactNode } from 'react'
import AdminCreateImageProviderForm from '@/app/admin/image-providers/AdminCreateImageProviderForm'
import AdminImageProviderRowActions from '@/app/admin/image-providers/AdminImageProviderRowActions'
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
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Updated</div>
                          <div className="mt-1 text-slate-900">{formatDate(provider.updatedAt)}</div>
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

  const [imageProviders, textProviders] = await Promise.all([
    prisma.imageProvider.findMany({
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
  ])

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Providers</h1>
            <p className="mt-2 text-sm text-slate-500">统一管理图片线路和文本线路的优先级、启停状态、失败冷却和 API key 轮换。</p>
          </div>
          <Link href="/" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回首页
          </Link>
        </div>

        <ProviderSection
          title="图片线路"
          description="Amazon 生图和 Playground 生图都走这里的 provider 池。"
          emptyText="当前还没有图片 provider，请先创建一条线路。"
          providers={imageProviders}
          createForm={<AdminCreateImageProviderForm />}
          rowActions={(provider, canMoveUp, canMoveDown) => (
            <AdminImageProviderRowActions
              provider={provider}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
            />
          )}
        />

        <ProviderSection
          title="文本线路"
          description="产品分析、Prompt 生成和反推提示词都走这里的 provider 池。"
          emptyText="当前还没有文本 provider，请先创建一条线路。"
          providers={textProviders}
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
