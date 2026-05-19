import OpenAI from 'openai'

export type AmazonImageType = 'main-white' | 'lifestyle' | 'infographic' | 'detail' | 'size'

export interface AnalyzeProductInput {
  productName: string
  description: string
  category: string
  targetAudience: string
  referenceImages?: Array<{
    data: string
    mediaType: string
  }>
}

export interface RecommendedImagePlanItem {
  type: AmazonImageType
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
  referenceImageAdvice: ReferenceImageAdvice
  canGeneratePrompts: boolean
}

export interface GeneratePromptsOutput {
  recommendedImagePlan: RecommendedImagePlanItem[]
  suggestedPrompts: Record<string, string>
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
  { type: 'main-white', index: 1, title: '白底主图', goal: '用于搜索结果和详情页首图，优先确保合规与点击率。', notes: ['纯白背景', '只展示售卖主体', '主体占画面约 85% 或以上', '图片内如需文字必须为英文'] },
  { type: 'size', index: 1, title: '尺寸图', goal: '帮助用户快速建立尺寸认知，降低购买误判。', notes: ['与常见物体对比', '尺寸表达清楚', '避免误导性比例', '图片中的尺寸标注或说明文字必须为英文'] },
  { type: 'detail', index: 1, title: '细节图', goal: '放大材质、工艺、触感或关键结构，增强品质感。', notes: ['近景特写', '突出纹理或做工', '保留真实材质表现'] },
  { type: 'infographic', index: 1, title: '卖点图一', goal: '拆出第一张卖点图，聚焦 1-2 个最核心的功能、材质或差异化优势，信息不宜过密。', notes: ['聚焦最强卖点', '信息量克制', '文字必须为英文', '适合信息图排版'] },
  { type: 'infographic', index: 2, title: '卖点图二', goal: '拆出第二张卖点图，补充另一组卖点、功能或使用价值，避免把所有信息塞进同一张。', notes: ['承接但不重复第一张', '信息量克制', '文字必须为英文', '视觉层次分明'] },
  { type: 'lifestyle', index: 1, title: '场景图一', goal: '呈现产品最常见的使用场景，帮助用户快速理解用途和目标人群，并对一个核心场景做更深入展示。', notes: ['允许环境和人物', '强调单一核心使用情境', '氛围服务卖点'] },
  { type: 'lifestyle', index: 2, title: '场景图二', goal: '优先用拼图或分区构图展示多个使用场景、多个使用方式或多个使用动作；若不适合多场景，也要与第一张形成明显区分。', notes: ['优先多场景拼图', '产品仍是视觉焦点', '信息丰富但不杂乱'] },
]

const DEFAULT_PROMPTS: Record<string, string> = {
  'main-white': '为亚马逊商品详情页生成一张白底主图，聚焦商品本体，纯白背景，主体完整清晰、边缘干净、真实质感，构图适合电商展示，强调专业棚拍与高点击率，避免文字、水印、Logo、价格标签和无关道具。图片内如需任何文字展示，必须使用英文。',
  'lifestyle-1': '为亚马逊商品详情页生成场景图一，聚焦一个最常见、最典型、最容易理解的核心使用场景，做更深入、更完整的单场景展示，让用户一眼明白产品怎么用、适合谁用，画面自然可信、偏高端感，产品仍是视觉主角。如需出现任何文字，必须使用英文。',
  'lifestyle-2': '为亚马逊商品详情页生成场景图二，优先采用拼图或分区构图，展示产品的多个使用场景、多个使用方式，或同一场景下的多种功能动作；若产品不适合拼图，也要切换到与场景图一明显不同的第二使用场景。整体信息更丰富但不杂乱，产品始终是视觉焦点。如需出现任何文字，必须使用英文。',
  'infographic-1': '为亚马逊商品详情页生成卖点图一，聚焦 1-2 个最核心的功能、材质或差异化优势，信息量不要过密，版式清晰利落，标题和说明文字必须为英文，整体风格适合高质量亚马逊电商展示。',
  'infographic-2': '为亚马逊商品详情页生成卖点图二，补充另一组卖点、功能价值或使用收益，与第一张形成明确分工，不要重复堆砌同一信息，文字说明必须为英文，版式清楚易读。',
  'detail': '为亚马逊商品详情页生成一张细节特写图，突出产品材质、纹理、做工或关键结构，强调真实微距质感、清晰边缘和高级光线，让用户直观感受品质。提示词可以用中文，但如果图片内出现文字，必须为英文。',
  'size': '为亚马逊商品详情页生成一张尺寸认知图，重点让用户快速理解产品大小、比例和摆放关系，可借助自然参照物表达尺寸，视觉清楚可信，比例准确不做过度夸张。图中所有尺寸标注或说明文字必须为英文。',
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.TEXT_KEY
  const baseURL = process.env.TEXT_URL

  if (!apiKey) {
    throw new Error('TEXT_KEY environment variable is not set')
  }

  if (!baseURL) {
    throw new Error('TEXT_URL environment variable is not set')
  }

  return new OpenAI({
    apiKey,
    baseURL,
  })
}

export async function analyzeProduct(input: AnalyzeProductInput): Promise<AnalyzeProductOutput> {
  const { productName, description, category, targetAudience, referenceImages = [] } = input

  const model = process.env.TEXT_MODEL
  if (!model) {
    throw new Error('TEXT_MODEL environment variable is not set')
  }

  const openai = getOpenAIClient()

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

  for (const image of referenceImages.slice(0, 3).reverse()) {
    content.unshift({
      type: 'image_url',
      image_url: {
        url: `data:${image.mediaType};base64,${image.data}`,
      },
    })
  }

  const message = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content,
      },
    ],
    max_tokens: 2048,
    response_format: { type: 'json_object' },
  })

  const responseText = message.choices[0]?.message?.content || ''

  try {
    const parsed = JSON.parse(responseText)
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
        '图片内如需文字必须为英文。',
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
        '图片内如需文字必须为英文。',
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
  return [
    `产品总结：${result.productSummary}`,
    result.sellingPoints.length ? `核心卖点：${result.sellingPoints.join('；')}` : '',
    `参考图总结：${result.referenceImageSummary}`,
    result.amazonImageGuidelines.length ? `Amazon 图片规范：${result.amazonImageGuidelines.join('；')}` : '',
    result.imageContentSuggestions.length ? `建议图片内容：${result.imageContentSuggestions.join('；')}` : '',
    result.visualStyleRecommendations.length ? `视觉风格建议：${result.visualStyleRecommendations.join('；')}` : '',
    result.visualSystemGuidance.length ? `整组视觉系统建议：${result.visualSystemGuidance.join('；')}` : '',
    result.promptingPrinciples.length ? `提示词原则：${result.promptingPrinciples.join('；')}` : '',
    `参考图建议：${result.referenceImageAdvice.reason}`,
    result.referenceImageAdvice.recommendedShots.length ? `建议补充参考图：${result.referenceImageAdvice.recommendedShots.join('；')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export { buildAnalysisSummaryForPromptGeneration }

const IMAGE_TYPE_CONFIG: Record<string, { name: string; goal: string; notes: string[] }> = {
  'main-white': { name: '白底主图', goal: '用于搜索结果和详情页首图，优先确保合规与点击率。', notes: ['纯白背景', '只展示售卖主体', '主体占画面约 85% 或以上', '图片内如需文字必须为英文'] },
  'lifestyle-1': { name: '场景图一', goal: '呈现产品最常见的使用场景，帮助用户快速理解用途和目标人群，并对一个核心场景做更深入展示。', notes: ['允许环境和人物', '强调单一核心使用情境', '氛围服务卖点'] },
  'lifestyle-2': { name: '场景图二', goal: '优先用拼图或分区构图展示多个使用场景、多个使用方式或多个使用动作；若不适合多场景，也要与第一张形成明显区分。', notes: ['优先多场景拼图', '产品仍是视觉焦点', '信息丰富但不杂乱'] },
  'infographic-1': { name: '卖点图一', goal: '拆出第一张卖点图，聚焦 1-2 个最核心的功能、材质或差异化优势，信息不宜过密。', notes: ['聚焦最强卖点', '文字必须为英文', '信息量克制', '适合信息图排版'] },
  'infographic-2': { name: '卖点图二', goal: '拆出第二张卖点图，补充另一组卖点、功能或使用价值，避免把所有信息塞进同一张。', notes: ['承接但不重复第一张', '文字必须为英文', '信息量克制', '视觉层次分明'] },
  'detail': { name: '细节图', goal: '放大材质、工艺、触感或关键结构，增强品质感。', notes: ['近景特写', '突出纹理或做工', '保留真实材质表现'] },
  'size': { name: '尺寸图', goal: '帮助用户快速建立尺寸认知，降低购买误判。', notes: ['与常见物体对比', '尺寸表达清楚', '避免误导性比例', '尺寸标注或说明文字必须为英文'] },
}

const PROMPT_INSTRUCTIONS: Record<string, string> = {
  'main-white': '生成一张白底主图，聚焦商品本体，纯白背景，主体完整清晰、边缘干净、真实质感，构图适合电商展示，强调专业棚拍与高点击率，避免文字、水印、Logo、价格标签和无关道具。图片内如需任何文字展示，必须使用英文。',
  'lifestyle-1': '生成场景图一，聚焦一个最常见、最典型、最容易理解的核心使用场景，做更深入、更完整的单场景展示，让用户一眼明白产品怎么用、适合谁用，画面自然可信、偏高端感，产品仍是视觉主角。如需出现任何文字，必须使用英文。',
  'lifestyle-2': '生成场景图二，优先采用拼图或分区构图，展示产品的多个使用场景、多个使用方式，或同一场景下的多种功能动作；若产品不适合拼图，也要切换到与场景图一明显不同的第二使用场景。整体信息更丰富但不杂乱，产品始终是视觉焦点。如需出现任何文字，必须使用英文。',
  'infographic-1': '生成卖点图一，聚焦 1-2 个最核心的功能、材质或差异化优势，信息量不要过密，版式清晰利落，标题和说明文字必须为英文，整体风格适合高质量亚马逊电商展示。',
  'infographic-2': '生成卖点图二，补充另一组卖点、功能价值或使用收益，与第一张形成明确分工，不要重复堆砌同一信息，文字说明必须为英文，版式清楚易读。',
  'detail': '生成一张细节特写图，突出产品材质、纹理、做工或关键结构，强调真实微距质感、清晰边缘和高级光线，让用户直观感受品质。提示词可以用中文，但如果图片内出现文字，必须为英文。',
  'size': '生成一张尺寸认知图，重点让用户快速理解产品大小、比例和摆放关系，可借助自然参照物表达尺寸，视觉清楚可信，比例准确不做过度夸张。图中所有尺寸标注或说明文字必须为英文。',
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
): Promise<{ plan: RecommendedImagePlanItem; prompt: string }> {
  const model = process.env.TEXT_MODEL
  if (!model) {
    throw new Error('TEXT_MODEL environment variable is not set')
  }

  const openai = getOpenAIClient()
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
- 提示词正文可以是中文，但图片内如需任何标题、说明、尺寸标注或其他文案，必须为英文
- 不要把镜头、角度、场景、道具限制得过死
- 语气像专业图片策划，不要像僵硬的参数堆砌
- 重点告诉 AI 你想要什么效果和感觉
- 白底主图 1 张、尺寸图 1 张、细节图 1 张、卖点图 2 张、场景图 2 张；当前只生成其中一张，要体现它在整套图里的职责
- 这张图必须与整套 Amazon listing image 保持统一视觉系统，尤其卖点图和场景图要统一字体气质、配色逻辑、版式语言、图标风格和后期质感，不能像来自两套模板
- 卖点图不要把信息塞得过满，允许拆成两张图分担信息
- 场景图一优先做最常见使用场景，并做更深入的单场景展示；场景图二优先做多场景拼图、多个使用形式或第二场景
- 如果当前生成的是卖点图二或场景图二，必须主动避开上一张已经占用的核心表达，换一个更明确的侧重点、使用语境或信息结构
- 如果当前生成的是卖点图一，应聚焦最强主卖点；卖点图二应优先从剩余卖点里选另一组重点，不要只是换说法重复第一张
- 如果当前生成的是场景图二，应优先采用拼图或分区方式展示多个使用场景、多个使用动作或多个使用形式；若不适合拼图，也必须更换使用场景、人物状态、空间语境、时间语境或功能组合，不能只是重复场景图一

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

  for (const image of referenceImages.slice(0, 3).reverse()) {
    content.unshift({
      type: 'image_url',
      image_url: {
        url: `data:${image.mediaType};base64,${image.data}`,
      },
    })
  }

  const message = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content,
      },
    ],
    max_tokens: 800,
    response_format: { type: 'json_object' },
  })

  const responseText = message.choices[0]?.message?.content || ''

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
    const parsed = JSON.parse(responseText)
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

export async function refineReversePrompt(extractedPrompt: string, userIntent = ''): Promise<{ finalPrompt: string }> {
  const model = process.env.TEXT_MODEL
  if (!model) {
    throw new Error('TEXT_MODEL environment variable is not set')
  }

  const openai = getOpenAIClient()
  const trimmedPrompt = extractedPrompt.trim()
  const trimmedIntent = userIntent.trim()

  if (!trimmedPrompt) {
    throw new Error('Extracted prompt is required')
  }

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: `你是一名擅长整理中文生图提示词的视觉提示词专家。

现在有两段信息：
1. 一段已经拆解好的基础提示词
2. 用户本轮想补充的一句话意图

你的任务是把它们整合成一段最终用于生图的中文提示词。

要求：
- 优先保留基础提示词里已经明确的主体、构图、背景、光线和气质。
- 正确吸收用户意图，让最终提示词更贴合用户这次要做的方向。
- 输出仍然是 1 到 2 句自然中文，不写分析，不拆点。
- 不要堆砌过细参数，不要写成长段落。
- 如果用户意图为空，就仅对基础提示词做轻微整理，不要大改。

基础提示词：${trimmedPrompt}
用户意图：${trimmedIntent || '无'}

请严格输出 JSON：
- finalPrompt: 最终用于生图的提示词`,
    },
  ]

  const message = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content,
      },
    ],
    max_tokens: 500,
    response_format: { type: 'json_object' },
  })

  const responseText = message.choices[0]?.message?.content || ''

  try {
    const parsed = JSON.parse(responseText)
    const finalPrompt = typeof parsed.finalPrompt === 'string' && parsed.finalPrompt.trim()
      ? parsed.finalPrompt.trim()
      : trimmedIntent
        ? `${trimmedPrompt} ${trimmedIntent}`
        : trimmedPrompt

    return { finalPrompt }
  } catch {
    return {
      finalPrompt: trimmedIntent ? `${trimmedPrompt} ${trimmedIntent}` : trimmedPrompt,
    }
  }
}

export async function generatePromptsWithProgress(
  productName: string,
  description: string,
  category: string,
  targetAudience: string,
  referenceImages: Array<{ data: string; mediaType: string }> = [],
  analysisSummary = '',
  onProgress?: (progress: PromptGenerationProgress) => void | Promise<void>,
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

export async function generateAllPrompts(
  productName: string,
  description: string,
  category: string,
  targetAudience: string,
  referenceImages: Array<{ data: string; mediaType: string }> = [],
  analysisSummary = '',
): Promise<GeneratePromptsOutput> {
  const result = await generatePromptsWithProgress(
    productName,
    description,
    category,
    targetAudience,
    referenceImages,
    analysisSummary,
  )

  return {
    recommendedImagePlan: result.recommendedImagePlan.sort((a, b) => {
      const order = ['main-white', 'size', 'detail', 'infographic', 'lifestyle']
      const orderDelta = order.indexOf(a.type) - order.indexOf(b.type)
      if (orderDelta !== 0) return orderDelta
      return a.index - b.index
    }),
    suggestedPrompts: Object.fromEntries(
      Object.entries(result.suggestedPrompts).sort(([keyA], [keyB]) => {
        const promptOrder = ['main-white', 'size', 'detail', 'infographic-1', 'infographic-2', 'lifestyle-1', 'lifestyle-2']
        return promptOrder.indexOf(keyA) - promptOrder.indexOf(keyB)
      }),
    ),
  }
}
