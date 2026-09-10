import { uploadBufferToCos } from '@/lib/cos'
import { StoredReferenceImage } from '@/lib/amazon-workflow'

// 与 COS 桶的生命周期规则保持一致：参考图上传 30 天后会被自动清理。
export const REFERENCE_IMAGE_RETENTION_DAYS = 30
const IMPORT_IMAGE_TIMEOUT_MS = 30_000
const MAX_IMPORTED_IMAGE_BYTES = 10 * 1024 * 1024
const SUPPORTED_IMPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function areReferenceImagesExpired(createdAt: Date | string, now = new Date()): boolean {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  if (Number.isNaN(created.getTime())) {
    return false
  }

  return now.getTime() - created.getTime() >= REFERENCE_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000
}

function getExtensionFromMediaType(mediaType: string): string {
  if (mediaType === 'image/png') return 'png'
  if (mediaType === 'image/webp') return 'webp'
  if (mediaType === 'image/gif') return 'gif'
  if (mediaType === 'image/jpeg') return 'jpg'
  return 'bin'
}

function buildReferenceImageKey(prefix: string, recordId: string, index: number, mimeType: string): string {
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const env = process.env.NODE_ENV || 'development'
  const ext = getExtensionFromMediaType(mimeType)
  return `${prefix}/${env}/${yyyy}/${mm}/${dd}/${recordId}-${index + 1}.${ext}`
}

export async function createReferenceImagePayloadsFromFiles(files: File[], maxImages = 3) {
  return Promise.all(
    files.slice(0, maxImages).map(async (image) => {
      const arrayBuffer = await image.arrayBuffer()
      return {
        data: Buffer.from(arrayBuffer).toString('base64'),
        mediaType: image.type || 'image/jpeg',
      }
    }),
  )
}

export async function uploadReferenceImagesForAnalysis(params: {
  recordId: string
  files: File[]
  maxImages?: number
}): Promise<StoredReferenceImage[]> {
  return Promise.all(
    params.files.slice(0, params.maxImages ?? 3).map(async (image, index) => {
      const arrayBuffer = await image.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const mimeType = image.type || 'image/jpeg'
      const uploaded = await uploadBufferToCos({
        buffer,
        key: buildReferenceImageKey('analysis-references', params.recordId, index, mimeType),
        contentType: mimeType,
      })

      return {
        url: uploaded.url,
        key: uploaded.key,
        mimeType: uploaded.mimeType,
        bytes: uploaded.bytes,
        name: image.name || `reference-${index + 1}.${getExtensionFromMediaType(mimeType)}`,
      }
    }),
  )
}

export async function createReferenceImagePayloadsFromUrls(urls: string[], maxImages = 3) {
  return Promise.all(
    urls.slice(0, maxImages).map(async (url) => {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to load saved reference image: ${response.status}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      return {
        data: Buffer.from(arrayBuffer).toString('base64'),
        mediaType: response.headers.get('content-type') || 'image/jpeg',
      }
    }),
  )
}

export async function downloadReferenceImageFiles(urls: string[], maxImages = 5): Promise<File[]> {
  return Promise.all(urls.slice(0, maxImages).map(async (url, index) => {
    const parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('1688 商品图片地址无效，请重新获取商品图片。')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), IMPORT_IMAGE_TIMEOUT_MS)
    try {
      const response = await fetch(parsedUrl, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error(`第 ${index + 1} 张 1688 商品图片读取失败。`)

      const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (!SUPPORTED_IMPORTED_IMAGE_TYPES.has(mimeType)) throw new Error(`第 ${index + 1} 张 1688 商品图片格式不受支持。`)

      const contentLength = Number(response.headers.get('content-length') || 0)
      if (contentLength > MAX_IMPORTED_IMAGE_BYTES) throw new Error(`第 ${index + 1} 张 1688 商品图片超过 10 MB。`)
      const buffer = await response.arrayBuffer()
      if (buffer.byteLength > MAX_IMPORTED_IMAGE_BYTES) throw new Error(`第 ${index + 1} 张 1688 商品图片超过 10 MB。`)

      const extension = getExtensionFromMediaType(mimeType)
      return new File([buffer], `1688-reference-${index + 1}.${extension}`, { type: mimeType })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error(`第 ${index + 1} 张 1688 商品图片读取超时。`)
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }))
}

export async function uploadReferenceImagesForGeneration(params: {
  requestId: string
  files: File[]
  maxImages?: number
}): Promise<StoredReferenceImage[]> {
  return Promise.all(
    params.files.slice(0, params.maxImages ?? 3).map(async (image, index) => {
      const arrayBuffer = await image.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const mimeType = image.type || 'image/jpeg'
      const uploaded = await uploadBufferToCos({
        buffer,
        key: buildReferenceImageKey('generation-references', params.requestId, index, mimeType),
        contentType: mimeType,
      })

      return {
        url: uploaded.url,
        key: uploaded.key,
        mimeType: uploaded.mimeType,
        bytes: uploaded.bytes,
        name: image.name || `reference-${index + 1}.${getExtensionFromMediaType(mimeType)}`,
      }
    }),
  )
}
