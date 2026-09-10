import { NextRequest, NextResponse } from 'next/server'
import { completeAiOperation, getAiOperationExpiryDate, startAiOperation } from '@/lib/ai-operations'
import { fetchAmazonProduct, normalizeAsin } from '@/lib/amazon-product'
import { requireApiUser } from '@/lib/auth'
import { analyzeCompetitorImageStrategy, prepareStrategyImage } from '@/lib/competitor-image-strategy'
import type { AmazonMarketplace, ProductImageSourceMode } from '@/lib/competitor-strategy-types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_COMPETITOR_IMAGES = 9
const MAX_OWN_IMAGES = 9
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_UPLOAD_BYTES = 50 * 1024 * 1024
const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024
const REMOTE_IMAGE_TIMEOUT_MS = 30_000
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MARKETPLACES = new Set<AmazonMarketplace>(['US', 'CA', 'UK', 'DE', 'FR', 'IT', 'ES', 'JP', 'AU', 'MX', 'BR'])

function isMarketplace(value: string): value is AmazonMarketplace {
  return MARKETPLACES.has(value as AmazonMarketplace)
}

function isSourceMode(value: string): value is ProductImageSourceMode {
  return value === 'asin' || value === 'upload'
}

function filesFrom(formData: FormData, key: string): File[] {
  return formData.getAll(key).filter((item): item is File => item instanceof File && item.size > 0)
}

async function prepareUploadedFiles(files: File[], maxFiles: number, label: string) {
  if (files.length > maxFiles) throw new Error(`${label}最多上传 ${maxFiles} 张。`)
  let totalBytes = 0
  const output = []
  for (const file of files) {
    if (!SUPPORTED_MIME_TYPES.has(file.type)) throw new Error('目前仅支持 JPG、PNG、WEBP 图片。')
    if (file.size > MAX_IMAGE_BYTES) throw new Error('单张图片不能超过 10 MB。')
    totalBytes += file.size
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) throw new Error('上传图片总大小不能超过 50 MB。')
    output.push(await prepareStrategyImage(Buffer.from(await file.arrayBuffer())))
  }
  return output
}

async function downloadAmazonImage(url: string) {
  const parsed = new URL(url)
  const host = parsed.hostname.toLowerCase()
  if (parsed.protocol !== 'https:' || (!host.endsWith('media-amazon.com') && !host.endsWith('ssl-images-amazon.com'))) {
    throw new Error('Amazon 商品接口返回了不受支持的图片地址。')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS)
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error(`商品图片下载失败（HTTP ${response.status}）。`)
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > MAX_REMOTE_IMAGE_BYTES) throw new Error('商品图片文件过大。')
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > MAX_REMOTE_IMAGE_BYTES) throw new Error('商品图片文件过大。')
    return prepareStrategyImage(buffer)
  } finally {
    clearTimeout(timeout)
  }
}

async function resolveImageSource(input: {
  mode: ProductImageSourceMode
  marketplace: AmazonMarketplace
  asinInput: string
  files: File[]
  maxImages: number
  label: string
}) {
  if (input.mode === 'upload') {
    if (!input.files.length) throw new Error(`请上传至少一张${input.label}图片。`)
    return {
      mode: input.mode,
      asin: null,
      marketplace: input.marketplace,
      productTitle: null,
      provider: null,
      images: await prepareUploadedFiles(input.files, input.maxImages, `${input.label}图片`),
      imageUrls: [] as string[],
    }
  }

  if (!normalizeAsin(input.asinInput)) throw new Error(`请输入${input.label}的 10 位有效 ASIN，或粘贴 Amazon 商品链接。`)
  const product = await fetchAmazonProduct(input.asinInput, input.marketplace)
  let imageUrls = product.images.slice(0, input.maxImages)
  const settled = await Promise.allSettled(imageUrls.map(downloadAmazonImage))
  const images = settled.flatMap((item) => item.status === 'fulfilled' ? [item.value] : [])
  imageUrls = imageUrls.filter((_, index) => settled[index]?.status === 'fulfilled')
  if (!images.length) throw new Error(`已读取${input.label}商品，但图片下载失败，请改用上传图片。`)
  return {
    mode: input.mode,
    asin: product.asin,
    marketplace: input.marketplace,
    productTitle: product.title,
    provider: product.provider,
    images,
    imageUrls,
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let operationId: string | null = null
  try {
    const formData = await request.formData()
    const competitorModeValue = String(formData.get('competitorMode') || '')
    const competitorMarketplaceValue = String(formData.get('competitorMarketplace') || 'US').toUpperCase()
    const competitorAsinInput = String(formData.get('competitorAsin') || '')
    const ownModeValue = String(formData.get('ownMode') || 'none')
    const ownMarketplaceValue = String(formData.get('ownMarketplace') || 'US').toUpperCase()
    const ownAsinInput = String(formData.get('ownAsin') || '')
    const competitorFiles = filesFrom(formData, 'competitorImages')
    const ownFiles = filesFrom(formData, 'ownImages')

    if (!isSourceMode(competitorModeValue)) return NextResponse.json({ error: '请选择竞品的 ASIN 或上传图片。' }, { status: 400 })
    if (!isMarketplace(competitorMarketplaceValue)) return NextResponse.json({ error: '请选择竞品所在的 Amazon 站点。' }, { status: 400 })
    if (ownModeValue !== 'none' && !isSourceMode(ownModeValue)) return NextResponse.json({ error: '请选择我方商品的 ASIN 或上传图片。' }, { status: 400 })
    if (ownModeValue !== 'none' && !isMarketplace(ownMarketplaceValue)) return NextResponse.json({ error: '请选择我方商品所在的 Amazon 站点。' }, { status: 400 })

    const [competitor, own] = await Promise.all([
      resolveImageSource({
        mode: competitorModeValue,
        marketplace: competitorMarketplaceValue,
        asinInput: competitorAsinInput,
        files: competitorFiles,
        maxImages: MAX_COMPETITOR_IMAGES,
        label: '竞品',
      }),
      ownModeValue === 'none' ? Promise.resolve(null) : resolveImageSource({
        mode: ownModeValue,
        marketplace: ownMarketplaceValue as AmazonMarketplace,
        asinInput: ownAsinInput,
        files: ownFiles,
        maxImages: MAX_OWN_IMAGES,
        label: '我方商品',
      }),
    ])

    operationId = (await startAiOperation({
      userId: user.id,
      kind: 'ANALYSIS',
      sourcePage: 'competitor-strategy',
      entryPoint: '/api/competitor-strategy/analyze',
      inputSummary: {
        competitorMode: competitor.mode,
        competitorAsin: competitor.asin,
        competitorMarketplace: competitor.marketplace,
        competitorProductTitle: competitor.productTitle,
        competitorProductProvider: competitor.provider,
        competitorImageCount: competitor.images.length,
        ownMode: own?.mode || 'none',
        ownAsin: own?.asin || null,
        ownMarketplace: own?.marketplace || null,
        ownProductTitle: own?.productTitle || null,
        ownProductProvider: own?.provider || null,
        ownImageCount: own?.images.length || 0,
      },
      requestSnapshot: {
        competitor: {
          mode: competitor.mode,
          asin: competitor.asin,
          marketplace: competitor.marketplace,
          productTitle: competitor.productTitle,
          provider: competitor.provider,
          imageCount: competitor.images.length,
        },
        own: own ? {
          mode: own.mode,
          asin: own.asin,
          marketplace: own.marketplace,
          productTitle: own.productTitle,
          provider: own.provider,
          imageCount: own.images.length,
        } : null,
      },
      expiresAt: getAiOperationExpiryDate(),
    })).id

    const result = await analyzeCompetitorImageStrategy({
      competitor,
      own,
      operationId,
    })

    await completeAiOperation({
      operationId,
      status: 'SUCCEEDED',
      outputSummary: {
        competitorMode: competitor.mode,
        competitorAsin: competitor.asin,
        competitorMarketplace: competitor.marketplace,
        competitorProductProvider: competitor.provider,
        competitorImageCount: competitor.images.length,
        ownMode: own?.mode || 'none',
        ownAsin: own?.asin || null,
        ownMarketplace: own?.marketplace || null,
        ownProductProvider: own?.provider || null,
        ownImageCount: own?.images.length || 0,
        aestheticScore: result.aestheticAnalysis.overallScore,
        repeatedSellingPointCount: result.repeatedSellingPoints.length,
        evidenceGapCount: result.ownEvidenceGaps.length,
        strategyImageCount: result.differentiatedStrategy.imagePlan.length,
      },
      responseSnapshot: result,
    })

    return NextResponse.json({ result })
  } catch (error) {
    const message = error instanceof Error ? error.message : '竞品图片策略分析失败，请稍后重试。'
    if (operationId) {
      await completeAiOperation({
        operationId,
        status: 'FAILED',
        errorMessage: message,
        responseSnapshot: { errorMessage: message },
      }).catch(() => undefined)
    }
    console.error('[api/competitor-strategy/analyze] failed', { userId: user.id, message })
    const status = message.includes('未配置') ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
