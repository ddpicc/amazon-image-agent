import { NextRequest, NextResponse } from 'next/server'
import { completeAiOperation, getAiOperationExpiryDate, startAiOperation } from '@/lib/ai-operations'
import { requireApiUser } from '@/lib/auth'
import { inspectImageBuffer } from '@/lib/compliance-check'
import { scanImageCompliance, sha256Hex } from '@/lib/compliance-scan'
import type { ComplianceImageRole, CompliancePlatform } from '@/lib/compliance-check'
import type { ComplianceMarket } from '@/lib/compliance-scan-types'

const MAX_IMAGES = 6
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_BYTES = 40 * 1024 * 1024
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function isCompliancePlatform(value: string): value is CompliancePlatform {
  return value === 'amazon' || value === 'temu'
}

function isComplianceImageRole(value: string): value is ComplianceImageRole {
  return value === 'main' || value === 'secondary'
}

function isComplianceMarket(value: string): value is ComplianceMarket {
  return value === 'US' || value === 'AU'
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let operationId: string | null = null
  try {
    const formData = await request.formData()
    const platform = String(formData.get('platform') || '')
    const targetMarket = String(formData.get('targetMarket') || '')
    const images = formData.getAll('images')
    const roles = formData.getAll('imageRoles').map((role) => String(role))

    if (!isCompliancePlatform(platform) || !isComplianceMarket(targetMarket)) {
      return NextResponse.json({ error: '请选择平台和目标市场' }, { status: 400 })
    }
    if (!images.length || images.length > MAX_IMAGES) {
      return NextResponse.json({ error: '请上传 1–6 张同一商品图片' }, { status: 400 })
    }

    const preparedImages: Array<{
      buffer: Buffer
      role: ComplianceImageRole
      technical: ReturnType<typeof inspectImageBuffer>
      fileName: string
      sha256: string
    }> = []
    let totalBytes = 0

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index]
      if (!(image instanceof File) || image.size === 0) {
        return NextResponse.json({ error: '上传的图片文件无效' }, { status: 400 })
      }
      if (!SUPPORTED_MIME_TYPES.has(image.type)) {
        return NextResponse.json({ error: '目前仅支持 JPG、PNG、WEBP 图片' }, { status: 400 })
      }
      if (image.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: '单张图片不能超过 10 MB' }, { status: 400 })
      }
      totalBytes += image.size
      if (totalBytes > MAX_TOTAL_BYTES) {
        return NextResponse.json({ error: '图片总大小不能超过 40 MB' }, { status: 400 })
      }

      const buffer = Buffer.from(await image.arrayBuffer())
      const technical = inspectImageBuffer(buffer, image.type)
      const requestedRole = roles[index]
      const role: ComplianceImageRole = isComplianceImageRole(requestedRole)
        ? requestedRole
        : index === 0 ? 'main' : 'secondary'
      preparedImages.push({
        buffer,
        role,
        technical,
        fileName: image.name,
        sha256: sha256Hex(buffer),
      })
    }

    operationId = (await startAiOperation({
      userId: user.id,
      kind: 'ANALYSIS',
      sourcePage: 'compliance-scan',
      entryPoint: '/api/compliance/scan',
      inputSummary: {
        platform,
        targetMarket,
        imageCount: preparedImages.length,
        images: preparedImages.map((image, index) => ({
          index,
          role: image.role,
          fileName: image.fileName,
          mimeType: image.technical.mimeType,
          bytes: image.technical.bytes,
          width: image.technical.width,
          height: image.technical.height,
          sha256: image.sha256,
        })),
      },
      requestSnapshot: {
        platform,
        targetMarket,
        imageCount: preparedImages.length,
        images: preparedImages.map((image, index) => ({
          index,
          role: image.role,
          mimeType: image.technical.mimeType,
          bytes: image.technical.bytes,
          width: image.technical.width,
          height: image.technical.height,
          sha256: image.sha256,
        })),
      },
      expiresAt: getAiOperationExpiryDate(),
    })).id

    const result = await scanImageCompliance({
      platform,
      targetMarket,
      images: preparedImages,
      operationId,
    })

    await completeAiOperation({
      operationId,
      status: 'SUCCEEDED',
      outputSummary: {
        platform: result.platform,
        targetMarket: result.targetMarket,
        overallStatus: result.overallStatus,
        overallRiskLevel: result.overallRiskLevel,
        imageCount: result.images.length,
        patentCandidateCount: result.modules.designPatent.candidates.length,
      },
      responseSnapshot: result,
    })

    return NextResponse.json({ result })
  } catch (error) {
    if (operationId) {
      await completeAiOperation({
        operationId,
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Image compliance scan failed',
        responseSnapshot: { errorMessage: error instanceof Error ? error.message : 'Image compliance scan failed' },
      }).catch(() => undefined)
    }
    console.error('[api/compliance/scan] failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '图片体检失败，请稍后重试' }, { status: 500 })
  }
}
