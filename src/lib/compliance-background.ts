import sharp from 'sharp'
import type { ComplianceBackgroundAnalysis } from '@/lib/compliance-scan-types'

const SAMPLE_SIZE = 256
const BORDER_RATIO = 0.08
const COLOR_BIN_SIZE = 16
const OPAQUE_ALPHA = 128
const NEAR_WHITE_CHANNEL_MIN = 250

type Rgb = [number, number, number]

interface ColorBucket {
  count: number
  red: number
  green: number
  blue: number
}

function colorBin(channel: number) {
  return Math.floor(channel / COLOR_BIN_SIZE)
}

function colorKey(red: number, green: number, blue: number) {
  return colorBin(red) + ':' + colorBin(green) + ':' + colorBin(blue)
}

function toHex(rgb: Rgb) {
  return '#' + rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')
}

function isNearWhite(red: number, green: number, blue: number) {
  return red >= NEAR_WHITE_CHANNEL_MIN && green >= NEAR_WHITE_CHANNEL_MIN && blue >= NEAR_WHITE_CHANNEL_MIN
}

/**
 * Estimates the background from the image border. This intentionally reports
 * measurements rather than pretending to segment the subject from the scene.
 */
export async function analyzeBackgroundColor(buffer: Buffer): Promise<ComplianceBackgroundAnalysis> {
  const { data, info } = await sharp(buffer, { limitInputPixels: 40_000_000 })
    .ensureAlpha()
    .resize({ width: SAMPLE_SIZE, height: SAMPLE_SIZE, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const border = Math.max(1, Math.round(Math.min(info.width, info.height) * BORDER_RATIO))
  const buckets = new Map<string, ColorBucket>()
  let sampledPixelCount = 0
  let nearWhitePixelCount = 0

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const isBorder = x < border || x >= info.width - border || y < border || y >= info.height - border
      if (!isBorder) continue

      const offset = (y * info.width + x) * info.channels
      const red = data[offset]
      const green = data[offset + 1]
      const blue = data[offset + 2]
      const alpha = data[offset + 3]
      if (alpha < OPAQUE_ALPHA) continue

      sampledPixelCount += 1
      if (isNearWhite(red, green, blue)) nearWhitePixelCount += 1

      const key = colorKey(red, green, blue)
      const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 }
      bucket.count += 1
      bucket.red += red
      bucket.green += green
      bucket.blue += blue
      buckets.set(key, bucket)
    }
  }

  if (!sampledPixelCount || !buckets.size) {
    return {
      rgb: null,
      hex: null,
      edgeNearWhiteRatio: null,
      edgeUniformity: null,
      sampledPixelCount,
      method: 'edge-sampling',
    }
  }

  const dominant = Array.from(buckets.values()).sort((left, right) => right.count - left.count)[0]
  const rgb: Rgb = [
    Math.round(dominant.red / dominant.count),
    Math.round(dominant.green / dominant.count),
    Math.round(dominant.blue / dominant.count),
  ]

  return {
    rgb,
    hex: toHex(rgb),
    edgeNearWhiteRatio: nearWhitePixelCount / sampledPixelCount,
    edgeUniformity: dominant.count / sampledPixelCount,
    sampledPixelCount,
    method: 'edge-sampling',
  }
}
