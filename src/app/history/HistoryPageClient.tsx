'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED'
  productSummary: string | null
  analysisJson: unknown
  promptPlanJson: unknown
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

interface HistoryImageAsset {
  id: string
  requestId: string
  cosUrl: string
  cosKey: string
  mimeType: string
  bytes: number
  createdAt: string
}

interface HistoryImageRequest {
  id: string
  entryApi: string
  imageType: string | null
  prompt: string
  revisedPrompt: string | null
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED'
  size: string | null
  aspectRatio: string | null
  durationMs: number | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  pointsLedgerEntry: {
    id: string
    pointsDelta: number
    createdAt: string
  } | null
  assets: HistoryImageAsset[]
}

export interface HistoryPageData {
  analysisRecords: HistoryAnalysisRecord[]
  imageRequests: HistoryImageRequest[]
}

function formatStatus(status: 'STARTED' | 'SUCCEEDED' | 'FAILED') {
  if (status === 'STARTED') return '进行中'
  if (status === 'SUCCEEDED') return '已完成'
  return '失败'
}

function formatDate(value: string) {
  return formatDateTimeInBeijing(value)
}

export default function HistoryPageClient({ initialData }: { initialData: HistoryPageData }) {
  const [data, setData] = useState<HistoryPageData>(initialData)

  useEffect(() => {
    const hasRunningTasks = data.analysisRecords.some((record) => record.status === 'STARTED')
      || data.imageRequests.some((record) => record.status === 'STARTED')

    if (!hasRunningTasks) {
      return
    }

    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch('/api/history', {
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
  }, [data.analysisRecords, data.imageRequests])

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
          <Link href="/" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回首页
          </Link>
        </div>

        <section className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-900">分析记录</h2>
          <div className="mt-4 space-y-4">
            {data.analysisRecords.length === 0 ? (
              <p className="text-sm text-slate-500">还没有分析记录。</p>
            ) : data.analysisRecords.map((record) => {
              return (
                <article key={record.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>{formatDate(record.createdAt)}</span>
                    <span>{formatStatus(record.status)}</span>
                    <span>{record.category}</span>
                    <span>{record.targetAudience}</span>
                    <span>{record.referenceImageCount} 张参考图</span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-slate-900">{record.productName}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{record.productSummary || record.description}</p>

                  {record.status === 'STARTED' && (
                    <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                      任务已提交，当前仍在服务端继续执行。这个页面会自动刷新状态。
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
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-900">生图记录</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.imageRequests.length === 0 ? (
              <p className="text-sm text-slate-500">还没有生图记录。</p>
            ) : data.imageRequests.map((record) => (
              <article key={record.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {record.assets[0] ? (
                  <a href={record.assets[0].cosUrl} target="_blank" rel="noreferrer" className="block">
                    <img src={record.assets[0].cosUrl} alt="" className="aspect-square h-44 w-full object-cover transition hover:opacity-95" />
                  </a>
                ) : (
                  <div className="flex aspect-square h-44 items-center justify-center bg-slate-100 text-sm text-slate-400">
                    {record.status === 'STARTED' ? '生成中' : '暂无图片'}
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
                  {record.status === 'STARTED' && (
                    <p className="text-sm text-sky-700">生图任务仍在服务端执行，结果完成后会自动出现在这里。</p>
                  )}
                  {record.status === 'FAILED' && record.errorMessage && (
                    <p className="text-sm text-rose-700">{record.errorMessage}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
