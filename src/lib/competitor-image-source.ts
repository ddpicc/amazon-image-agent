import type { AmazonProductResult } from '@/lib/amazon-product'
import { prepareStrategyImage } from '@/lib/competitor-image-strategy'
import type { AmazonMarketplace, ProductImageSourceMode } from '@/lib/competitor-strategy-types'
import { verifyProductSelection } from '@/lib/product-selection-token'

export const STRATEGY_MARKETPLACES = new Set<AmazonMarketplace>(['US', 'CA', 'UK', 'DE', 'FR', 'IT', 'ES', 'JP', 'AU', 'MX', 'BR'])
export function selectedImageIndexes(value: unknown, count: number): number[] {
  if (!Array.isArray(value) || !value.length || value.length > 9 || new Set(value).size !== value.length || value.some((i) => !Number.isInteger(i) || i < 0 || i >= count)) throw new Error('请确认图片选择和顺序后再分析。')
  return value
}
async function downloadImage(url: string, signal?: AbortSignal) {
  const parsed = new URL(url)
  const hosts = ['media-amazon.com', 'ssl-images-amazon.com']
  if (parsed.protocol !== 'https:' || !hosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) throw new Error('商品图片地址不受支持。')
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timeout = setTimeout(abort, 30_000)
  try {
    const response = await fetch(parsed, { cache: 'no-store', redirect: 'error', signal: controller.signal })
    if (!response.ok || !response.body) throw new Error('图片下载失败')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > 12 * 1024 * 1024) throw new Error('图片超过 12 MB')
        chunks.push(value)
      }
    } finally { await reader.cancel().catch(() => undefined) }
    return prepareStrategyImage(Buffer.concat(chunks))
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
export async function resolveStrategySource(input: {
  mode: ProductImageSourceMode; marketplace: AmazonMarketplace; files: File[]; label: string
  token: string; indexes: unknown; userId: string; signal?: AbortSignal
}) {
  if (input.mode === 'upload') {
    if (!input.files.length || input.files.length > 9) throw new Error(`${input.label}请上传 1–9 张图片。`)
    const images = []
    for (const file of input.files) {
      input.signal?.throwIfAborted()
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('仅支持单张不超过 10 MB 的 JPG、PNG、WEBP。')
      images.push(await prepareStrategyImage(Buffer.from(await file.arrayBuffer())))
    }
    return { mode: input.mode, asin: null, marketplace: input.marketplace, productTitle: null, provider: null, images, imageUrls: [] as string[], originalImageIndexes: images.map((_, i) => i) }
  }
  if (!input.token) throw new Error(`请先获取${input.label}图片并确认图序。`)
  const product = verifyProductSelection<AmazonProductResult>(input.token, input.userId)
  if (product.marketplace !== input.marketplace) throw new Error('站点已变更，请重新获取图片。')
  const indexes = selectedImageIndexes(input.indexes, product.images.length)
  const imageUrls = indexes.map((i) => product.images[i])
  const settled = await Promise.allSettled(imageUrls.map((url) => downloadImage(url, input.signal)))
  input.signal?.throwIfAborted()
  const missing = settled.flatMap((item, i) => item.status === 'rejected' ? [indexes[i] + 1] : [])
  if (missing.length) throw new Error(`${input.label}原图 ${missing.join('、')} 下载失败，本次未分析。请重试，或重新确认图序后移除缺图、改用上传图片。`)
  const images = settled.map((item) => { if (item.status === 'rejected') throw item.reason; return item.value })
  return { mode: input.mode, asin: product.asin, marketplace: product.marketplace, productTitle: product.title, provider: product.provider, images, imageUrls, originalImageIndexes: indexes }
}
