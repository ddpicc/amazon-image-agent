'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { formatDateTimeInBeijing } from '@/lib/date'
import { formatPoints } from '@/lib/points-config'
interface HistoryAnalysisRecord {
  id: string
  productName: string
  description: string
  category: string
  targetAudience: string
  referenceImageCount: number
  referenceImagesJson: unknown
  referencesExpired?: boolean
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED'
  productSummary: string | null
  analysisJson: unknown
  promptPlanJson: unknown
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

interface HistoryImageRequest {
  id: string
  entryApi: string
  imageType: string | null
  prompt: string
  revisedPrompt: string | null
  imageUrl: string | null
  status: 'STARTED' | 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
  statusMessage: string | null
  size: string | null
  durationMs: number | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  pointsLedgerEntry: {
    id: string
    pointsDelta: number
    createdAt: string
  } | null
}

interface PaginatedSection<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface HistoryPageData {
  analysisRecords: PaginatedSection<HistoryAnalysisRecord>
  imageRequests: PaginatedSection<HistoryImageRequest>
}

type HistorySectionKey = 'analysis' | 'images'

function formatStatus(status: HistoryImageRequest['status'] | HistoryAnalysisRecord['status']) {
  if (status === 'STARTED' || status === 'QUEUED' || status === 'PROCESSING') return '进行中'
  if (status === 'SUCCEEDED') return '已完成'
  return '失败'
}

function isActiveStatus(status: HistoryImageRequest['status']) {
  return status === 'STARTED' || status === 'QUEUED' || status === 'PROCESSING'
}

function formatDate(value: string) {
  return formatDateTimeInBeijing(value)
}

function canDeleteAnalysisRecord(status: HistoryAnalysisRecord['status']) {
  return status === 'SUCCEEDED' || status === 'FAILED'
}

function canDeleteImageRecord(status: HistoryImageRequest['status']) {
  return status === 'SUCCEEDED' || status === 'FAILED'
}

function buildHistoryQueryString(searchParams: URLSearchParams, updates: Partial<Record<'analysisPage' | 'imagePage', number>>) {
  const params = new URLSearchParams(searchParams.toString())

  for (const [key, value] of Object.entries(updates) as Array<[keyof typeof updates, number | undefined]>) {
    if (!value || value <= 1) {
      params.delete(key)
    } else {
      params.set(key, String(value))
    }
  }

  return params.toString()
}

export default function HistoryPageClient({ initialData }: { initialData: HistoryPageData }) {
  const [data, setData] = useState<HistoryPageData>(initialData)
  const [isRefreshingSection, setIsRefreshingSection] = useState<HistorySectionKey | null>(null)
  const [deletingAnalysisId, setDeletingAnalysisId] = useState<string | null>(null)
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    setData(initialData)
    setIsRefreshingSection(null)
  }, [initialData])

  useEffect(() => {
    const hasRunningTasks = data.analysisRecords.items.some((record) => record.status === 'STARTED')
      || data.imageRequests.items.some((record) => isActiveStatus(record.status))

    if (!hasRunningTasks) {
      return
    }

    const intervalId = window.setInterval(async () => {
      try {
        const params = new URLSearchParams()
        params.set('analysisPage', String(data.analysisRecords.page))
        params.set('analysisPageSize', String(data.analysisRecords.pageSize))
        params.set('imagePage', String(data.imageRequests.page))
        params.set('imagePageSize', String(data.imageRequests.pageSize))

        const response = await fetch(`/api/history?${params.toString()}`, {
          cache: 'no-store',
        })
        if (!response.ok) {
          return
        }

        const nextData = await response.json() as HistoryPageData
        setData(nextData)
      } catch {
        // Ignore polling errors and keep the last known history view.
      }
    }, 5000)

    return () => window.clearInterval(intervalId)
  }, [data.analysisRecords.items, data.analysisRecords.page, data.analysisRecords.pageSize, data.imageRequests.items, data.imageRequests.page, data.imageRequests.pageSize])

  function navigateWithPages(section: HistorySectionKey, nextPage: number) {
    setActionMessage(null)
    setActionError(null)
    setIsRefreshingSection(section)

    const query = buildHistoryQueryString(searchParams, section === 'analysis'
      ? { analysisPage: nextPage }
      : { imagePage: nextPage })

    router.push(query ? `${pathname}?${query}` : pathname)
  }

  async function handleDeleteAnalysis(record: HistoryAnalysisRecord) {
    if (!canDeleteAnalysisRecord(record.status) || deletingAnalysisId || deletingImageId) {
      return
    }

    const confirmed = window.confirm(`确定删除“${record.productName}”这条分析记录吗？删除后将无法再恢复当时保存的分析结果和 Prompt 方案。`)
    if (!confirmed) {
      return
    }

    setDeletingAnalysisId(record.id)
    setActionMessage(null)
    setActionError(null)

    try {
      const response = await fetch(`/api/history/analysis/${record.id}`, {
        method: 'DELETE',
      })

      const payload = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || '删除分析记录失败')
      }

      const shouldGoPreviousPage = data.analysisRecords.items.length === 1 && data.analysisRecords.page > 1
      if (shouldGoPreviousPage) {
        navigateWithPages('analysis', data.analysisRecords.page - 1)
        router.refresh()
        setActionMessage('分析记录已删除')
        return
      }

      router.refresh()
      setActionMessage('分析记录已删除')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '删除分析记录失败')
    } finally {
      setDeletingAnalysisId(null)
    }
  }

  async function handleDeleteImage(record: HistoryImageRequest) {
    if (!canDeleteImageRecord(record.status) || deletingAnalysisId || deletingImageId) {
      return
    }

    const confirmed = window.confirm('确定删除这条生图记录吗？删除后将无法再从历史页查看这次生成结果，但相关积分流水会保留。')
    if (!confirmed) {
      return
    }

    setDeletingImageId(record.id)
    setActionMessage(null)
    setActionError(null)

    try {
      const response = await fetch(`/api/history/images/${record.id}`, {
        method: 'DELETE',
      })

      const payload = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || '删除生图记录失败')
      }

      const shouldGoPreviousPage = data.imageRequests.items.length === 1 && data.imageRequests.page > 1
      if (shouldGoPreviousPage) {
        navigateWithPages('images', data.imageRequests.page - 1)
        router.refresh()
        setActionMessage('生图记录已删除，积分流水保留不变')
        return
      }

      router.refresh()
      setActionMessage('生图记录已删除，积分流水保留不变')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '删除生图记录失败')
    } finally {
      setDeletingImageId(null)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">个人历史</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">分析与生图记录</h1>
            <p className="mt-2 text-sm text-slate-500">
              已开始的分析和生图会继续在服务端执行。刷新或稍后回来，都可以在这里看到最新结果。
            </p>
          </div>
        </div>

        {actionMessage && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {actionMessage}
          </div>
        )}

        {actionError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {actionError}
          </div>
        )}

        <section className="panel p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">分析记录</h2>
              <p className="mt-2 text-sm text-slate-500">
                打开后会恢复当时保存的分析结果与已生成的 Prompt 方案。
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              共 {data.analysisRecords.total} 条
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {data.analysisRecords.items.length === 0 ? (
              <p className="text-sm text-slate-500">还没有分析记录。</p>
            ) : data.analysisRecords.items.map((record) => {
              const isDeleting = deletingAnalysisId === record.id
              const canDelete = canDeleteAnalysisRecord(record.status)

              return (
                <article key={record.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>{formatDate(record.createdAt)}</span>
                    <span>{formatStatus(record.status)}</span>
                    <span>{record.category}</span>
                    <span>{record.targetAudience}</span>
                    {record.referencesExpired && record.referenceImageCount > 0 ? (
                      <span className="text-amber-600">{record.referenceImageCount} 张参考图已过期清理</span>
                    ) : (
                      <span>{record.referenceImageCount} 张参考图</span>
                    )}
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-slate-900">{record.productName}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{record.productSummary || record.description}</p>

                  {record.referencesExpired && record.referenceImageCount > 0 && (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      参考图已按 30 天保存策略自动清理。仍可查看分析结果与已生成的 Prompt；如需带原图重新生成，请重新上传参考图。
                    </div>
                  )}

                  {record.status === 'STARTED' && (
                    <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                      任务已提交，当前仍在服务端继续执行。这个页面会自动刷新状态，进行中的分析暂不支持删除。
                    </div>
                  )}

                  {record.status === 'FAILED' && record.errorMessage && (
                    <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {record.errorMessage}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                      href={`/amazon?analysisId=${record.id}`}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                    >
                      在 Amazon 工作流打开
                    </Link>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAnalysis(record)}
                        disabled={Boolean(deletingAnalysisId) || Boolean(deletingImageId)}
                        className="rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                      >
                        {isDeleting ? '删除中...' : '删除记录'}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          {data.analysisRecords.total > 0 && (
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                第 {data.analysisRecords.page} / {data.analysisRecords.totalPages} 页
                {isRefreshingSection === 'analysis' && <span className="ml-2 text-slate-400">加载中...</span>}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigateWithPages('analysis', data.analysisRecords.page - 1)}
                  disabled={!data.analysisRecords.hasPreviousPage || isRefreshingSection !== null}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => navigateWithPages('analysis', data.analysisRecords.page + 1)}
                  disabled={!data.analysisRecords.hasNextPage || isRefreshingSection !== null}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="panel p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">生图记录</h2>
              <p className="mt-2 text-sm text-slate-500">
                删除生图记录只会从历史页移除该条记录，相关积分流水仍会保留。
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              共 {data.imageRequests.total} 条
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.imageRequests.items.length === 0 ? (
              <p className="text-sm text-slate-500">还没有生图记录。</p>
            ) : data.imageRequests.items.map((record) => {
              const isDeleting = deletingImageId === record.id
              const canDelete = canDeleteImageRecord(record.status)

              return (
                <article key={record.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {record.imageUrl ? (
                    <a href={record.imageUrl} target="_blank" rel="noreferrer" className="block">
                      <img src={record.imageUrl} alt="" className="aspect-square h-44 w-full object-cover transition hover:opacity-95" />
                    </a>
                  ) : (
                    <div className="flex aspect-square h-44 items-center justify-center bg-slate-100 text-sm text-slate-400">
                      {isActiveStatus(record.status) ? '生成中' : '暂无图片'}
                    </div>
                  )}
                  <div className="space-y-2 p-3">
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">{formatDate(record.createdAt)}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">{formatStatus(record.status)}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">{record.imageType || 'freeform'}</span>
                      {record.pointsLedgerEntry && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                          {formatPoints(record.pointsLedgerEntry.pointsDelta)} 积分
                        </span>
                      )}
                    </div>
                    {isActiveStatus(record.status) && (
                      <p className="text-sm text-sky-700">{record.statusMessage || '生图任务仍在服务端执行，结果完成后会自动出现在这里。'}</p>
                    )}
                    {record.status === 'FAILED' && record.errorMessage && (
                      <p className="text-sm text-rose-700">{record.errorMessage}</p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteImage(record)}
                          disabled={Boolean(deletingAnalysisId) || Boolean(deletingImageId)}
                          className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                        >
                          {isDeleting ? '删除中...' : '删除记录'}
                        </button>
                      ) : isActiveStatus(record.status) ? (
                        <span className="text-xs text-slate-400">进行中的任务暂不支持删除</span>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          {data.imageRequests.total > 0 && (
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                第 {data.imageRequests.page} / {data.imageRequests.totalPages} 页
                {isRefreshingSection === 'images' && <span className="ml-2 text-slate-400">加载中...</span>}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigateWithPages('images', data.imageRequests.page - 1)}
                  disabled={!data.imageRequests.hasPreviousPage || isRefreshingSection !== null}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => navigateWithPages('images', data.imageRequests.page + 1)}
                  disabled={!data.imageRequests.hasNextPage || isRefreshingSection !== null}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
