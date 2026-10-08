'use client'
import Link from 'next/link'
export default function WorkflowProgress({ stage, operationId, onCancel }: { stage: string; operationId: string | null; onCancel: () => void }) {
  return <div role="status" className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><p>{stage}</p><p className="mt-2 text-xs leading-5">任务创建后可从“我的历史”恢复。报告保留 30 天。</p><div className="mt-3 flex gap-4"><Link href="/history" className="underline">查看历史</Link>{operationId && <button type="button" onClick={onCancel} className="underline">取消任务</button>}</div></div>
}
