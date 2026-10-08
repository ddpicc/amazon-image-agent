'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatDateTimeInBeijing } from '@/lib/date'
interface Report { id: string; sourcePage: string; status: string; createdAt: string; errorMessage: string | null }
export default function WorkflowReportHistory() {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: Report[]; total: number } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const response = await fetch(`/api/workflow-reports?page=${page}`, { cache: 'no-store' })
        if (!response.ok) throw new Error('报告列表读取失败')
        const next = await response.json()
        if (stopped) return
        setData(next); setError('')
        if (next.items.some((item: Report) => item.status === 'STARTED')) timer = setTimeout(load, 5000)
      } catch { if (!stopped) { setError('报告列表暂时无法读取，正在重试。'); timer = setTimeout(load, 10000) } }
    }
    setData(null); void load()
    return () => { stopped = true; clearTimeout(timer) }
  }, [page])
  return <section className="panel space-y-4 p-6"><div><h2 className="text-lg font-semibold">合规体检与竞品策略报告</h2><p className="mt-1 text-sm text-slate-500">保留 30 天，可恢复进行中的任务、查看报告或导出。</p></div>{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}{!data ? <p className="text-sm text-slate-500">正在加载…</p> : <><div className="divide-y divide-slate-100">{data.items.map((item) => <Link key={item.id} href={`${item.sourcePage === 'compliance-scan' ? '/compliance' : '/competitor-strategy'}?report=${encodeURIComponent(item.id)}`} className="flex items-center justify-between gap-4 py-3 text-sm hover:text-amazon-blue"><div><p className="font-semibold">{item.sourcePage === 'compliance-scan' ? '平台合规体检' : '竞品图片策略分析'}</p><p className="mt-1 text-xs text-slate-500">{formatDateTimeInBeijing(item.createdAt)}</p>{item.errorMessage && <p className="mt-1 text-xs text-rose-600">{item.errorMessage}</p>}</div><span>{item.status === 'STARTED' ? '查看进度 →' : item.status === 'SUCCEEDED' ? '查看报告 →' : '查看失败原因 →'}</span></Link>)}{!data.items.length && <p className="text-sm text-slate-500">暂无报告。</p>}</div><div className="flex items-center gap-4 text-sm"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-40">上一页</button><span>{page} / {Math.max(1, Math.ceil(data.total / 10))}</span><button disabled={page * 10 >= data.total} onClick={() => setPage(page + 1)} className="disabled:opacity-40">下一页</button></div></>}</section>
}
