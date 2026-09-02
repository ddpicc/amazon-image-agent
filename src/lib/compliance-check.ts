import { requestTextJsonCompletion } from '@/lib/text-model'

export type CompliancePlatform = 'amazon' | 'temu'
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

export interface ComplianceResult {
  platform: CompliancePlatform
  platformLabel: string
  overallStatus: ComplianceStatus
  summary: string
  items: ComplianceCheckItem[]
  actionPlan: string[]
  ruleBasis: string[]
  limitation: string
  technical: ComplianceTechnicalInfo
}

const PLATFORM_LABELS: Record<CompliancePlatform, string> = {
  amazon: 'Amazon',
  temu: 'Temu',
}

const PLATFORM_RULES: Record<CompliancePlatform, string[]> = {
  amazon: [
    '主图应使用纯白背景（RGB 255,255,255），并且只展示实际售卖的商品。',
    '主图商品应完整、清晰，通常应占画面约 85% 或以上；不能被裁切。',
    '主图不应出现后加文字、Logo、水印、边框、色块或无关道具。',
    '图片应准确表达实际售卖商品，避免夸大、误导或展示未随商品售卖的配件。',
    '图片应清晰、对焦稳定，建议最长边至少 1000 像素以保留缩放空间；低于 500 像素属于明显风险。',
  ],
  temu: [
    'Temu 的具体要求会按站点、类目和卖家后台规则变化，不能把通用建议当作平台最终审核结论。',
    '商品主体应清晰、完整、真实，并且与实际售卖内容一致。',
    '避免水印、促销标签、无关文字、边框和会干扰商品识别的装饰元素。',
    '画面应有足够清晰度、合理构图和稳定的商品主体呈现，避免模糊、严重压缩或裁切。',
  ],
}

function isCompliancePlatform(value: string): value is CompliancePlatform {
  return value === 'amazon' || value === 'temu'
}

function normalizeStatus(value: unknown): ComplianceStatus {
  if (value === 'pass' || value === 'warning' || value === 'fail' || value === 'unknown') {
    return value
  }

  return 'unknown'
}

function deriveOverallStatus(items: ComplianceCheckItem[]): ComplianceStatus {
  if (items.some((item) => item.status === 'fail')) return 'fail'
  if (items.some((item) => item.status === 'warning')) return 'warning'
  if (items.some((item) => item.status === 'unknown')) return 'unknown'
  return 'pass'
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

function buildTechnicalItem(platform: CompliancePlatform, technical: ComplianceTechnicalInfo): ComplianceCheckItem {
  const { width, height } = technical
  const dimensionText = width && height ? `${width} × ${height} px` : '未能读取像素尺寸'

  if (!width || !height) {
    return {
      key: 'resolution',
      title: '分辨率与文件信息',
      status: 'unknown',
      evidence: `当前文件为 ${technical.mimeType}，${dimensionText}。`,
      recommendation: '建议重新导出为清晰的 JPG、PNG 或 WEBP，并在上传前确认像素尺寸。',
    }
  }

  const longestSide = Math.max(width, height)
  if (platform === 'temu') {
    return {
      key: 'resolution',
      title: '分辨率与文件信息',
      status: longestSide < 500 ? 'warning' : 'unknown',
      evidence: `${dimensionText}，最长边 ${longestSide} px，文件大小 ${(technical.bytes / 1024 / 1024).toFixed(2)} MB。`,
      recommendation: longestSide < 500
        ? '图片像素较低，建议更换清晰原图；Temu 的具体分辨率要求仍需以当前 Seller Center 和商品类目规则为准。'
        : '系统读取到图片尺寸，但 Temu 的具体分辨率要求可能按站点和类目变化，请在 Seller Center 中复核。',
    }
  }

  const minimumSide = 500
  const recommendedSide = 1000
  const status: ComplianceStatus = longestSide < minimumSide
    ? 'fail'
    : longestSide < recommendedSide
      ? 'warning'
      : 'pass'

  return {
    key: 'resolution',
    title: '分辨率与文件信息',
    status,
    evidence: `${dimensionText}，最长边 ${longestSide} px，文件大小 ${(technical.bytes / 1024 / 1024).toFixed(2)} MB。`,
    recommendation: status === 'pass'
      ? '系统读取到的像素尺寸满足本次基础检查。'
      : `建议使用最长边至少 ${recommendedSide} px 的原图，避免上传后模糊或无法放大。`,
  }
}

function buildPrompt(platform: CompliancePlatform, technical: ComplianceTechnicalInfo) {
  return `你是跨境电商商品图片审核顾问。请只根据用户上传的图片和下面给出的${PLATFORM_LABELS[platform]}基础检查依据，输出谨慎、可执行的初步体检结果。

平台：${PLATFORM_LABELS[platform]}
图片技术信息：${technical.width && technical.height ? `${technical.width} × ${technical.height} px` : '像素尺寸未知'}，格式 ${technical.mimeType}，大小 ${(technical.bytes / 1024 / 1024).toFixed(2)} MB

基础检查依据：
${PLATFORM_RULES[platform].map((rule) => `- ${rule}`).join('\n')}

判断原则：
- 只判断图片中可见的事实，不要臆测图片之外的信息。
- 看不清或无法确认时使用 unknown，不要为了给出结论而猜测。
- status 只能是 pass、warning、fail、unknown。
- fail 表示明确存在较高风险；warning 表示需要人工复核或优化；pass 表示从当前图片可见范围暂未发现明显问题。
- 不要声称“平台一定通过”，尤其不要虚构 Temu 的登录后、站点或类目专属规则。
- 重点检查：背景与构图、商品主体是否完整清晰、文字水印 Logo、是否有无关道具或夸大表达、画质与真实性。

严格输出 JSON，不要输出 Markdown：
{
  "summary": "80-160 字中文总结",
  "items": [
    {
      "key": "background|subject|overlay|accuracy|quality",
      "title": "检查项名称",
      "status": "pass|warning|fail|unknown",
      "evidence": "基于图片可见内容的证据",
      "recommendation": "明确的整改或复核建议"
    }
  ],
  "actionPlan": ["按优先级排列的 2-5 条下一步建议"]
}

最多输出 6 个 items，必须覆盖最重要的风险。`
}

export async function checkPlatformCompliance(input: {
  platform: CompliancePlatform
  buffer: Buffer
  technical: ComplianceTechnicalInfo
  operationId?: string
}): Promise<ComplianceResult> {
  if (!isCompliancePlatform(input.platform)) {
    throw new Error('Unsupported compliance platform')
  }

  const content: any[] = [
    {
      type: 'text',
      text: buildPrompt(input.platform, input.technical),
    },
    {
      type: 'image_url',
      image_url: {
        url: `data:${input.technical.mimeType};base64,${input.buffer.toString('base64')}`,
      },
    },
  ]

  const responseText = await requestTextJsonCompletion(content, 1800, {
    operationId: input.operationId,
    sourcePage: 'compliance',
    entryPoint: '/api/compliance/check',
  })

  let parsed: { summary?: unknown; items?: unknown; actionPlan?: unknown }
  try {
    parsed = JSON.parse(responseText) as typeof parsed
  } catch {
    throw new Error('AI 返回的体检结果格式无效，请稍后重试')
  }

  const aiItems = Array.isArray(parsed.items) ? parsed.items : []
  const items = aiItems.slice(0, 6).flatMap((item, index) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    return [{
      key: typeof record.key === 'string' && record.key.trim() ? record.key : `ai-check-${index + 1}`,
      title: typeof record.title === 'string' && record.title.trim() ? record.title : `图片检查项 ${index + 1}`,
      status: normalizeStatus(record.status),
      evidence: typeof record.evidence === 'string' && record.evidence.trim() ? record.evidence : '模型无法提供足够的可见证据。',
      recommendation: typeof record.recommendation === 'string' && record.recommendation.trim() ? record.recommendation : '请结合原图和平台后台要求进行人工复核。',
    }]
  })

  if (items.length === 0) {
    throw new Error('AI 未返回有效的体检项目，请稍后重试')
  }

  const technicalItem = buildTechnicalItem(input.platform, input.technical)
  const allItems = [technicalItem, ...items]
  const actionPlan = Array.isArray(parsed.actionPlan)
    ? parsed.actionPlan.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 5)
    : []

  return {
    platform: input.platform,
    platformLabel: PLATFORM_LABELS[input.platform],
    overallStatus: deriveOverallStatus(allItems),
    summary: typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : '已完成图片初步检查，请优先处理标记为高风险的项目。',
    items: allItems,
    actionPlan: actionPlan.length ? actionPlan : ['优先处理标记为失败或需复核的项目。', '修改后重新上传，并结合平台后台的最终审核结果确认。'],
    ruleBasis: PLATFORM_RULES[input.platform],
    limitation: input.platform === 'temu'
      ? 'Temu 的细则可能按站点、类目和卖家后台变化；本结果是基于公开基础原则的 AI 初步检查，不能替代 Seller Center 的最终审核。'
      : '本结果是基于图片可见内容的 AI 初步检查；类目特殊规则、账号状态和平台最终审核仍需人工确认。',
    technical: input.technical,
  }
}
