import { uploadBufferToCos } from '@/lib/cos'
import { StoredReferenceImage } from '@/lib/amazon-workflow'

// 与 COS 桶的生命周期规则保持一致：参考图上传 30 天后会被自动清理。
export const REFERENCE_IMAGE_RETENTION_DAYS = 30

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

export async function createReferenceImagePayloadsFromFiles(files: File[]) {
  return Promise.all(
    files.slice(0, 3).map(async (image) => {
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
}): Promise<StoredReferenceImage[]> {
  return Promise.all(
    params.files.slice(0, 3).map(async (image, index) => {
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

export async function createReferenceImagePayloadsFromUrls(urls: string[]) {
  return Promise.all(
    urls.slice(0, 3).map(async (url) => {
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

export async function uploadReferenceImagesForGeneration(params: {
  requestId: string
  files: File[]
}): Promise<StoredReferenceImage[]> {
  return Promise.all(
    params.files.slice(0, 3).map(async (image, index) => {
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
