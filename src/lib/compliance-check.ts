import sharp from 'sharp'

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

export async function inspectImageBuffer(buffer: Buffer, mimeType: string): Promise<ComplianceTechnicalInfo> {
  const metadata = await sharp(buffer, { failOn: 'warning' }).metadata()
  const formats: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
  const actualMime = formats[metadata.format || '']
  if (!actualMime || actualMime !== mimeType || !metadata.width || !metadata.height) {
    throw new Error('图片内容与格式不匹配，或无法读取尺寸，请重新导出为 JPG、PNG 或 WEBP。')
  }
  if ((metadata.pages || 1) > 1) throw new Error('请上传静态图片，不支持动画图片。')
  return { mimeType: actualMime, bytes: buffer.byteLength, width: metadata.width, height: metadata.height }
}
