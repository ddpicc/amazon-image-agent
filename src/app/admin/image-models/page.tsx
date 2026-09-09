import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { listRemoteImageModels } from '@/lib/image-worker-client'
import { formatInternalPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'
import { syncImageModelsAction, updateImageModelAction } from './actions'

export default async function AdminImageModelsPage() {
  await requireAdmin()
  const [configs, workerResult] = await Promise.all([
    prisma.imageModelConfig.findMany({
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    listRemoteImageModels()
      .then((models) => ({ models, error: null as string | null }))
      .catch((error) => ({
        models: [] as string[],
        error: error instanceof Error ? error.message : '无法读取 worker 模型列表',
      })),
  ])
  const workerModels = new Set(workerResult.models)

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">生图模型与积分</h1>
            <p className="mt-2 text-sm text-slate-500">管理用户可选的公开模型、默认模型和每张图片积分。Provider 与上游模型仍由 image-worker 管理。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <form action={syncImageModelsAction}>
              <button type="submit" className="rounded-full bg-amazon-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600">
                从 Worker 同步模型
              </button>
            </form>
            <Link href="/admin" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
              返回工作台
            </Link>
          </div>
        </div>

        <section className="panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">配置说明</h2>
              <p className="mt-1 text-sm text-slate-500">普通价格用于 Amazon 普通图、自由生成和再次编辑；A+ 图片可以单独定价。新价格只影响保存后新提交的任务。</p>
            </div>
            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600">Worker 当前提供 {workerResult.models.length} 个模型</span>
          </div>
          {workerResult.error && (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Worker 模型状态暂时无法读取：{workerResult.error}</p>
          )}
        </section>

        <section className="space-y-4">
          {configs.length === 0 ? (
            <div className="panel border-dashed px-6 py-12 text-center text-sm text-slate-500">还没有模型配置，请先从 Worker 同步。</div>
          ) : configs.map((config) => {
            const availability = workerResult.error ? 'unknown' : workerModels.has(config.model) ? 'available' : 'missing'
            return (
              <form key={config.id} action={updateImageModelAction} className="panel p-6">
                <input type="hidden" name="id" value={config.id} />
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="break-all text-lg font-semibold text-slate-950">{config.model}</h2>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        availability === 'available'
                          ? 'bg-emerald-50 text-emerald-700'
                          : availability === 'missing'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {availability === 'available' ? 'Worker 可用' : availability === 'missing' ? 'Worker 未提供' : '状态未知'}
                      </span>
                      {config.isDefault && <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-amazon-orange">默认模型</span>}
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <label className="text-sm text-slate-600">
                        <span className="mb-2 block font-medium text-slate-800">用户显示名称</span>
                        <input name="displayName" defaultValue={config.displayName} className="input-field" required />
                      </label>
                      <label className="text-sm text-slate-600">
                        <span className="mb-2 block font-medium text-slate-800">普通图片积分/张</span>
                        <input name="standardCost" type="number" min="0" step="0.1" defaultValue={formatInternalPoints(config.standardCost)} className="input-field" required />
                      </label>
                      <label className="text-sm text-slate-600">
                        <span className="mb-2 block font-medium text-slate-800">A+ 图片积分/张</span>
                        <input name="aplusCost" type="number" min="0" step="0.1" defaultValue={formatInternalPoints(config.aplusCost)} className="input-field" required />
                      </label>
                      <label className="text-sm text-slate-600">
                        <span className="mb-2 block font-medium text-slate-800">显示顺序</span>
                        <input name="displayOrder" type="number" min="0" step="1" defaultValue={config.displayOrder} className="input-field" required />
                      </label>
                    </div>

                    <label className="mt-4 block text-sm text-slate-600">
                      <span className="mb-2 block font-medium text-slate-800">模型说明</span>
                      <input name="description" defaultValue={config.description || ''} className="input-field" placeholder="告诉用户这个模型更适合什么场景" />
                    </label>
                  </div>

                  <div className="flex shrink-0 flex-col gap-3 xl:w-44">
                    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">
                      <input name="enabled" type="checkbox" defaultChecked={config.enabled} className="h-4 w-4 rounded border-slate-300 text-amazon-blue focus:ring-amazon-blue" />
                      对用户开放
                    </label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">
                      <input name="isDefault" type="checkbox" defaultChecked={config.isDefault} className="h-4 w-4 rounded border-slate-300 text-amazon-blue focus:ring-amazon-blue" />
                      设为默认
                    </label>
                    <button type="submit" className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                      保存配置
                    </button>
                  </div>
                </div>
              </form>
            )
          })}
        </section>
      </div>
    </main>
  )
}
