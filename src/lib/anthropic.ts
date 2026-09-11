import OpenAI from 'openai'
import {
  requestTextJsonCompletion,
  type TextModelStatusEvent,
  type TextOperationContext,
} from '@/lib/text-model'
import { AMAZON_DEFAULT_RENDER_SIZE } from '@/lib/image-options'
import {
  AMAZON_REFERENCE_IMAGE_LIMIT,
  AmazonAnalysisStageResult,
} from '@/lib/amazon-workflow'

export type AmazonImageType = 'main-white' | 'lifestyle' | 'infographic' | 'detail' | 'size'
export type RecommendedPlanType =
  | AmazonImageType
  | 'aplus-main'
  | 'aplus-hero'
  | 'aplus-transform'
  | 'aplus-grid'
  | 'aplus-lifestyle'
  | 'aplus-feature'
  | 'aplus-detail'

export interface AnalyzeProductInput {
  productName: string
  description: string
  additionalRequirements?: string
  category?: string
  targetAudience?: string
  referenceImages?: Array<{
    data: string
    mediaType: string
  }>
  operationId?: string
  sourcePage?: string
  entryPoint?: string
  onTextModelStatus?: (event: TextModelStatusEvent) => void
}

export interface RecommendedImagePlanItem {
  type: RecommendedPlanType
  index: number
  title: string
  goal: string
  notes: string[]
}

export interface ReferenceImageAdvice {
  needMoreReferences: boolean
  reason: string
  recommendedShots: string[]
}

export interface ReferenceImageObservation {
  imageIndex: number
  observations: string[]
}

export interface AnalyzeProductOutput {
  productSummary: string
  sellingPoints: string[]
  referenceImageObservations: ReferenceImageObservation[]
  referenceImageSummary: string
  amazonImageGuidelines: string[]
  complianceChecklist: string[]
  imageContentSuggestions: string[]
  visualStyleRecommendations: string[]
  visualSystemGuidance: string[]
  promptingPrinciples: string[]
  generationConstraints?: string[]
  referenceImageAdvice: ReferenceImageAdvice
  canGeneratePrompts: boolean
  workflowVersion?: 2
  analysisStages?: AmazonAnalysisStageResult[]
}

export interface AmazonAnalysisWorkflowResult {
  basicAnalysis: AnalyzeProductOutput
  amazonPrompts: GeneratePromptsOutput
  stages: AmazonAnalysisStageResult[]
}

export interface GeneratePromptsOutput {
  status?: 'idle' | 'completed'
  recommendedImagePlan: RecommendedImagePlanItem[]
  suggestedPrompts: Record<string, string>
  workflowVersion?: 2
  items?: Array<{
    slotId: 'main-white' | 'secondary-1' | 'secondary-2' | 'secondary-3' | 'secondary-4' | 'secondary-5' | 'secondary-6' | 'secondary-7' | 'secondary-8'
    title: string
    visualForm: string
    prompt: string
    displayPrompt: string
    size: string
    enabled: boolean
  }>
}

export interface GenerateAPlusPromptOutput extends GeneratePromptsOutput {
  imageSpec: {
    size: '1536x960'
  }
}

export interface PromptGenerationProgress {
  key: string
  plan: RecommendedImagePlanItem
  prompt: string
  completed: number
  total: number
  usedFallback: boolean
}

function getSuggestedPromptKey(type: AmazonImageType, index: number): string {
  if (type === 'main-white' || type === 'size' || type === 'detail') {
    return type
  }
  return `${type}-${index}`
}

const DEFAULT_PLANS: RecommendedImagePlanItem[] = [
  { type: 'main-white', index: 1, title: '白底主图', goal: '用于搜索结果和详情页首图，优先确保合规与点击率。', notes: ['纯白背景', '只展示售卖主体', '主体占画面约 85% 或以上', '图片内不得出现中文'] },
  { type: 'size', index: 1, title: '尺寸图', goal: '帮助用户快速建立尺寸认知，降低购买误判。', notes: ['与常见物体对比', '尺寸表达清楚', '避免误导性比例', '图片内不得出现中文，尺寸标注只能使用英文'] },
  { type: 'detail', index: 1, title: '细节图', goal: '放大材质、工艺、触感或关键结构，增强品质感。', notes: ['近景特写', '突出纹理或做工', '保留真实材质表现'] },
  { type: 'infographic', index: 1, title: '卖点图一', goal: '拆出第一张卖点图，聚焦 1-2 个最核心的功能、材质或差异化优势，信息不宜过密。', notes: ['聚焦最强卖点', '信息量克制', '文字必须为英文', '适合信息图排版'] },
  { type: 'infographic', index: 2, title: '卖点图二', goal: '拆出第二张卖点图，补充另一组卖点、功能或使用价值，避免把所有信息塞进同一张。', notes: ['承接但不重复第一张', '信息量克制', '文字必须为英文', '视觉层次分明'] },
  { type: 'lifestyle', index: 1, title: '利益场景图', goal: '用一个有情绪和生活感的真实场景，把产品最强购买理由与使用结果讲清楚。', notes: ['类目和用途优先', '需要时允许真实用户或照护者', '产品仍是视觉焦点'] },
  { type: 'lifestyle', index: 2, title: '补充场景图', goal: '用不同的使用方式、关键动作、前后变化或可证实的收益补充购买理由。', notes: ['与其他图片明确分工', '可用分区或轻量拼图', '不为丰富而堆叠'] },
]

const DEFAULT_PROMPTS: Record<string, string> = {
  'main-white': '为亚马逊商品详情页生成一张白底主图，聚焦商品本体，纯白背景，主体完整清晰、边缘干净、真实质感，构图适合电商展示，强调专业棚拍与高点击率，避免文字、水印、Logo、价格标签和无关道具。图片内不得出现中文；如需文字，只能使用准确简短英文，无法保证英文准确时不要放文字。',
  'lifestyle-1': '为亚马逊商品详情页生成一张以购买理由为中心的真实使用场景图：先让用户看懂产品适合谁、解决什么问题，再用一个自然、有情绪、有生活感的场景把这个结果表现出来。产品仍是视觉主角；如果商品的真实使用对象需要出现在画面中，可以自然加入相应的用户、婴儿、儿童或照护者，不要把人物默认设为禁用。如需出现任何文字，必须使用英文。',
  'lifestyle-2': '为亚马逊商品详情页生成一张与其他图片有明确分工的场景/利益图，展示另一个真实使用方式、关键动作、前后变化或能被商品事实支持的使用收益。如果商品确实有多种功能或多个典型场景，可以采用 2-4 格的受控拼图、分区或连续动作画面，在同一个购买问题下增加信息密度；保持统一产品外观、清晰主次和移动端可读性，不要为了丰富而堆叠无关内容。如需出现任何文字，必须使用英文。',
  'infographic-1': '为亚马逊商品详情页生成卖点图一，聚焦 1-2 个最核心的功能、材质或差异化优势，信息量不要过密，版式清晰利落；图片内不得出现中文，如需标题或说明，只能使用准确简短英文，无法保证英文准确时不要放文字。',
  'infographic-2': '为亚马逊商品详情页生成卖点图二，补充另一组卖点、功能价值或使用收益，与第一张形成明确分工，不要重复堆砌同一信息，版式清楚易读；图片内不得出现中文，如需说明，只能使用准确简短英文，无法保证英文准确时不要放文字。',
  'detail': '为亚马逊商品详情页生成一张细节特写图，突出产品材质、纹理、做工或关键结构，强调真实微距质感、清晰边缘和高级光线，让用户直观感受品质。提示词可以用中文，但如果图片内出现文字，必须为英文。',
  'size': '为亚马逊商品详情页生成一张尺寸认知图，重点让用户快速理解产品大小、比例和摆放关系，可借助自然参照物表达尺寸，视觉清楚可信，比例准确不做过度夸张。图片内不得出现中文；尺寸标注或说明只能使用准确简短英文，无法保证英文准确时不要放文字。',
}

const APLUS_HERO_PLAN: RecommendedImagePlanItem = {
  type: 'aplus-hero',
  index: 1,
  title: 'A+ 模块一 / Hero',
  goal: '页面头部主视觉区，建立产品认知、品牌感和核心使用场景，像完整 A+ 页面的第一屏切片。',
  notes: ['适合横版模块布局', '产品必须是视觉主角', '图中文字必须为英文', '负责建立统一视觉基调'],
}

const APLUS_TRANSFORM_PLAN: RecommendedImagePlanItem = {
  type: 'aplus-transform',
  index: 2,
  title: 'A+ 模块二 / Transform',
  goal: '页面中部承接区，优先表现产品如何展开、如何使用或为什么方便，像整页里的机制讲解切片。',
  notes: ['延续第一张色调与场景语境', '适合形态变化或关键使用方式', '图中文字必须为英文', '信息层次清晰但不过度拥挤'],
}

const APLUS_GRID_PLAN: RecommendedImagePlanItem = {
  type: 'aplus-grid',
  index: 3,
  title: 'A+ 模块三 / Feature Grid',
  goal: '页面卖点信息区，优先承载功能优势、结构亮点、材质细节或卡片式卖点信息。',
  notes: ['适合卖点卡片、局部特写或功能分区', '延续前两张的视觉语言', '图中文字必须为英文', '不要像独立广告海报'],
}

const APLUS_LIFESTYLE_PLAN: RecommendedImagePlanItem = {
  type: 'aplus-lifestyle',
  index: 4,
  title: 'A+ 模块四 / Lifestyle + Specs',
  goal: '页面收束区，优先承载适用场景、参数、材质或安心感信息，像整页底部的场景与规格切片。',
  notes: ['可放场景延展、规格信息或材质收束', '延续全页语境', '图中文字必须为英文', '不应像新的主视觉图'],
}

const APLUS_DEFAULT_PROMPTS: Record<
  'aplus-hero' | 'aplus-transform' | 'aplus-grid' | 'aplus-lifestyle' | 'aplus-feature' | 'aplus-detail' | 'aplus-main',
  string
> = {
  'aplus-hero': '为亚马逊普通 A+ 页面生成第一张横版模块图，作为整页顶部 hero 切片。画面要像成熟 A+ 页面的第一屏，用清晰的核心利益、自然留白、可信的生活方式场景和有情绪的光线建立产品认知。产品与参考图保持一致，产品是视觉主角；如果商品的真实使用对象需要出现在场景中，可以自然加入相应用户、婴儿、儿童或照护者，不要把人物默认设为禁用。整体干净、有高级感，不要做成白底主图或夸张海报。',
  'aplus-transform': '为亚马逊普通 A+ 页面生成第二张横版模块图，作为整页中段的机制讲解切片。延续第一页的色调和空间语境，更自然地表现产品如何展开、如何使用或为什么方便，可以带简洁英文说明、步骤感或形态变化，但不要做成说明书式拼贴。',
  'aplus-grid': '为亚马逊普通 A+ 页面生成第三张横版模块图，作为整页卖点信息区切片。延续前两张的视觉气质，用更有层级的方式承载功能优势、结构亮点、材质细节或局部特写，可以有卡片、分区或局部放大，但整体仍然像成熟 A+ 页面，而不是独立卖货海报。',
  'aplus-lifestyle': '为亚马逊普通 A+ 页面生成第四张横版模块图，作为整页底部的场景与信息收束切片。延续前面的色调与品牌感，自然呈现适用场景、使用结果、安心感、参数或材质信息，让整套 A+ 页面完整收束；如果商品的真实使用对象需要出现在场景中，可以自然加入相应用户、婴儿、儿童或照护者。画面可包含简洁英文信息区，但不应重新变成新的主视觉图。',
  'aplus-feature': '为亚马逊普通 A+ 页面生成一张横版卖点模块图，延续整页语境，自然表现核心卖点、结构亮点或使用收益。',
  'aplus-detail': '为亚马逊普通 A+ 页面生成一张横版细节模块图，延续整页语境，重点表现材质、做工、局部结构或补充场景。',
  'aplus-main': '为亚马逊普通 A+ 页面生成一张横版模块图，产品与参考图保持一致，产品是视觉主角，整体感觉自然、干净、有品牌感，可带少量英文信息区，但不要做成 listing 白底主图。',
}

async function requestJsonChatCompletion(
  content: any[],
  maxTokens: number,
  operationContext?: TextOperationContext,
): Promise<string> {
  return requestTextJsonCompletion(content, maxTokens, operationContext)
}

function parseModelJsonResponse(responseText: string, preferredKeys: string[] = []): any {
  const directText = responseText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  let directError: unknown

  try {
    const parsed = JSON.parse(directText)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch (error) {
    directError = error
  }

  const candidates: Array<Record<string, unknown>> = []
  for (let start = 0; start < directText.length; start += 1) {
    if (directText[start] !== '{') continue

    let depth = 0
    let inString = false
    let escaped = false
    for (let index = start; index < directText.length; index += 1) {
      const character = directText[index]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (character === '\\') {
          escaped = true
        } else if (character === '"') {
          inString = false
        }
        continue
      }

      if (character === '"') {
        inString = true
      } else if (character === '{') {
        depth += 1
      } else if (character === '}') {
        depth -= 1
        if (depth === 0) {
          try {
            const parsed = JSON.parse(directText.slice(start, index + 1))
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              candidates.push(parsed as Record<string, unknown>)
            }
          } catch {
            // Continue scanning in case the provider returned another valid object later.
          }
          break
        }
      }
    }
  }

  const preferred = candidates.find((candidate) => preferredKeys.some((key) => key in candidate))
  if (preferred) {
    console.warn('[text-model] json:recovered', {
      responseLength: responseText.length,
      candidateCount: candidates.length,
      preferredKeys,
    })
    return preferred
  }

  if (candidates[0]) {
    console.warn('[text-model] json:recovered', {
      responseLength: responseText.length,
      candidateCount: candidates.length,
      preferredKeys,
    })
    return candidates[0]
  }

  throw directError instanceof Error ? directError : new SyntaxError('模型返回内容不是有效 JSON')
}

export async function analyzeProduct(input: AnalyzeProductInput): Promise<AnalyzeProductOutput> {
  const {
    productName,
    description,
    additionalRequirements = '',
    category = 'General',
    targetAudience = 'General consumers',
    referenceImages = [],
    operationId,
    sourcePage = 'amazon',
    entryPoint = '/api/analyze/stream',
    onTextModelStatus,
  } = input

  const content: any[] = [
    {
      type: 'text',
      text: `你是资深的亚马逊商品图片策划顾问，擅长把商品分析、Amazon 图片合规要求、以及 AI 生图提示词结合起来。

请基于下面商品信息，输出"更智能、更丰富、可直接用于生成 Amazon 图片"的中文分析。你的目标：
0. 先看参考图里到底出现了什么，再基于图文一起判断。
1. 给出适合亚马逊主图和辅图的完整图片规划。
2. 明确哪些点必须遵守 Amazon 规范，哪些点可以作为创意发挥空间。
3. 如果参考图不足以支撑高质量生图，要明确建议用户补充什么参考图。

商品名称：${productName}
商品描述：${description}
用户补充要求：${additionalRequirements || '无'}
商品类目：${category}
目标人群：${targetAudience}
参考图数量：${referenceImages.length}

请严格输出 JSON，字段如下：
- productSummary: 2-4 句中文总结，说明产品定位、适合怎样的视觉表达、做图重点。
- sellingPoints: 4-6 条中文卖点，适合被视觉化表达。
- referenceImageObservations: 数组。按参考图顺序输出。每个对象包含：
  - imageIndex: 从 1 开始
  - observations: 3-6 条中文观察，描述这张图里实际看到了什么，例如角度、材质、颜色、结构、配件、包装、使用环境、是否有人物、画面问题等。
- referenceImageSummary: 2-4 句中文总结，说明这些参考图整体提供了哪些有效信息，还缺哪些关键视觉信息。
- amazonImageGuidelines: 5-8 条中文规范摘要，重点包含主图/辅图差异。
- complianceChecklist: 5-8 条中文检查项，便于生成后人工复核。
- imageContentSuggestions: 6-10 条中文建议，写适合出现在图片里的内容方向。
- visualStyleRecommendations: 4-6 条中文风格建议。
- visualSystemGuidance: 4-6 条中文建议，专门说明整组图片如何保持统一视觉系统，例如字体气质、配色、版式节奏、图标语言、场景后期质感应如何统一，特别是卖点图和场景图要像同一套 listing 资产。
- promptingPrinciples: 4-6 条中文提示词原则，强调"写明是亚马逊商品图，图片内文字必须是英文"。
- referenceImageAdvice: 对象，包含：
  - needMoreReferences: boolean
  - reason: 中文说明
  - recommendedShots: 3-6 条中文建议，说明还缺什么参考图

请注意：你只需要输出上述基础分析内容，不要包含具体的图片类型规划或提示词，这些将后续单独生成。`
    },
  ]

  for (const image of referenceImages.slice(0, AMAZON_REFERENCE_IMAGE_LIMIT).reverse()) {
    content.unshift({
      type: 'image_url',
      image_url: {
        url: `data:${image.mediaType};base64,${image.data}`,
      },
    })
  }

  const responseText = await requestJsonChatCompletion(content, 2048, {
    operationId,
    sourcePage,
    entryPoint,
    onStatus: onTextModelStatus,
  })

  try {
    const parsed = parseModelJsonResponse(responseText, ['productSummary', 'sellingPoints'])
    return {
      productSummary: parsed.productSummary || `${productName} 适合围绕核心卖点做亚马逊主图与辅图规划。`,
      sellingPoints: parsed.sellingPoints || ['核心卖点待补充'],
      referenceImageObservations: parsed.referenceImageObservations || [],
      referenceImageSummary:
        parsed.referenceImageSummary ||
        (referenceImages.length
          ? '当前参考图提供了一部分商品外观信息，但仍建议结合更多角度和细节图提升分析稳定性。'
          : '当前没有参考图，分析主要依据文字信息。'),
      amazonImageGuidelines: parsed.amazonImageGuidelines || [
        '主图应突出商品本体并保持纯白背景。',
        '主图避免文字、水印、Logo 和无关道具。',
        '辅图可用于场景、功能、细节和尺寸表达。',
        '图片内不得出现中文、中文字符或中文标点；如需文字，只能使用准确简短的英文，无法保证英文准确时不要放文字。',
      ],
      complianceChecklist: parsed.complianceChecklist || [
        '主图是否纯白背景且只展示售卖主体',
        '商品主体是否完整清晰且占画面足够面积',
        '是否存在文字、水印、边框或误导性内容',
        '辅图文字是否为英文',
      ],
      imageContentSuggestions: parsed.imageContentSuggestions || [
        '产品标准展示角度',
        '产品真实使用场景',
        '材质与工艺特写',
        '尺寸或比例参考',
      ],
      visualStyleRecommendations: parsed.visualStyleRecommendations || [
        '专业电商棚拍质感',
        '真实可信的材质表现',
        '重点突出产品而非背景',
      ],
      visualSystemGuidance: parsed.visualSystemGuidance || [
        '整组图片保持统一的品牌级电商视觉语境，不要每张图像来自不同店铺。',
        '卖点图尽量统一字体气质、主辅色和信息层级，形成一套版式系统。',
        '场景图尽量统一光线、色温、后期质感和道具审美，像同一次拍摄或同一套 campaign。',
        '若使用图标、标注框或信息卡片，整组图中保持同一种设计语言。',
      ],
      promptingPrinciples: parsed.promptingPrinciples || [
        '提示词中写明亚马逊商品图用途',
        '图片内文字必须为英文',
        '主图强调合规，辅图强调卖点表达',
        '给足方向，但不要锁死具体构图',
      ],
      generationConstraints: parsed.generationConstraints || [
        '产品外观、结构、颜色、数量和配件必须以文字和参考图为准。',
        '不能虚构参数、认证、测试结果、功能、效果和兼容性。',
        '主图使用纯白背景且不添加文字、价格或促销元素。',
        '副图文字必须使用简短自然的英文。',
      ],
      referenceImageAdvice: parsed.referenceImageAdvice || {
        needMoreReferences: referenceImages.length === 0,
        reason: referenceImages.length === 0 ? '当前没有参考图，模型对产品外观和细节的理解会偏弱。' : '现有参考图可以作为基础，但更多角度会提高稳定性。',
        recommendedShots: ['正面图', '45 度图', '细节近景图'],
      },
      canGeneratePrompts: true,
    }
  } catch {
    return {
      productSummary: `${productName} 面向 ${targetAudience}，建议围绕亚马逊主图合规、场景化表达、材质细节和尺寸认知来做整套图片。生成时需要明确是 Amazon listing image，图片内文字必须为英文，不要把构图写得过死。`,
      sellingPoints: ['突出核心功能', '强调材质与做工', '建立使用场景', '降低尺寸误判'],
      referenceImageObservations: referenceImages.length
        ? referenceImages.map((_, index) => ({
            imageIndex: index + 1,
            observations: ['已收到参考图，建议结合更多角度、细节或包装图来提高分析质量。'],
          }))
        : [],
      referenceImageSummary: referenceImages.length
        ? '当前参考图已参与分析，但参考信息仍偏有限，建议补充更多商品角度与细节。'
        : '当前没有参考图，分析主要依据文字信息。',
      amazonImageGuidelines: [
        '主图应为纯白背景，只展示售卖商品主体。',
        '主图避免文字、Logo、水印、边框和无关道具。',
        '主图应清晰、真实、专业，商品主体尽量充满画面。',
        '辅图可以展示场景、尺寸、细节、功能信息。',
        '所有图片都要和实际售卖内容一致，避免误导。',
        '图片内不得出现中文、中文字符或中文标点；如需文字，只能使用准确简短的英文，无法保证英文准确时不要放文字。',
      ],
      complianceChecklist: [
        '主图是否为纯白背景',
        '主图是否只有售卖主体',
        '是否出现文字、水印、Logo 或价格标签',
        '商品边缘是否干净清晰',
        '辅图是否和实际商品一致',
        '图片内文字是否为英文',
      ],
      imageContentSuggestions: [
        '标准白底主图',
        '真实使用场景',
        '核心卖点强化画面',
        '材质与工艺特写',
        '尺寸参照画面',
      ],
      visualStyleRecommendations: [
        '整体保持亚马逊电商图语境',
        '优先真实可信，不要过度艺术化',
        '让商品始终是视觉主角',
        '光线和色彩服务于产品卖点',
      ],
      visualSystemGuidance: [
        '整组图片要像同一套 Amazon listing 资产，避免每张图风格割裂。',
        '卖点图统一字体气质、主辅色、标注样式和信息模块节奏。',
        '场景图统一色温、光线倾向、后期质感和生活方式审美。',
        '如果出现图标、数字标签或信息框，整组图使用同一种视觉语言。',
      ],
      promptingPrinciples: [
        '要在提示词里明确这是亚马逊商品图',
        '图片内文字必须为英文',
        '主图重合规，辅图重转化表达',
        '不要把镜头、道具、场景写得太死',
      ],
      generationConstraints: [
        '产品外观、结构、颜色、数量和配件必须以文字和参考图为准。',
        '不能虚构参数、认证、测试结果、功能、效果和兼容性。',
        '主图使用纯白背景且不添加文字、价格或促销元素。',
        '副图文字必须使用简短自然的英文。',
      ],
      referenceImageAdvice: {
        needMoreReferences: referenceImages.length < 2,
        reason:
          referenceImages.length < 2
            ? '当前参考图偏少，模型容易在结构、比例和材质细节上发挥过头。'
            : '参考图基础尚可，如需更稳的细节一致性，建议补充更多角度。',
        recommendedShots: ['产品正面标准图', '45 度展示图', '材质/接口/结构近景图'],
      },
      canGeneratePrompts: true,
    }
  }
}

function buildAnalysisSummaryForPromptGeneration(result: AnalyzeProductOutput): string {
  if (result.analysisStages?.length) {
    return result.analysisStages
      .map((stage) => [
        `【${stage.title}】`,
        stage.summary,
        stage.points.length ? `要点：${stage.points.join('；')}` : '',
        stage.cautions.length ? `注意：${stage.cautions.join('；')}` : '',
      ].filter(Boolean).join('\n'))
      .join('\n\n')
  }

  return [
    `产品总结：${result.productSummary}`,
    result.sellingPoints.length ? `核心卖点：${result.sellingPoints.join('；')}` : '',
    `参考图总结：${result.referenceImageSummary}`,
    result.amazonImageGuidelines.length ? `Amazon 图片规范：${result.amazonImageGuidelines.join('；')}` : '',
    result.imageContentSuggestions.length ? `建议图片内容：${result.imageContentSuggestions.join('；')}` : '',
    result.visualStyleRecommendations.length ? `视觉风格建议：${result.visualStyleRecommendations.join('；')}` : '',
    result.visualSystemGuidance.length ? `整组视觉系统建议：${result.visualSystemGuidance.join('；')}` : '',
    result.promptingPrinciples.length ? `提示词原则：${result.promptingPrinciples.join('；')}` : '',
    result.generationConstraints?.length ? `生成限制：${result.generationConstraints.join('；')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export { buildAnalysisSummaryForPromptGeneration, buildAPlusAnalysisSummary }

function buildAPlusAnalysisSummary(result: AnalyzeProductOutput): string {
  if (result.analysisStages?.length) {
    return result.analysisStages
      .map((stage) => [
        `【${stage.title}】`,
        stage.summary,
        stage.points.length ? `要点：${stage.points.join('；')}` : '',
        stage.cautions.length ? `注意：${stage.cautions.join('；')}` : '',
      ].filter(Boolean).join('\n'))
      .join('\n\n')
  }

  const stageSummary = result.analysisStages?.map((stage) =>
    `【${stage.title}】${stage.summary}${stage.points.length ? ` 要点：${stage.points.join('；')}` : ''}${stage.cautions.length ? ` 注意：${stage.cautions.join('；')}` : ''}`,
  ).join('\n') || ''

  return [
    `产品总结：${result.productSummary}`,
    result.sellingPoints.length ? `核心卖点：${result.sellingPoints.join('；')}` : '',
    `参考图总结：${result.referenceImageSummary}`,
    result.visualStyleRecommendations.length ? `视觉风格建议：${result.visualStyleRecommendations.join('；')}` : '',
    result.visualSystemGuidance.length ? `视觉系统建议：${result.visualSystemGuidance.join('；')}` : '',
    stageSummary ? `前置分析模块：\n${stageSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

const IMAGE_TYPE_CONFIG: Record<string, { name: string; goal: string; notes: string[] }> = {
  'main-white': { name: '白底主图', goal: '用于搜索结果和详情页首图，优先确保合规与点击率。', notes: ['纯白背景', '只展示售卖主体', '主体占画面约 85% 或以上', '图片内不得出现中文'] },
  'lifestyle-1': { name: '场景图一', goal: '用一个有情绪和生活感的真实场景，把产品最强购买理由与使用结果讲清楚。', notes: ['类目和用途优先', '需要时允许真实用户/照护者', '产品仍是视觉焦点'] },
  'lifestyle-2': { name: '场景图二', goal: '用不同的使用方式、关键动作、前后变化或可证实的收益补充购买理由。', notes: ['与其他图片明确分工', '可用分区或轻量拼图', '不为丰富而堆叠'] },
  'infographic-1': { name: '卖点图一', goal: '拆出第一张卖点图，聚焦 1-2 个最核心的功能、材质或差异化优势，信息不宜过密。', notes: ['聚焦最强卖点', '图片内不得出现中文，文字只能为英文', '信息量克制', '适合信息图排版'] },
  'infographic-2': { name: '卖点图二', goal: '拆出第二张卖点图，补充另一组卖点、功能或使用价值，避免把所有信息塞进同一张。', notes: ['承接但不重复第一张', '图片内不得出现中文，文字只能为英文', '信息量克制', '视觉层次分明'] },
  'detail': { name: '细节图', goal: '放大材质、工艺、触感或关键结构，增强品质感。', notes: ['近景特写', '突出纹理或做工', '保留真实材质表现'] },
  'size': { name: '尺寸图', goal: '帮助用户快速建立尺寸认知，降低购买误判。', notes: ['与常见物体对比', '尺寸表达清楚', '避免误导性比例', '图片内不得出现中文，尺寸标注只能为英文'] },
}

const PROMPT_INSTRUCTIONS: Record<string, string> = {
  'main-white': '生成一张白底主图，聚焦商品本体，纯白背景，主体完整清晰、边缘干净、真实质感，构图适合电商展示，强调专业棚拍与高点击率，避免文字、水印、Logo、价格标签和无关道具。图片内不得出现中文；如需任何文字，只能使用准确简短英文，无法保证英文准确时不要放文字。',
  'lifestyle-1': '生成一张以购买理由为中心的真实使用场景图：先让用户看懂产品适合谁、解决什么问题，再用一个自然、有情绪、有生活感的场景把这个结果表现出来。产品仍是视觉主角；如果商品的真实使用对象需要出现在画面中，可以自然加入相应的用户、婴儿、儿童或照护者，不要把人物默认设为禁用。如需出现任何文字，必须使用英文。',
  'lifestyle-2': '生成一张与其他图片有明确分工的场景/利益图，展示另一个真实使用方式、关键动作、前后变化或能被商品事实支持的使用收益。如果商品确实有多种功能或多个典型场景，可以采用 2-4 格的受控拼图、分区或连续动作画面，在同一个购买问题下增加信息密度；保持统一产品外观、清晰主次和移动端可读性，不要为了丰富而堆叠无关内容。如需出现任何文字，必须使用英文。',
  'infographic-1': '生成卖点图一，聚焦 1-2 个最核心的功能、材质或差异化优势，信息量不要过密，版式清晰利落，标题和说明文字必须为英文，整体风格适合高质量亚马逊电商展示。',
  'infographic-2': '生成卖点图二，补充另一组卖点、功能价值或使用收益，与第一张形成明确分工，不要重复堆砌同一信息，文字说明必须为英文，版式清楚易读。',
  'detail': '生成一张细节特写图，突出产品材质、纹理、做工或关键结构，强调真实微距质感、清晰边缘和高级光线，让用户直观感受品质。提示词可以用中文，但图片内不得出现中文；如需文字，只能使用准确简短英文，无法保证英文准确时不要放文字。',
  'size': '生成一张尺寸认知图，重点让用户快速理解产品大小、比例和摆放关系，可借助自然参照物表达尺寸，视觉清楚可信，比例准确不做过度夸张。图片内不得出现中文；尺寸标注或说明只能使用准确简短英文，无法保证英文准确时不要放文字。',
}

async function generateSinglePrompt(
  promptKey: string,
  productName: string,
  description: string,
  category: string,
  targetAudience: string,
  referenceImages: Array<{ data: string; mediaType: string }> = [],
  analysisSummary = '',
  priorPromptContext?: string,
  _operationId?: string,
): Promise<{ plan: RecommendedImagePlanItem; prompt: string }> {
  const config = IMAGE_TYPE_CONFIG[promptKey]

  const contextText = `商品名称：${productName}
商品描述：${description}
商品类目：${category}
目标人群：${targetAudience}
参考图数量：${referenceImages.length}
图片类型：${config.name}`

  const content: any[] = [
    {
      type: 'text',
      text: `你是资深的亚马逊商品图片策划顾问，擅长撰写 AI 生图提示词。

请为以下商品生成"${config.name}"的亚马逊图片提示词。

${contextText}

要求：
- 中文提示词，80-180 字
- 明确这是亚马逊商品图（Amazon listing image）
- 提示词正文可以是中文，但图片内不得出现中文、中文字符或中文标点；如需标题、说明、尺寸标注或其他文案，只能使用准确简短英文，无法保证英文准确时不要放文字
- 不要把镜头、角度、场景、道具限制得过死
- 语气像专业图片策划，不要像僵硬的参数堆砌
- 重点告诉 AI 你想要什么效果和感觉
- 白底主图 1 张、尺寸图 1 张、细节图 1 张、卖点图 2 张、场景图 2 张；当前只生成其中一张，要体现它在整套图里的职责
- 这张图必须与整套 Amazon listing image 保持统一视觉系统，尤其卖点图和场景图要统一字体气质、配色逻辑、版式语言、图标风格和后期质感，不能像来自两套模板
- 卖点图不要把信息塞得过满，允许拆成两张图分担信息
- 场景图一优先用有情绪的真实场景讲清最强购买理由和使用结果；场景图二优先展示不同的使用方式、关键动作、前后变化或第二场景，可使用轻量拼图但不为丰富而堆叠
- 如果当前生成的是卖点图二或场景图二，必须主动避开上一张已经占用的核心表达，换一个更明确的侧重点、使用语境或信息结构
- 如果当前生成的是卖点图一，应聚焦最强主卖点；卖点图二应优先从剩余卖点里选另一组重点，不要只是换说法重复第一张
- 如果当前生成的是场景图二，应与场景图一更换明确的使用重点、动作、结果或空间语境；当商品确实有多种功能或多个典型场景时，可以用 2-4 格受控拼图、分区或连续动作提高信息密度，但所有画面要围绕同一个购买问题，不能只是重复场景图一
- 如果商品的真实使用对象需要出现在场景中，可以自然加入相应用户、婴儿、儿童或照护者；人物应帮助说明尺度、动作和情绪，产品仍是视觉主角，不要虚构安全效果或其他产品事实
- 视觉统一要先服从商品类目、使用对象和核心情绪，再吸收参考图的产品颜色、材质和光线；不要只复制参考图附近的背景色，也不要改变产品本身颜色

请严格输出 JSON，字段如下：
- prompt: 生成的提示词（80-180 字中文）

只输出 JSON，不要有其他内容。`
    },
  ]

  if (analysisSummary) {
    content.push({
      type: 'text',
      text: `第一步基础分析摘要：
${analysisSummary}

生成这一步提示词时，优先继承这份分析里已经明确的卖点优先级、Amazon 规范重点、参考图缺失信息、内容分工和风格建议。不要脱离这份分析重新发明一套逻辑。`,
    })
  }

  if (priorPromptContext) {
    content.push({
      type: 'text',
      text: `避免重复参考：
上一张同组提示词是：
${priorPromptContext}

本张提示词必须和上一张形成清晰分工，不要只是在同一核心画面上换措辞。`,
    })
  }

  for (const image of referenceImages.slice(0, AMAZON_REFERENCE_IMAGE_LIMIT).reverse()) {
    content.unshift({
      type: 'image_url',
      image_url: {
        url: `data:${image.mediaType};base64,${image.data}`,
      },
    })
  }

  const responseText = await requestJsonChatCompletion(content, 800, {
    operationId: _operationId,
    sourcePage: 'amazon',
    entryPoint: '/api/analyze/prompts',
  })

  const lastHyphenIndex = promptKey.lastIndexOf('-')
  const hasIndex = lastHyphenIndex > 0 && /\d$/.test(promptKey)
  const type = hasIndex ? promptKey.slice(0, lastHyphenIndex) : promptKey
  const indexStr = hasIndex ? promptKey.slice(lastHyphenIndex + 1) : null
  const index = indexStr ? parseInt(indexStr) : 1

  const plan: RecommendedImagePlanItem = {
    type: type as AmazonImageType,
    index,
    title: config.name,
    goal: config.goal,
    notes: config.notes,
  }

  try {
    const parsed = parseModelJsonResponse(responseText, ['prompt'])
    return {
      plan,
      prompt: parsed.prompt || DEFAULT_PROMPTS[promptKey],
    }
  } catch {
    return {
      plan,
      prompt: DEFAULT_PROMPTS[promptKey],
    }
  }
}

function buildPlanForPromptKey(promptKey: string): RecommendedImagePlanItem {
  const config = IMAGE_TYPE_CONFIG[promptKey]
  const lastHyphenIndex = promptKey.lastIndexOf('-')
  const hasIndex = lastHyphenIndex > 0 && /\d$/.test(promptKey)
  const type = hasIndex ? promptKey.slice(0, lastHyphenIndex) : promptKey
  const indexStr = hasIndex ? promptKey.slice(lastHyphenIndex + 1) : null
  const index = indexStr ? parseInt(indexStr, 10) : 1

  return {
    type: type as AmazonImageType,
    index,
    title: config.name,
    goal: config.goal,
    notes: config.notes,
  }
}

async function generateSinglePromptWithFallback(
  promptKey: string,
  productName: string,
  description: string,
  category: string,
  targetAudience: string,
  referenceImages: Array<{ data: string; mediaType: string }> = [],
  analysisSummary = '',
  priorPromptContext?: string,
  _operationId?: string,
): Promise<{ plan: RecommendedImagePlanItem; prompt: string; usedFallback: boolean }> {
  try {
    const result = await generateSinglePrompt(
      promptKey,
      productName,
      description,
      category,
      targetAudience,
      referenceImages,
      analysisSummary,
      priorPromptContext,
      _operationId,
    )

    return {
      ...result,
      usedFallback: false,
    }
  } catch {
    return {
      plan: buildPlanForPromptKey(promptKey),
      prompt: DEFAULT_PROMPTS[promptKey],
      usedFallback: true,
    }
  }
}

export async function generateAPlusPrompt(
  productName: string,
  description: string,
  category: string,
  targetAudience: string,
  referenceImages: Array<{ data: string; mediaType: string }> = [],
  analysisSummary = '',
  operationId?: string,
  amazonGallery?: {
    items?: Array<{ slotId: string; title: string; visualForm: string; enabled: boolean }>
  } | null,
): Promise<GenerateAPlusPromptOutput> {
  const amazonGallerySummary = amazonGallery?.items?.filter((item) => item.enabled).map((item) =>
    `${item.slotId}｜${item.title}｜${item.visualForm}`,
  ).join('\n') || 'Amazon 图组编排信息不可用，请基于前置分析保守生成。'
  const content: any[] = [
    {
      type: 'text',
      text: `你是资深的亚马逊 A+ 页面视觉策划顾问，擅长把商品信息整理成自然、好用、不过度僵硬的 AI 生图 brief。

请为以下商品生成 4 条适用于普通 A+ 页面的图片提示词，对应 4 张连续的横版模块图。

商品名称：${productName}
商品描述：${description}
商品类目：${category}
目标人群：${targetAudience}
参考图数量：${referenceImages.length}

要求：
- 输出 4 条中文提示词，每条约 70-170 字
- 你不是在做 4 张独立海报，而是在设计一页完整的 Amazon A+ 页面；这 4 张图是这页从上到下的 4 个区段切片
- 提示词要更像自然的视觉 brief，而不是规则清单或流程说明
- 4 张图要像同一套 Amazon A+ 页面资产，保持统一的产品外观、色温、场景语境、品牌气质和版式语言
- 统一视觉时先考虑商品适合的空间、用户、生活方式和情绪，再使用参考图颜色作为锚点；允许选择协调的辅助色和背景色，不要为了“接近参考图”而牺牲类目氛围，也不要给产品染色
- Amazon 副图已经负责快速给出购买结论；A+ 不要简单重复副图的同一卖点、同一场景或同一文案，要优先解释“为什么重要、如何做到、怎么使用、在什么情况下有价值”，并补充副图放不下的高价值信息缺口
- 根据已有 Amazon 图组编排动态分配 4 个 A+ 模块职责；如果某个主题已经被副图充分表达，应换成更深一层的机制、结构、使用逻辑、场景延展或可信信息收束，不要只是换背景重讲
- 明确这是 Amazon A+ module image，不要写成 listing 主图，不要写成复杂页面编辑稿，也不要写成过度设计的广告海报
- 第一张更偏主视觉、品牌感、核心使用场景和标题区
- 第二张更偏产品如何展开、如何工作、如何使用或为什么方便
- 第三张更偏卖点卡片、结构亮点、材质细节、局部特写或功能分区
- 第四张更偏使用场景延展、参数、材质、安心感或适用信息收束
- 这里的“更偏”是方向，不要把镜头、版式、模块数量、图标样式写死
- 产品必须始终是视觉主角，允许自然地带出场景、简洁的信息区、局部特写或卖点分区
- 如果商品的真实使用对象包含婴儿、儿童、家长或照护者，可以在合适模块自然呈现人物，让人物帮助表达尺度、动作和情绪，不要把人物作为全局禁用项；不要凭空增加安全认证、承重或保护效果
- 图片内不得出现中文、中文字符或中文标点；如果出现标题、说明或标签，全部使用简短自然的英文，无法保证英文准确时不要放文字
- 语言尽量直接描述画面应该呈现的感觉，不要写太多“不要怎样”“必须怎样”

请严格输出 JSON，字段如下：
- heroPrompt: 第一张模块图提示词
- transformPrompt: 第二张模块图提示词
- gridPrompt: 第三张模块图提示词
- lifestylePrompt: 第四张模块图提示词

只输出 JSON，不要有其他内容。`,
    },
  ]

  const aplusSummary = analysisSummary
  if (aplusSummary) {
    content.push({
      type: 'text',
      text: `基础分析摘要：
${aplusSummary}

生成 A+ 提示词时，优先吸收这里已经明确的产品定位、核心卖点、参考图外观信息和视觉气质，但不要把这些摘要机械地逐条改写进提示词。`,
    })
  }

  content.push({
    type: 'text',
    text: `已经生成的 Amazon 图组编排（仅用于避免 A+ 重复并寻找补充信息）：
${amazonGallerySummary}

A+ 应该与这些副图属于同一套视觉系统，但承担更深的解释和补充职责。不要把副图 Prompt 原文机械复制到 A+ Prompt。`,
  })

  for (const image of referenceImages.slice(0, AMAZON_REFERENCE_IMAGE_LIMIT).reverse()) {
    content.unshift({
      type: 'image_url',
      image_url: {
        url: `data:${image.mediaType};base64,${image.data}`,
      },
    })
  }

  try {
    const responseText = await requestJsonChatCompletion(content, 1200, {
      operationId,
      sourcePage: 'amazon',
      entryPoint: '/api/analyze/prompts',
    })
    const parsed = parseModelJsonResponse(responseText, ['heroPrompt', 'transformPrompt', 'gridPrompt', 'lifestylePrompt'])
    const heroPrompt = typeof parsed.heroPrompt === 'string' && parsed.heroPrompt.trim()
      ? parsed.heroPrompt.trim()
      : APLUS_DEFAULT_PROMPTS['aplus-hero']
    const transformPrompt = typeof parsed.transformPrompt === 'string' && parsed.transformPrompt.trim()
      ? parsed.transformPrompt.trim()
      : APLUS_DEFAULT_PROMPTS['aplus-transform']
    const gridPrompt = typeof parsed.gridPrompt === 'string' && parsed.gridPrompt.trim()
      ? parsed.gridPrompt.trim()
      : APLUS_DEFAULT_PROMPTS['aplus-grid']
    const lifestylePrompt = typeof parsed.lifestylePrompt === 'string' && parsed.lifestylePrompt.trim()
      ? parsed.lifestylePrompt.trim()
      : APLUS_DEFAULT_PROMPTS['aplus-lifestyle']

    return {
      recommendedImagePlan: [APLUS_HERO_PLAN, APLUS_TRANSFORM_PLAN, APLUS_GRID_PLAN, APLUS_LIFESTYLE_PLAN],
      suggestedPrompts: {
        'aplus-hero': heroPrompt,
        'aplus-transform': transformPrompt,
        'aplus-grid': gridPrompt,
        'aplus-lifestyle': lifestylePrompt,
      },
      imageSpec: {
        size: '1536x960',
      },
    }
  } catch {
    return {
      recommendedImagePlan: [APLUS_HERO_PLAN, APLUS_TRANSFORM_PLAN, APLUS_GRID_PLAN, APLUS_LIFESTYLE_PLAN],
      suggestedPrompts: {
        'aplus-hero': APLUS_DEFAULT_PROMPTS['aplus-hero'],
        'aplus-transform': APLUS_DEFAULT_PROMPTS['aplus-transform'],
        'aplus-grid': APLUS_DEFAULT_PROMPTS['aplus-grid'],
        'aplus-lifestyle': APLUS_DEFAULT_PROMPTS['aplus-lifestyle'],
      },
      imageSpec: {
        size: '1536x960',
      },
    }
  }
}

async function generatePromptsWithProgress(
  productName: string,
  description: string,
  category: string,
  targetAudience: string,
  referenceImages: Array<{ data: string; mediaType: string }> = [],
  analysisSummary = '',
  onProgress?: (progress: PromptGenerationProgress) => void | Promise<void>,
  _operationId?: string,
): Promise<GeneratePromptsOutput> {
  const total = 7
  let completed = 0
  const suggestedPrompts: Record<string, string> = {}
  const recommendedImagePlan: RecommendedImagePlanItem[] = []
  const promptContextByKey: Record<string, string> = {}

  const emitProgress = async (
    key: string,
    plan: RecommendedImagePlanItem,
    prompt: string,
    usedFallback: boolean,
  ) => {
    suggestedPrompts[key] = prompt
    recommendedImagePlan.push(plan)
    promptContextByKey[key] = prompt
    completed += 1

    await onProgress?.({
      key,
      plan,
      prompt,
      completed,
      total,
      usedFallback,
    })
  }

  const runBatch = async (keys: string[]) => {
    const batchResults = await Promise.all(
      keys.map(async (key) => {
        const priorPromptContext =
          key === 'infographic-2'
            ? promptContextByKey['infographic-1'] || ''
            : key === 'lifestyle-2'
              ? promptContextByKey['lifestyle-1'] || ''
              : ''

        const result = await generateSinglePromptWithFallback(
          key,
          productName,
          description,
          category,
          targetAudience,
          referenceImages,
          analysisSummary,
          priorPromptContext,
          _operationId,
        )

        return { key, ...result }
      }),
    )

    for (const result of batchResults) {
      await emitProgress(result.key, result.plan, result.prompt, result.usedFallback)
    }
  }

  await runBatch(['main-white', 'size', 'detail', 'infographic-1', 'lifestyle-1'])
  await runBatch(['infographic-2', 'lifestyle-2'])

  return {
    recommendedImagePlan,
    suggestedPrompts,
  }
}

type AdaptiveGallerySlotId =
  | 'main-white'
  | 'secondary-1'
  | 'secondary-2'
  | 'secondary-3'
  | 'secondary-4'
  | 'secondary-5'
  | 'secondary-6'
  | 'secondary-7'
  | 'secondary-8'

interface AdaptiveGalleryItem {
  slotId: AdaptiveGallerySlotId
  title: string
  visualForm: string
  prompt: string
  displayPrompt: string
  size: string
  enabled: boolean
}

const ADAPTIVE_SECONDARY_SLOTS: AdaptiveGallerySlotId[] = [
  'secondary-1',
  'secondary-2',
  'secondary-3',
  'secondary-4',
  'secondary-5',
  'secondary-6',
  'secondary-7',
  'secondary-8',
]

const ADAPTIVE_FALLBACK_ITEMS: AdaptiveGalleryItem[] = [
  {
    slotId: 'main-white',
    title: '白底主图',
    visualForm: 'white-background-product-shot',
    prompt: '为 Amazon listing 生成白底主图，只展示参考图中真实存在的售卖主体，纯白背景，商品完整清晰、比例自然、边缘干净，保留真实颜色、结构、数量和配件，不添加文字、人物、道具、价格、促销标签、水印或虚构功能。',
    displayPrompt: '生成一张 Amazon 商品详情页白底主图，只展示参考图中真实存在的商品主体。使用纯白背景，商品完整清晰、比例自然、边缘干净，保留真实颜色、结构、数量和配件。不添加文字、人物、道具、价格、促销标签、水印或虚构功能。',
    size: AMAZON_DEFAULT_RENDER_SIZE,
    enabled: true,
  },
  {
    slotId: 'secondary-1',
    title: '核心利益与使用场景',
    visualForm: 'benefit-led-lifestyle',
    prompt: '为 Amazon listing 生成一张有生活感、真实可信的核心利益与使用场景图：先让用户看懂产品适合谁、解决什么问题，再用一个自然的场景和明确的使用动作表现这个结果。产品必须保持参考图中的外观、颜色、结构和数量，并且是清晰的视觉主角；如果商品的真实使用对象需要出现在画面中，可以自然加入相应的用户、婴儿、儿童或照护者，让人物帮助说明尺度、动作和情绪，不要把人物默认设为禁用。不得虚构功能、配件、参数或安全效果；图片内不得出现中文，如需文字只能使用简短准确英文，无法保证英文准确时不要放文字。',
    displayPrompt: '生成一张有生活感、真实可信的 Amazon 商品核心利益与使用场景图：先让用户看懂产品适合谁、解决什么问题，再用一个自然的场景和明确的使用动作表现这个结果。产品必须保持参考图中的外观、颜色、结构和数量，并且是清晰的视觉主角。如果商品的真实使用对象需要出现在画面中，可以自然加入相应的用户、婴儿、儿童或照护者，让人物帮助说明尺度、动作和情绪，不要把人物默认设为禁用。不得虚构功能、配件、参数或安全效果；图片内不得出现中文，如需文字只能使用简短准确英文，无法保证英文准确时不要放文字。',
    size: AMAZON_DEFAULT_RENDER_SIZE,
    enabled: true,
  },
  {
    slotId: 'secondary-2',
    title: '关键细节',
    visualForm: 'detail-close-up',
    prompt: '为 Amazon listing 生成一张产品细节展示图，突出参考图中可以确认的材质、纹理、做工或结构，保持产品真实比例和外观，不虚构接口、按钮、材料或性能，画面清晰克制，图片内不得出现中文，如需文字只使用简短准确英文。',
    displayPrompt: '生成一张 Amazon 商品细节展示图，突出参考图中可以确认的材质、纹理、做工或结构。保持产品真实比例和外观，不虚构接口、按钮、材料或性能，画面清晰克制；图片内不得出现中文，如需文字只使用简短准确英文。',
    size: AMAZON_DEFAULT_RENDER_SIZE,
    enabled: true,
  },
  {
    slotId: 'secondary-3',
    title: '尺寸与比例',
    visualForm: 'size-context',
    prompt: '为 Amazon listing 生成一张尺寸与比例认知图，只使用已知或可从参考图确认的尺寸信息；如果没有精确尺寸，不要添加数字标注，改用自然且保守的摆放关系帮助理解大小，避免误导性比例，图片内不得出现中文，如需文字只使用简短准确英文。',
    displayPrompt: '生成一张 Amazon 商品尺寸与比例认知图，只使用已知或能从参考图确认的尺寸信息。如果没有精确尺寸，不要添加数字标注，改用自然、保守的摆放关系帮助理解大小，避免误导性比例；图片内不得出现中文，如需文字只使用简短准确英文。',
    size: AMAZON_DEFAULT_RENDER_SIZE,
    enabled: true,
  },
  {
    slotId: 'secondary-4',
    title: '功能卖点',
    visualForm: 'feature-infographic',
    prompt: '为 Amazon listing 生成一张克制清晰的功能利益图：把商品描述或参考图能够支持的一个核心功能翻译成用户能感知的使用结果，最多保留两个辅助信息。产品仍是视觉中心，信息留白充足，不添加未经证实的参数、认证、效果或兼容性，图片内不得出现中文，如需文字只使用简短准确英文。',
    displayPrompt: '生成一张克制清晰的 Amazon 商品功能利益图：把商品描述或参考图能够支持的一个核心功能翻译成用户能感知的使用结果，最多保留两个辅助信息。产品仍是视觉中心，信息留白充足，不添加未经证实的参数、认证、效果或兼容性；图片内不得出现中文，如需文字只使用简短准确英文。',
    size: AMAZON_DEFAULT_RENDER_SIZE,
    enabled: true,
  },
  {
    slotId: 'secondary-5',
    title: '包装与配件',
    visualForm: 'package-contents',
    prompt: '为 Amazon listing 生成一张包装内容展示图，只展示参考图或商品描述中明确存在的商品、配件和包装内容，排列清楚、背景简洁，不增加未确认的配件和数量，图片内不得出现中文，如需文字只使用简短准确英文。',
    displayPrompt: '生成一张 Amazon 商品包装内容展示图，只展示参考图或商品描述中明确存在的商品、配件和包装内容。排列清楚、背景简洁，不增加未确认的配件和数量；图片内不得出现中文，如需文字只使用简短准确英文。',
    size: AMAZON_DEFAULT_RENDER_SIZE,
    enabled: false,
  },
  {
    slotId: 'secondary-6',
    title: '补充使用方式',
    visualForm: 'alternate-use',
    prompt: '为 Amazon listing 生成一张补充利益与使用方式图，展示与其他图片不同且能帮助用户理解商品的真实使用方式、关键动作、适用环境或可被事实支持的使用收益。产品保持参考图中的真实外观并且是视觉主角；如果目标用户需要出现在场景中，可以自然加入相应的用户、婴儿、儿童或照护者。画面要有明确叙事，不重复已有卖点，不虚构功能、参数或安全效果；图片内不得出现中文，如需文字只使用简短准确英文。',
    displayPrompt: '生成一张 Amazon 商品补充利益与使用方式图，展示与其他图片不同且能帮助用户理解商品的真实使用方式、关键动作、适用环境或有事实依据的使用收益。产品保持参考图中的真实外观并且是视觉主角；如果目标用户需要出现在场景中，可以自然加入相应的用户、婴儿、儿童或照护者。画面要有明确叙事，不重复已有卖点，不虚构功能、参数或安全效果；图片内不得出现中文，如需文字只使用简短准确英文。',
    size: AMAZON_DEFAULT_RENDER_SIZE,
    enabled: false,
  },
  {
    slotId: 'secondary-7',
    title: '选择与适用信息',
    visualForm: 'choice-and-fit',
    prompt: '为 Amazon listing 生成一张选择与适用信息图，只表达商品描述或参考图明确支持的变体、规格、适用环境或选择建议，帮助用户快速选对。产品保持真实外观，信息层级清晰，图片内不得出现中文，如需文字只使用简短准确英文。',
    displayPrompt: '生成一张 Amazon 商品选择与适用信息图，只表达商品描述或参考图明确支持的变体、规格、适用环境或选择建议，帮助用户快速选对。产品保持真实外观，信息层级清晰；图片内不得出现中文，如需文字只使用简短准确英文。',
    size: AMAZON_DEFAULT_RENDER_SIZE,
    enabled: false,
  },
  {
    slotId: 'secondary-8',
    title: '信任与包装收束',
    visualForm: 'trust-and-contents',
    prompt: '为 Amazon listing 生成一张信任与包装收束图，只展示参考图或商品描述明确支持的包装内容、配件、服务或品牌承诺，帮助用户完成购买前确认。画面克制真实，不添加未经证实的信息，图片内不得出现中文，如需文字只使用简短准确英文。',
    displayPrompt: '生成一张 Amazon 商品信任与包装收束图，只展示参考图或商品描述明确支持的包装内容、配件、服务或品牌承诺，帮助用户完成购买前确认。画面克制真实，不添加未经证实的信息；图片内不得出现中文，如需文字只使用简短准确英文。',
    size: AMAZON_DEFAULT_RENDER_SIZE,
    enabled: false,
  },
]

function isAdaptiveGallerySlotId(value: unknown): value is AdaptiveGallerySlotId {
  return value === 'main-white' || ADAPTIVE_SECONDARY_SLOTS.includes(value as AdaptiveGallerySlotId)
}

function adaptiveTypeFromVisualForm(visualForm: string, slotId: AdaptiveGallerySlotId): AmazonImageType {
  if (slotId === 'main-white') return 'main-white'
  if (/size|dimension|proportion/i.test(visualForm)) return 'size'
  if (/detail|close/i.test(visualForm)) return 'detail'
  if (/lifestyle|scene|use|package/i.test(visualForm)) return 'lifestyle'
  return 'infographic'
}

function productNeedsTwoLifestyleScenes(text: string) {
  return /(婴儿|宝宝|婴童|儿童|幼儿|家长|照护|旅行床|游戏围栏|推车|安全座椅|baby|infant|toddler|child|caregiver|crib|playpen|stroller|travel\s*bed)/i.test(text)
}

function productNeedsLifestyleScene(text: string) {
  return /(使用|适用|场景|旅行|户外|家庭|卧室|客厅|厨房|办公|运动|露营|清洁|收纳|照护|使用者|use|usage|scene|travel|outdoor|home|kitchen|office|sport|camping|care)/i.test(text)
}

function isLifestylePromptItem(item: AdaptiveGalleryItem) {
  return /(场景|使用|利益|生活|lifestyle|scene|use|benefit|life)/i.test(`${item.title} ${item.visualForm} ${item.prompt}`)
}

function buildAdaptiveFallbackResult(requiresTwoLifestyleScenes = false): GeneratePromptsOutput {
  const items = ADAPTIVE_FALLBACK_ITEMS.map((item) => ({
    ...item,
    enabled: item.slotId === 'secondary-6' ? requiresTwoLifestyleScenes : item.enabled,
  }))
  const suggestedPrompts = Object.fromEntries(
    items.filter((item) => item.enabled).map((item) => [item.slotId, item.prompt]),
  )
  const recommendedImagePlan = items
    .filter((item) => item.enabled)
    .map((item, index) => ({
      type: adaptiveTypeFromVisualForm(item.visualForm, item.slotId),
      index: item.slotId === 'main-white' ? 1 : index,
      title: item.title,
      goal: item.prompt,
      notes: ['每张图只承担一个清晰的购买理解任务', '产品外观必须与参考图和商品描述一致'],
    }))

  return {
    status: 'completed',
    workflowVersion: 2,
    items,
    recommendedImagePlan,
    suggestedPrompts,
  }
}

async function generateAdaptiveAmazonPrompts(
  productName: string,
  description: string,
  referenceImages: Array<{ data: string; mediaType: string }> = [],
  analysisSummary = '',
  additionalRequirements = '',
  operationId?: string,
  totalTimeoutMs?: number,
  entryPoint = '/api/analyze/prompts',
): Promise<GeneratePromptsOutput> {
  const generationStartedAt = Date.now()
  const promptContext = `${productName}\n${description}\n${additionalRequirements}\n${analysisSummary}`
  const requiresLifestyleScene = productNeedsLifestyleScene(promptContext)
  const requiresTwoLifestyleScenes = productNeedsTwoLifestyleScenes(promptContext)
  console.info('[amazon-prompt] generation:start', {
    operationId: operationId ?? null,
    referenceImageCount: Math.min(referenceImages.length, AMAZON_REFERENCE_IMAGE_LIMIT),
    productNameLength: productName.length,
    descriptionLength: description.length,
    analysisSummaryLength: analysisSummary.length,
    additionalRequirementsLength: additionalRequirements.length,
  })

  const content: any[] = [{
    type: 'text',
    text: `你是资深的亚马逊商品图片策划顾问，擅长把商品分析整理成可直接用于 AI 生图的 Amazon listing 图片 Prompt。请参考 main 流程中“主图负责点击、副图负责逐步说服”的分工，但不要机械生成固定数量，也不要把每张图都做成重复的产品照。

商品名称：${productName}
商品描述：${description}
用户补充要求：${additionalRequirements || '无'}
前置分析结果：${analysisSummary || '无'}

输出 1 张主图和 4-8 张副图。主图 slotId 必须是 main-white；副图依次使用 secondary-1 到 secondary-8。副图数量由你决定，但必须至少启用 4 张、最多启用 8 张。只有能增加新的购买信息时才启用更多副图。

先从真实信息中提炼：最值得点击的产品识别点、一个最强购买理由及其使用结果、买家最可能担心的尺寸/使用/质量/选择问题、商品适合的用户和场景，以及能够被图片证明的功能、细节和信任信息。

编排要求：
- 用买家从“愿意点击”到“理解价值、代入使用、消除疑虑、放心购买”的路径安排图片。主图负责产品识别和点击；副图优先依次覆盖最强利益点/使用结果、真实场景、痛点与解决方式、功能到利益点、细节证明、尺寸比例、变体选择或包装/信任信息。
- 只要商品存在真实可理解的使用语境，secondary-1 必须是“核心利益与使用场景图”，enabled 必须为 true；不要用纯产品摆拍或纯功能卡片替代。如果商品确实不适合真实使用场景，可以把副图重点放在尺寸、细节、结构、卖点或包装信息上。
- 如果商品的核心使用对象或购买理解依赖婴儿、儿童、家长、照护者或其他人物，secondary-6 必须是与 secondary-1 不同的“补充使用场景图”，enabled 必须为 true；例如婴儿旅行床应分别表现核心使用结果和另一种真实使用/照护场景。
- 以上是角色优先级，不是固定模板。根据商品事实和购买疑问，从中选择最有价值的 4-8 张副图；没有依据的角色不要硬做，已有信息也不要重复。
- 每张图只解决一个主要购买疑问，只保留一个核心结论和最多两个辅助信息。
- 副图可以选择 hero 利益图、真实使用场景、痛点/解决方式、功能利益图、尺寸比例、结构细节、材质工艺、包装内容、变体选择或适用限制等表达形式；当多种功能或场景共同回答一个购买问题时，可以选择 2-4 格受控拼图、分区或连续动作画面，提高信息密度。
- 每张图都要有明确的画面任务、场景叙事或信息结论，让用户知道“这张图为什么要看”，而不是只把商品放在不同颜色的背景上。
- 不得重复相同卖点，不得把同一画面换文案当成新图片。
- 商品外观、颜色、结构、配件、数量和材质必须以商品描述和参考图为准。
- 不得虚构参数、认证、测试结果、功能、效果、兼容性、配件和尺寸。
- 主图必须纯白背景、只展示售卖主体、无文字、人物、道具、价格、促销、水印和无关元素。
- 副图和 A+ 场景不设全局人物禁令：如果商品的真实使用对象或购买理解依赖婴儿、儿童、家长、照护者或其他用户，可以自然呈现相应人物。人物应符合商品的真实使用语境，帮助说明尺度、动作和情绪；产品仍需清楚可见，不要把人物当装饰，也不要凭空添加安全认证、承重或保护效果。
- 所有图片内不得出现中文、中文字符或中文标点。副图中的文字只能是简短、自然、准确的英文；没有必要时不要加文字，无法保证英文准确时不要放文字。
- 整组图片的视觉统一必须“类目与用途优先、参考图颜色作为锚点”：先根据商品适合的用户、空间、季节/生活方式和情绪选择场景气质、背景色和辅助色，再吸收参考图的真实产品色彩、材质和光线；不得为了统一而给产品染色，也不要只复制参考图附近的颜色。统一色彩角色、光线方向、材质表现、字体气质、图标风格、标题位置、留白和信息层级，但不要锁死镜头和构图。
- Prompt 先描述用户应该看到、理解和感受到的画面、动作、结果与氛围，再补充必要的真实性和 Amazon 硬限制，避免写成一串否定词清单；每个装饰元素都必须服务于购买理解。
- 拼图或分区不是默认模板：只有在多个功能、场景或动作能共同帮助用户比较和理解时才使用；控制在 2-4 个信息单元，保持一个共同购买问题、明确视觉主次、统一产品外观和足够留白。
- 用户补充要求只能影响风格、场景和表达重点，不能覆盖真实性和上述限制。

每项必须输出：slotId、title、visualForm、prompt、displayPrompt、size、enabled。prompt 是实际发送给生图模型的执行 Prompt，保持 main 风格的自然中文表达；图片内可见文字必须是准确简短英文，无法保证英文准确时不要放文字。displayPrompt 是给用户阅读和编辑的自然中文版本，必须完整保留产品事实和执行约束，不要省略或改变含义。不要输出策略解释、参考图使用建议或其他字段。普通 Amazon 图片 size 固定为 1600x1600。

只输出 JSON：{"items":[...]}。`,
  }]

  for (const image of referenceImages.slice(0, AMAZON_REFERENCE_IMAGE_LIMIT).reverse()) {
    content.unshift({
      type: 'image_url',
      image_url: { url: `data:${image.mediaType};base64,${image.data}` },
    })
  }

  try {
    const responseText = await requestJsonChatCompletion(content, 5000, {
      operationId,
      sourcePage: 'amazon',
      entryPoint,
      phase: 'amazon-prompt-generation',
      ...(totalTimeoutMs ? { totalTimeoutMs } : {}),
    })
    console.info('[amazon-prompt] generation:response', {
      operationId: operationId ?? null,
      durationMs: Date.now() - generationStartedAt,
      responseLength: responseText.length,
      startsWithJsonObject: responseText.trimStart().startsWith('{'),
      endsWithJsonObject: responseText.trimEnd().endsWith('}'),
      hasMarkdownFence: responseText.includes('```'),
    })
    const parsed = parseModelJsonResponse(responseText, ['items']) as { items?: unknown }
    if (!Array.isArray(parsed.items)) throw new Error('Adaptive gallery result is invalid')

    const rawItems: AdaptiveGalleryItem[] = parsed.items
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .filter((item) => isAdaptiveGallerySlotId(item.slotId))
      .map((item) => ({
        slotId: item.slotId as AdaptiveGallerySlotId,
        title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Amazon 商品图',
        visualForm: typeof item.visualForm === 'string' && item.visualForm.trim() ? item.visualForm.trim() : 'product-focused composition',
        prompt: typeof item.prompt === 'string' ? item.prompt.trim() : '',
        displayPrompt: typeof item.displayPrompt === 'string' && item.displayPrompt.trim()
          ? item.displayPrompt.trim()
          : (typeof item.prompt === 'string' ? item.prompt.trim() : ''),
        size: AMAZON_DEFAULT_RENDER_SIZE,
        enabled: item.slotId === 'main-white' ? true : item.enabled !== false,
      }))
      .filter((item) => item.prompt.length > 0)

    const main = rawItems.find((item) => item.slotId === 'main-white')
    const secondary = ADAPTIVE_SECONDARY_SLOTS
      .map((slotId) => rawItems.find((item) => item.slotId === slotId))
      .filter((item): item is AdaptiveGalleryItem => Boolean(item && item.enabled))

    const primaryScene = secondary.find((item) => item.slotId === 'secondary-1' && isLifestylePromptItem(item))
    const supportingScene = secondary.find((item) => item.slotId === 'secondary-6' && isLifestylePromptItem(item))

    if (!main || secondary.length < 4 || secondary.length > 8 || (requiresLifestyleScene && !primaryScene) || (requiresTwoLifestyleScenes && !supportingScene)) {
      throw new Error('Adaptive gallery count is invalid')
    }

    const items = [main, ...secondary]
    const suggestedPrompts = Object.fromEntries(items.map((item) => [item.slotId, item.prompt]))
    const recommendedImagePlan = items.map((item, index) => ({
      type: adaptiveTypeFromVisualForm(item.visualForm, item.slotId),
      index: item.slotId === 'main-white' ? 1 : index,
      title: item.title,
      goal: item.prompt,
      notes: ['每张图只承担一个清晰的购买理解任务', '产品外观必须与参考图和商品描述一致'],
    }))

    return {
      status: 'completed',
      workflowVersion: 2,
      items,
      recommendedImagePlan,
      suggestedPrompts,
    }
  } catch (error) {
    console.warn('[amazon-prompt] generation:fallback', {
      operationId: operationId ?? null,
      durationMs: Date.now() - generationStartedAt,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    return buildAdaptiveFallbackResult(requiresTwoLifestyleScenes)
  }
}

export async function generateAllPrompts(
  productName: string,
  description: string,
  category: string,
  targetAudience: string,
  referenceImages: Array<{ data: string; mediaType: string }> = [],
  analysisSummary = '',
  operationId?: string,
  additionalRequirements = '',
  totalTimeoutMs?: number,
  entryPoint = '/api/analyze/prompts',
): Promise<GeneratePromptsOutput> {
  return generateAdaptiveAmazonPrompts(
    productName,
    description,
    referenceImages,
    analysisSummary,
    additionalRequirements,
    operationId,
    totalTimeoutMs,
    entryPoint,
  )
}
