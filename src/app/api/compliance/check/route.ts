import { NextRequest, NextResponse } from 'next/server'
import { completeAiOperation, getAiOperationExpiryDate, startAiOperation } from '@/lib/ai-operations'
import { requireApiUser } from '@/lib/auth'
import { checkPlatformCompliance, CompliancePlatform, inspectImageBuffer } from '@/lib/compliance-check'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function isCompliancePlatform(value: string): value is CompliancePlatform {
  return value === 'amazon' || value === 'temu'
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let operationId: string | null = null

  try {
    const formData = await request.formData()
    const platformValue = typeof formData.get('platform') === 'string' ? String(formData.get('platform')) : ''
    const image = formData.get('image')

    if (!isCompliancePlatform(platformValue)) {
      return NextResponse.json({ error: '请选择需要检查的平台' }, { status: 400 })
    }

    if (!(image instanceof File) || image.size === 0) {
      return NextResponse.json({ error: '请先上传一张商品图片' }, { status: 400 })
    }

    if (!SUPPORTED_MIME_TYPES.has(image.type)) {
      return NextResponse.json({ error: '目前仅支持 JPG、PNG、WEBP 图片' }, { status: 400 })
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: '图片不能超过 10 MB' }, { status: 400 })
    }

    const buffer = Buffer.from(await image.arrayBuffer())
    const technical = inspectImageBuffer(buffer, image.type)

    operationId = (await startAiOperation({
      userId: user.id,
      kind: 'ANALYSIS',
      sourcePage: 'compliance',
      entryPoint: '/api/compliance/check',
      inputSummary: {
        platform: platformValue,
        fileName: image.name,
        mimeType: image.type,
        bytes: image.size,
        width: technical.width,
        height: technical.height,
      },
      requestSnapshot: {
        platform: platformValue,
        fileName: image.name,
        mimeType: image.type,
        bytes: image.size,
        width: technical.width,
        height: technical.height,
      },
      expiresAt: getAiOperationExpiryDate(),
    })).id

    const result = await checkPlatformCompliance({
      platform: platformValue,
      buffer,
      technical,
      operationId,
    })

    await completeAiOperation({
      operationId,
      status: 'SUCCEEDED',
      outputSummary: {
        platform: result.platform,
        overallStatus: result.overallStatus,
        itemCount: result.items.length,
      },
      responseSnapshot: result,
    })

    return NextResponse.json({ result })
  } catch (error) {
    if (operationId) {
      await completeAiOperation({
        operationId,
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Platform compliance check failed',
        responseSnapshot: {
          errorMessage: error instanceof Error ? error.message : 'Platform compliance check failed',
        },
      }).catch(() => undefined)
    }

    console.error('[api/compliance/check] failed', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : '图片体检失败，请稍后重试',
    }, { status: 500 })
  }
}
