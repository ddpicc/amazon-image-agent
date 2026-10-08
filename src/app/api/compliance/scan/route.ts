import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireApiUser } from '@/lib/auth'
import { inspectImageBuffer } from '@/lib/compliance-check'
import { scanImageCompliance, sha256Hex } from '@/lib/compliance-scan'
import type { ComplianceImageRole } from '@/lib/compliance-check'
import { readWorkflowForm, runWorkflow, WorkflowInputError } from '@/lib/workflow-reports'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return runWorkflow(request, user.id, 'compliance-scan', async (context) => {
    const form = await readWorkflowForm(request, context.signal)
    const platform = String(form.get('platform') || '')
    const targetMarket = String(form.get('targetMarket') || '')
    if ((platform !== 'amazon' && platform !== 'temu') || (targetMarket !== 'US' && targetMarket !== 'AU')) throw new WorkflowInputError('请选择平台和目标市场。')
    const files = form.getAll('images')
    const roles = form.getAll('imageRoles')
    if (!files.length || files.length > 6) throw new WorkflowInputError('请上传 1–6 张同一商品图片。')
    let total = 0
    const images = []
    await context.stage('正在检查图片格式、分辨率与背景')
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      context.signal.throwIfAborted()
      if (!(file instanceof File) || !file.size || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new WorkflowInputError('请上传有效的 JPG、PNG 或 WEBP 图片。')
      total += file.size
      if (file.size > 10 * 1024 * 1024 || total > 40 * 1024 * 1024) throw new WorkflowInputError('单张图片不能超过 10 MB，总大小不能超过 40 MB。')
      const buffer = Buffer.from(await file.arrayBuffer())
      const technical = await inspectImageBuffer(buffer, file.type)
      const role: ComplianceImageRole = roles[index] === 'main' || roles[index] === 'secondary' ? roles[index] as ComplianceImageRole : index === 0 ? 'main' : 'secondary'
      images.push({ buffer, role, technical, fileName: file.name, sha256: sha256Hex(buffer) })
    }
    const comparisonId = String(form.get('comparisonId') || '')
    if (comparisonId) {
      const original = await prisma.aiOperation.findFirst({ where: { id: comparisonId, userId: user.id, sourcePage: 'compliance-scan', status: 'SUCCEEDED', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { id: true } })
      if (!original) throw new WorkflowInputError('原报告不存在或已过期，请取消对比后重新提交。')
    }
    await context.snapshot({ platform, targetMarket, comparisonId: comparisonId || null, imageCount: images.length, images: images.map(({ buffer, ...image }) => image) })
    const result = await scanImageCompliance({ platform, targetMarket, images, operationId: context.operationId, signal: context.signal, onStage: context.stage })
    return { ...result, comparisonId: comparisonId || null }
  })
}
