import { NextRequest, NextResponse } from 'next/server'
import { getAiOperationExpiryDate, startAiOperation } from '@/lib/ai-operations'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const REPORT_SOURCES = ['compliance-scan', 'competitor-strategy'] as const
export type ReportSource = typeof REPORT_SOURCES[number]
export const WORKFLOW_TIMEOUT_MS = 15 * 60 * 1000
export class WorkflowInputError extends Error {}
export interface WorkflowContext {
  operationId: string
  signal: AbortSignal
  stage: (label: string) => Promise<void>
  snapshot: (input: unknown) => Promise<void>
}
export async function readWorkflowForm(request: NextRequest, signal: AbortSignal): Promise<FormData> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: () => void = () => undefined
  try {
    return await Promise.race([
      request.formData(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new WorkflowInputError('上传解析超过 60 秒，请减少图片大小后重试。')), 60_000)
        onAbort = () => reject(new Error('任务已取消'))
        signal.addEventListener('abort', onAbort, { once: true })
        if (signal.aborted) onAbort()
      }),
    ])
  } finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort) }
}
export async function runWorkflow<T extends object>(request: NextRequest, userId: string, source: ReportSource, run: (context: WorkflowContext) => Promise<T>) {
  // Persist before multipart parsing, remote downloads or model calls.
  const operation = await startAiOperation({ userId, kind: 'ANALYSIS', sourcePage: source, entryPoint: new URL(request.url).pathname, inputSummary: { stage: '正在接收并检查图片' }, expiresAt: getAiOperationExpiryDate() })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('任务超过 15 分钟，请重试。')), WORKFLOW_TIMEOUT_MS)
  let checking = false
  const cancelCheck = setInterval(async () => {
    if (checking) return
    checking = true
    try {
      const current = await prisma.aiOperation.findUnique({ where: { id: operation.id }, select: { status: true } })
      if (!current || current.status !== 'STARTED') controller.abort(new Error('任务已取消'))
    } catch { /* A transient DB error is handled by the next persisted stage. */ }
    finally { checking = false }
  }, 2000)
  const encoder = new TextEncoder()
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
  const emit = (event: unknown) => {
    try { streamController?.enqueue(encoder.encode(JSON.stringify(event) + '\n')) } catch { streamController = null }
  }
  const execute = async () => {
    emit({ type: 'started', operationId: operation.id, stage: '正在接收并检查图片' })
    try {
      const result = await run({
        operationId: operation.id,
        signal: controller.signal,
        stage: async (stage) => {
          controller.signal.throwIfAborted()
          const updated = await prisma.aiOperation.updateMany({ where: { id: operation.id, status: 'STARTED' }, data: { outputSummaryJson: { stage } } })
          if (!updated.count) throw new Error('任务已取消')
          emit({ type: 'stage', stage })
        },
        snapshot: async (input) => {
          controller.signal.throwIfAborted()
          await prisma.aiOperation.updateMany({ where: { id: operation.id, status: 'STARTED' }, data: { inputSummaryJson: input as Prisma.InputJsonValue, requestSnapshotJson: input as Prisma.InputJsonValue } })
        },
      })
      controller.signal.throwIfAborted()
      const reportResult = { ...result, reportVersion: 2 }
      const saved = await prisma.aiOperation.updateMany({ where: { id: operation.id, status: 'STARTED' }, data: { status: 'SUCCEEDED', outputSummaryJson: { stage: '报告已保存' }, responseSnapshotJson: reportResult as Prisma.InputJsonValue, completedAt: new Date(), durationMs: Date.now() - operation.startedAt.getTime() } })
      if (!saved.count) throw new Error('任务已取消')
      const response = { result: reportResult, operationId: operation.id }
      emit({ type: 'result', ...response })
      return NextResponse.json(response)
    } catch (error) {
      const message = controller.signal.aborted ? (controller.signal.reason?.message || '任务已取消') : error instanceof Error ? error.message : '任务失败，请重试。'
      await prisma.aiOperation.updateMany({ where: { id: operation.id, status: 'STARTED' }, data: { status: 'FAILED', errorMessage: message, completedAt: new Date(), durationMs: Date.now() - operation.startedAt.getTime() } }).catch(() => undefined)
      emit({ type: 'error', error: message, operationId: operation.id })
      return NextResponse.json({ error: message, operationId: operation.id }, { status: error instanceof WorkflowInputError ? 400 : 500 })
    } finally {
      clearInterval(cancelCheck); clearTimeout(timeout)
      try { streamController?.close() } catch { /* browser disconnected; report is persisted */ }
    }
  }
  if (!request.headers.get('accept')?.includes('application/x-ndjson')) return execute()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { streamController = controller; void execute() },
    cancel() { streamController = null },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } })
}

export async function expireStaleReports(userId: string) {
  await prisma.aiOperation.updateMany({ where: { userId, sourcePage: { in: [...REPORT_SOURCES] }, status: 'STARTED', startedAt: { lt: new Date(Date.now() - WORKFLOW_TIMEOUT_MS) } }, data: { status: 'FAILED', errorMessage: '任务已中断或超时，请重新提交。', completedAt: new Date() } })
}
