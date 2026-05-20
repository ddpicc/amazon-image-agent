import Link from 'next/link'
import AdminCreateImageProviderForm from '@/app/admin/image-providers/AdminCreateImageProviderForm'
import AdminImageProviderRowActions from '@/app/admin/image-providers/AdminImageProviderRowActions'
import { requireAdmin } from '@/lib/auth'
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
  return value ? value.toLocaleString() : '-'
}

export default async function AdminImageProvidersPage() {
  await requireAdmin()

  const providers = await prisma.imageProvider.findMany({
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
      createdAt: true,
    },
  })

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Image Providers</h1>
            <p className="mt-2 text-sm text-slate-500">管理线路优先级、启停状态和 API key 轮换。现有 key 不会在后台回显。</p>
          </div>
          <Link href="/" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回首页
          </Link>
        </div>

        <AdminCreateImageProviderForm />

        <div className="panel p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">线路列表</h2>
              <p className="mt-1 text-sm text-slate-500">优先级数字越小越优先；如需删除，请先禁用该 provider。</p>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
              共 {providers.length} 条线路
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {providers.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                当前还没有 provider，请先创建一条线路。
              </div>
            ) : (
              providers.map((provider) => {
                const state = getProviderState(provider)
                return (
                  <div key={provider.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-4 lg:min-w-0 lg:flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-lg font-semibold text-slate-950">{provider.name}</h3>
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
                        <AdminImageProviderRowActions
                          provider={{
                            id: provider.id,
                            name: provider.name,
                            priority: provider.priority,
                            enabled: provider.enabled,
                          }}
                          canMoveUp={providers.findIndex((item) => item.id === provider.id) > 0}
                          canMoveDown={providers.findIndex((item) => item.id === provider.id) < providers.length - 1}
                        />
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
