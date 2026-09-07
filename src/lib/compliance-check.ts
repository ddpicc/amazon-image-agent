export type CompliancePlatform = 'amazon' | 'temu'
export type ComplianceImageRole = 'main' | 'secondary'
export type ComplianceStatus = 'pass' | 'warning' | 'fail' | 'unknown'

export interface ComplianceTechnicalInfo {
  mimeType: string
  bytes: number
  width: number | null
  height: number | null
}

export interface ComplianceCheckItem {
  key: string
  title: string
  status: ComplianceStatus
  evidence: string
  recommendation: string
}

const PLATFORM_LABELS: Record<CompliancePlatform, string> = {
  amazon: 'Amazon',
  temu: 'Temu',
}

const IMAGE_ROLE_LABELS: Record<ComplianceImageRole, string> = {
  main: '主图',
  secondary: '辅图 / 详情图',
}

const PLATFORM_RULES: Record<CompliancePlatform, Record<ComplianceImageRole, string[]>> = {
  amazon: {
    main: [
      '主图应使用纯白背景（RGB 255,255,255），并且只展示实际售卖的商品。',
      '主图商品应完整、清晰，通常应占画面约 85% 或以上；不能被裁切。',
      '主图不应出现后加文字、Logo、水印、边框、色块或无关道具。',
      '图片应准确表达实际售卖商品，避免夸大、误导或展示未随商品售卖的配件。',
    ],
    secondary: [
      '辅图不自动套用主图的纯白背景要求，可以展示商品不同角度、使用场景和看不见的细节。',
      '图片仍应准确表达实际售卖商品，商品及其关键特征应清晰可见，并与商品标题和实际内容一致。',
      '说明性文字、版式元素或场景道具不自动判为违规，但不能遮挡商品、制造虚假承诺或误导购买者。',
    ],
  },
  temu: {
    main: [
      'Temu 的具体要求会按站点、类目和卖家后台规则变化，不能把通用建议当作平台最终审核结论。',
      '主图应让实际售卖商品清晰、完整、真实地成为视觉主体，避免严重裁切或主体缺失。',
      '检查水印、促销标签、无关文字和装饰元素是否干扰商品识别或造成误导，不预设统一的纯白背景规则。',
    ],
    secondary: [
      'Temu 的具体要求会按站点、类目和卖家后台规则变化，不能把通用建议当作平台最终审核结论。',
      '辅图可以用于展示不同角度、使用方式、功能细节或场景，但应与实际售卖内容一致。',
      '检查文字、Logo、水印、版式和道具是否清晰、真实、不遮挡主体且不制造误导，不预设统一的纯白背景规则。',
    ],
  },
}

export function getComplianceRuleBasis(platform: CompliancePlatform, imageRole: ComplianceImageRole) {
  return PLATFORM_RULES[platform][imageRole]
}

export function getCompliancePlatformLabel(platform: CompliancePlatform) {
  return PLATFORM_LABELS[platform]
}

export function getComplianceImageRoleLabel(imageRole: ComplianceImageRole) {
  return IMAGE_ROLE_LABELS[imageRole]
}

function parseImageDimensions(buffer: Buffer, mimeType: string): { width: number | null; height: number | null } {
  if (mimeType === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 0, 8) === '\x89PNG\r\n\x1a\n') {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    }
  }

  if (mimeType === 'image/webp' && buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16)
    if (chunk === 'VP8X') {
      return {
        width: 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16),
        height: 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16),
      }
    }
  }

  if (mimeType === 'image/jpeg' && buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1
        continue
      }

      const marker = buffer[offset + 1]
      offset += 2
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue
      }
      if (offset + 2 > buffer.length) break

      const segmentLength = buffer.readUInt16BE(offset)
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break
      const isStartOfFrame = marker >= 0xc0 && marker <= 0xc3
        || marker >= 0xc5 && marker <= 0xc7
        || marker >= 0xc9 && marker <= 0xcb
        || marker >= 0xcd && marker <= 0xcf

      if (isStartOfFrame && offset + 7 <= buffer.length) {
        return {
          height: buffer.readUInt16BE(offset + 3),
          width: buffer.readUInt16BE(offset + 5),
        }
      }

      offset += segmentLength
    }
  }

  return { width: null, height: null }
}

export function inspectImageBuffer(buffer: Buffer, mimeType: string): ComplianceTechnicalInfo {
  const dimensions = parseImageDimensions(buffer, mimeType)
  return {
    mimeType,
    bytes: buffer.byteLength,
    ...dimensions,
  }
}