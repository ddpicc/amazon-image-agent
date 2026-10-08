'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

type Source = 'compliance-scan' | 'competitor-strategy'
export function useWorkflowRun<T>(source: Source, userId: string) {
  const [result, setResult] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('')
  const [operationId, setOperationId] = useState<string | null>(null)
  const currentId = useRef<string | null>(null)
  const epoch = useRef(0)
  const storageKey = `workflow:${userId}:${source}`
  const remember = useCallback((id: string) => {
    currentId.current = id
    setOperationId(id)
    try { sessionStorage.setItem(storageKey, id) } catch { /* storage unavailable */ }
    const url = new URL(window.location.href)
    url.searchParams.set('report', id)
    window.history.replaceState(null, '', url)
  }, [storageKey])
  const restore = useCallback((id: string) => {
    epoch.current += 1
    remember(id); setResult(null); setError(''); setBusy(true); setStage('正在恢复任务与报告')
  }, [remember])
  useEffect(() => {
    let saved: string | null = null
    try { saved = sessionStorage.getItem(storageKey) } catch { /* optional */ }
    const id = new URLSearchParams(window.location.search).get('report') || saved
    if (id) restore(id)
    return () => { epoch.current += 1 }
  }, [restore, storageKey])
  useEffect(() => {
    if (!operationId || !busy) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const response = await fetch(`/api/workflow-reports/${encodeURIComponent(operationId)}`, { cache: 'no-store' })
        const data = await response.json()
        if (stopped) return
        if (!response.ok || data.source !== source) {
          setError(data.error || '报告类型不匹配。'); setBusy(false); return
        }
        setStage(data.stage)
        if (data.status === 'SUCCEEDED') { setResult(data.result); setError(data.warning || ''); setBusy(false); return }
        if (data.status === 'FAILED') { setError(data.error || '任务未完成，请重试。'); setBusy(false); return }
      } catch { if (!stopped) setStage('连接中断，正在重新获取任务状态…') }
      if (!stopped) timer = setTimeout(poll, 3000)
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [operationId, busy, source])
  const submit = async (endpoint: string, form: FormData) => {
    const version = ++epoch.current
    currentId.current = null; setOperationId(null); setResult(null); setError(''); setBusy(true); setStage('正在上传图片并创建任务')
    try {
      const response = await fetch(endpoint, { method: 'POST', body: form, headers: { Accept: 'application/x-ndjson' } })
      if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('application/x-ndjson')) {
        const data = await response.json()
        throw new Error(data.error || '任务创建失败，请重试。')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      const consume = (line: string) => {
        if (!line.trim() || epoch.current !== version) return
        const event = JSON.parse(line)
        if (event.operationId) remember(event.operationId)
        if (event.stage) setStage(event.stage)
        if (event.type === 'result') { setResult(event.result); setError(''); setBusy(false) }
        if (event.type === 'error') { setError(event.error); setBusy(false) }
      }
      for (;;) {
        const { value, done } = await reader.read()
        if (epoch.current !== version) { await reader.cancel(); return }
        pending += decoder.decode(value, { stream: !done })
        const lines = pending.split('\n'); pending = lines.pop() || ''
        lines.forEach(consume)
        if (done) { consume(pending); break }
      }
      if (!currentId.current) throw new Error('连接在任务创建前中断，请重试。')
    } catch (failure) {
      if (epoch.current !== version) return
      if (currentId.current) setStage('连接中断，正在恢复任务状态…')
      else { setError(failure instanceof Error ? failure.message : '请求失败'); setBusy(false) }
    }
  }
  const cancel = async () => {
    if (!operationId) return
    try {
      const response = await fetch(`/api/workflow-reports/${encodeURIComponent(operationId)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('取消失败，请重试。')
      // Read the terminal state: completion may have won the race with cancellation.
      const latest = await fetch(`/api/workflow-reports/${encodeURIComponent(operationId)}`, { cache: 'no-store' })
      if (!latest.ok) throw new Error('正在确认取消结果，请稍候。')
      const data = await latest.json()
      epoch.current += 1
      if (data.status === 'SUCCEEDED') { setResult(data.result); setError('') }
      else setError(data.error || '任务已取消')
      setBusy(false)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '取消失败') }
  }
  const clear = () => {
    if (busy) return
    epoch.current += 1; currentId.current = null; setOperationId(null); setResult(null); setError('')
    try { sessionStorage.removeItem(storageKey) } catch { /* optional */ }
    const url = new URL(window.location.href); url.searchParams.delete('report'); window.history.replaceState(null, '', url)
  }
  return { result, setResult, error, setError, busy, stage, operationId, submit, cancel, clear, restore }
}
