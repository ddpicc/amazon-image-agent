import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { expireStaleReports, REPORT_SOURCES } from '@/lib/workflow-reports'
export const dynamic = 'force-dynamic'
async function ownedReport(userId: string, id: string) {
  return prisma.aiOperation.findFirst({ where: { id, userId, sourcePage: { in: [...REPORT_SOURCES] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })
}
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await expireStaleReports(user.id)
  const report = await ownedReport(user.id, params.id)
  if (!report) return NextResponse.json({ error: '报告不存在或已过期。' }, { status: 404 })
  return NextResponse.json({ id: report.id, source: report.sourcePage, status: report.status, stage: (report.outputSummaryJson as { stage?: string } | null)?.stage || '正在处理', result: report.status === 'SUCCEEDED' ? report.responseSnapshotJson : null, warning: report.status === 'SUCCEEDED' && (report.responseSnapshotJson as { reportVersion?: number } | null)?.reportVersion !== 2 ? '这是旧版报告，未经过本次完整性校验；建议重新分析或复检后再使用结论。' : null, error: report.errorMessage, createdAt: report.createdAt })
}
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const report = await ownedReport(user.id, params.id)
  if (!report) return NextResponse.json({ error: '报告不存在或已过期。' }, { status: 404 })
  await prisma.aiOperation.updateMany({ where: { id: report.id, userId: user.id, status: 'STARTED' }, data: { status: 'FAILED', errorMessage: '用户已取消任务', completedAt: new Date(), durationMs: Date.now() - report.startedAt.getTime() } })
  return NextResponse.json({ ok: true })
}
