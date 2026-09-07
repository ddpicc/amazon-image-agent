'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import ProductInput from '@/components/ProductInput'
import LoadingSpinner, { SkeletonBlock } from '@/components/LoadingSpinner'
import {
  APlusPromptGenerationResult,
  AmazonGalleryPromptItem,
  AmazonAnalysisStageResult,
  AmazonBranch,
  AMAZON_REFERENCE_IMAGE_LIMIT,
  AmazonPromptKey,
  AmazonResumeImage,
  AmazonResumeState,
  BasicAnalysisResult,
  PromptGenerationResult,
  PromptKey,
  PromptResults,
  StoredReferenceImage,
  getPromptResultForBranch,
  isPromptGenerationComplete,
} from '@/lib/amazon-workflow'
import { formatDateTimeInBeijing } from '@/lib/date'
import { HIDDEN_APLUS_RENDER_SIZE, RenderSize } from '@/lib/image-options'
import { formatPoints, GenerationBillingScene, getAnalysisCostDisplay, getGenerationCostDisplay } from '@/lib/points-config'
import { usePoints } from '@/components/PointsProvider'

type AmazonImageType = 'main-white' | 'lifestyle' | 'infographic' | 'detail' | 'size'
type PromptImageType = AmazonPromptKey
type APlusPromptImageType =
  | 'aplus-main'
  | 'aplus-hero'
  | 'aplus-transform'
  | 'aplus-grid'
  | 'aplus-lifestyle'
  | 'aplus-feature'
  | 'aplus-detail'

interface ImageTypeOption {
  value: PromptKey
  label: string
  description: string
}

interface GeneratedImage {
  id: string
  requestId?: string
  imageUrl: string | null
  prompt: string
  imageType: string
  revisedPrompt?: string
  size?: RenderSize
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
  statusMessage?: string | null
  errorMessage?: string | null
  charged?: boolean
  billedCost?: number
}

interface RouteSummary {
  selectedLineName: string
  selectedLineIndex: number
  switched: boolean
  attemptedLines: Array<{
    lineIndex: number
    lineName: string
    status: 'succeeded' | 'failed'
    errorMessage?: string
  }>
  userMessage: string
}

type GenerateStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'result'; data: { requestId: string; imageUrl: string; revisedPrompt: string; routeSummary: RouteSummary | null; size?: RenderSize } }
  | { type: 'error'; message: string }
  | { type: 'queued'; data: { requestId: string; operationId: string; status: string; statusMessage: string } }

interface GenerationStatusPayload {
  requestId: string
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
  statusMessage: string | null
  errorMessage: string | null
  prompt: string
  revisedPrompt: string | null
  imageUrl: string | null
  imageType: string | null
  size: string | null
  active: boolean
  routeSummary: RouteSummary | null
}

interface AnalysisStatusPayload extends AmazonResumeState {
  active: boolean
}

type AnalysisStage = 'idle' | 'preparing' | 'analyzing' | 'prompting' | 'completed' | 'error'
type TaskStatus = 'idle' | 'preparing' | 'analyzing' | 'prompting' | 'saving' | 'completed' | 'error'

function formatElapsedTime(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  if (totalSeconds < 60) return `${totalSeconds} 秒`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes} 分 ${seconds} 秒`
}

interface AnalyzeStreamEvent {
  type: 'analysis-created' | 'stage' | 'analysis-stage' | 'partial-analysis' | 'amazon-prompts' | 'warning' | 'error' | 'done'
  analysisId?: string
  stage?: Exclude<AnalysisStage, 'idle' | 'error'>
  label?: string
  progress?: number
  data?: BasicAnalysisResult | AmazonAnalysisStageResult | PromptGenerationResult
  message?: string
  recoverable?: boolean
}

interface AnalyzeFormInput {
  productName: string
  description: string
  additionalRequirements: string
  referenceImages: File[]
}

const imageTypeOptions: ImageTypeOption[] = [
  { value: 'main-white', label: '白底主图', description: '主图合规与点击优先' },
  { value: 'size', label: '尺寸图', description: '建立尺寸与比例认知' },
  { value: 'detail', label: '细节图', description: '强调材质与做工' },
  { value: 'infographic-1', label: '卖点图一', description: '第一张卖点图，聚焦最强卖点' },
  { value: 'infographic-2', label: '卖点图二', description: '第二张卖点图，拆分补充信息' },
  { value: 'lifestyle-1', label: '利益场景图', description: '用真实场景讲清最强购买理由' },
  { value: 'lifestyle-2', label: '补充场景图', description: '展示另一种使用方式或使用收益' },
]

const aplusImageTypeOptions: ImageTypeOption[] = [
  { value: 'aplus-hero', label: 'A+ 模块一', description: '顶部 hero 区，建立品牌感和主场景' },
  { value: 'aplus-transform', label: 'A+ 模块二', description: '中段承接区，讲清如何展开或如何使用' },
  { value: 'aplus-grid', label: 'A+ 模块三', description: '卖点信息区，承载功能亮点和材质细节' },
  { value: 'aplus-lifestyle', label: 'A+ 模块四', description: '底部收束区，延展场景并补充参数信息' },
]

const fallbackPrompts: Record<string, string> = {
  'main-white': '为亚马逊商品详情页生成一张白底主图，聚焦商品本体，纯白背景，主体完整清晰、边缘干净、真实质感，构图适合电商展示，强调专业棚拍与高点击率，避免文字、水印、Logo、价格标签和无关道具。图片内不得出现中文；如需任何文字，只能使用准确简短英文，无法保证英文准确时不要放文字。',
  size: '为亚马逊商品详情页生成一张尺寸认知图，重点让用户快速理解产品大小、比例和摆放关系，可借助自然参照物表达尺寸，视觉清楚可信，比例准确不做过度夸张。图片内不得出现中文；尺寸标注或说明只能使用准确简短英文，无法保证英文准确时不要放文字。',
  detail: '为亚马逊商品详情页生成一张细节特写图，突出产品材质、纹理、做工或关键结构，强调真实微距质感、清晰边缘和高级光线，让用户直观感受品质。提示词可以用中文，但图片内不得出现中文；如需文字，只能使用准确简短英文，无法保证英文准确时不要放文字。',
  'infographic-1': '为亚马逊商品详情页生成卖点图一，聚焦 1-2 个最核心的功能、材质或差异化优势，信息量不要过密，版式清晰利落；图片内不得出现中文，如需标题或说明，只能使用准确简短英文，无法保证英文准确时不要放文字。',
  'infographic-2': '为亚马逊商品详情页生成卖点图二，补充另一组卖点、功能价值或使用收益，与第一张形成明确分工，不要重复堆砌同一信息，版式清楚易读；图片内不得出现中文，如需说明，只能使用准确简短英文，无法保证英文准确时不要放文字。',
  'lifestyle-1': '为亚马逊商品详情页生成一张以购买理由为中心的真实使用场景图：先让用户看懂产品适合谁、解决什么问题，再用一个自然、有情绪、有生活感的场景把这个结果表现出来。产品仍是视觉主角；如果商品的真实使用对象需要出现在画面中，可以自然加入相应的用户、婴儿、儿童或照护者，不要把人物默认设为禁用。图片内不得出现中文，如需文字只能使用准确简短英文。',
  'lifestyle-2': '为亚马逊商品详情页生成一张与其他图片有明确分工的场景/利益图，展示另一个真实使用方式、关键动作、前后变化或能被商品事实支持的使用收益。商品确实有多种功能或多个典型场景时，可以使用 2-4 格受控拼图、分区或连续动作画面，在同一个购买问题下提高信息密度；保持清晰主次、统一产品外观和移动端可读性，不要堆叠无关内容。图片内不得出现中文，如需文字只能使用准确简短英文。',
}

const aplusFallbackPrompts: Record<APlusPromptImageType, string> = {
  'aplus-main': '为亚马逊普通 A+ 页面生成一张横版模块图，强调产品、品牌感和卖点整合，不要做成 listing 白底主图。提示词可以使用中文，但图片内不得出现中文；如需标题、说明或标签，只能使用准确简短英文，无法保证英文准确时不要放文字。',
  'aplus-hero': '为亚马逊普通 A+ 页面生成第一张横版模块图，作为整页顶部 hero 切片。画面要像成熟 A+ 页面的第一屏，用清晰的核心利益、自然留白、可信的生活方式场景和有情绪的光线建立产品认知。产品与参考图保持一致，产品是视觉主角；如果商品的真实使用对象需要出现在场景中，可以自然加入相应用户、婴儿、儿童或照护者，不要把人物默认设为禁用。整体干净、有高级感，不要做成白底主图或夸张海报。图片内不得出现中文，如需文字只能使用准确简短英文。',
  'aplus-transform': '为亚马逊普通 A+ 页面生成第二张横版模块图，作为整页中段的机制讲解切片。延续第一页的色调和空间语境，更自然地表现产品如何展开、如何使用或为什么方便，可以带简洁英文说明、步骤感或形态变化，但不要做成说明书式拼贴。图片内不得出现中文，如需文字只能使用准确简短英文。',
  'aplus-grid': '为亚马逊普通 A+ 页面生成第三张横版模块图，作为整页卖点信息区切片。延续前两张的视觉气质，用更有层级的方式承载功能优势、结构亮点、材质细节或局部特写，可以有卡片、分区或局部放大，但整体仍然像成熟 A+ 页面，而不是独立卖货海报。图片内不得出现中文，如需文字只能使用准确简短英文。',
  'aplus-lifestyle': '为亚马逊普通 A+ 页面生成第四张横版模块图，作为整页底部的场景与信息收束切片。延续前面的色调与品牌感，自然呈现适用场景、使用结果、安心感、参数或材质信息，让整套 A+ 页面完整收束；如果商品的真实使用对象需要出现在场景中，可以自然加入相应用户、婴儿、儿童或照护者。画面可包含简洁英文信息区，但不应重新变成新的主视觉图。图片内不得出现中文，如需文字只能使用准确简短英文。',
  'aplus-feature': '为亚马逊普通 A+ 页面生成一张横版卖点模块图，延续整页语境，自然表现核心卖点、结构亮点或使用收益。图片内不得出现中文，如需文字只能使用准确简短英文。',
  'aplus-detail': '为亚马逊普通 A+ 页面生成一张横版细节模块图，延续整页语境，重点表现材质、做工、局部结构或补充场景。图片内不得出现中文，如需文字只能使用准确简短英文。',
}

const EMPTY_PROMPT_RESULTS: PromptResults = {
  amazonSet: null,
  aplus: null,
}

function getAPlusOptionSet(result: PromptGenerationResult | APlusPromptGenerationResult | null): ImageTypeOption[] {
  if (result?.suggestedPrompts['aplus-main'] && !result.suggestedPrompts['aplus-hero']) {
    return [{ value: 'aplus-main', label: 'A+ 模块图', description: '旧版单张 A+ 模块图' }]
  }
  if (result?.suggestedPrompts['aplus-feature'] || result?.suggestedPrompts['aplus-detail']) {
    return [
      { value: 'aplus-hero', label: 'A+ 模块一', description: '顶部 hero 区，建立品牌感和主场景' },
      { value: 'aplus-feature', label: 'A+ 模块二', description: '旧版卖点承接模块' },
      { value: 'aplus-detail', label: 'A+ 模块三', description: '旧版细节/收束模块' },
    ]
  }
  return aplusImageTypeOptions
}

function getDefaultAPlusPromptKey(result: PromptGenerationResult | APlusPromptGenerationResult | null): APlusPromptImageType {
  if (result?.suggestedPrompts['aplus-hero']) return 'aplus-hero'
  if (result?.suggestedPrompts['aplus-transform']) return 'aplus-transform'
  if (result?.suggestedPrompts['aplus-grid']) return 'aplus-grid'
  if (result?.suggestedPrompts['aplus-lifestyle']) return 'aplus-lifestyle'
  if (result?.suggestedPrompts['aplus-feature']) return 'aplus-feature'
  if (result?.suggestedPrompts['aplus-detail']) return 'aplus-detail'
  return 'aplus-main'
}

function createImageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function getDefaultSizeForType(type: PromptKey): RenderSize {
  return type.startsWith('aplus-') ? HIDDEN_APLUS_RENDER_SIZE : '1024x1024'
}

function getBillingSceneForPromptType(type: PromptKey): GenerationBillingScene {
  return type.startsWith('aplus-') ? 'aplus' : 'amazon'
}

function collectObservationText(analysisResult: BasicAnalysisResult): string {
  return [
    analysisResult.referenceImageSummary,
    ...analysisResult.referenceImageObservations.flatMap((item) => item.observations),
    analysisResult.referenceImageAdvice.reason,
    ...analysisResult.referenceImageAdvice.recommendedShots,
  ]
    .join(' ')
    .toLowerCase()
}

function getBaseType(type: string): AmazonImageType {
  const lastHyphenIndex = type.lastIndexOf('-')
  if (lastHyphenIndex > 0 && /\d$/.test(type)) {
    return type.slice(0, lastHyphenIndex) as AmazonImageType
  }
  return type as AmazonImageType
}

function getSuggestedPrompt(result: PromptGenerationResult | APlusPromptGenerationResult | null, type: PromptKey): string {
  if (!result) {
    return type.startsWith('aplus-')
      ? aplusFallbackPrompts[type as APlusPromptImageType]
      : fallbackPrompts[type as PromptImageType]
  }

  const adaptiveItem = !type.startsWith('aplus-')
    ? result.items?.find((item) => item.slotId === type)
    : null

  return adaptiveItem?.displayPrompt || adaptiveItem?.prompt || result.suggestedPrompts[type]
    || (type.startsWith('aplus-') ? aplusFallbackPrompts[type as APlusPromptImageType] : fallbackPrompts[type as PromptImageType])
}

function getPromptForGeneration(
  result: PromptGenerationResult | null,
  type: PromptKey,
  visiblePrompt: string,
): string {
  const item = result?.items?.find((candidate) => candidate.slotId === type)
  const visible = visiblePrompt.trim()
  if (!item) return visible

  const defaultVisiblePrompt = (item.displayPrompt || item.prompt).trim()
  return visible && visible === defaultVisiblePrompt ? item.prompt : visible
}

function getAmazonGalleryItems(result: PromptGenerationResult | null): AmazonGalleryPromptItem[] {
  if (result?.items?.length) {
    return result.items.filter((item) => item.enabled)
  }

  return imageTypeOptions.map((option, index) => ({
    slotId: option.value as AmazonGalleryPromptItem['slotId'],
    title: option.label,
    visualForm: option.description,
    prompt: result?.suggestedPrompts[option.value] || fallbackPrompts[option.value as PromptImageType],
    size: '1024x1024',
    enabled: true,
  }))
}

function getImageTypeLabel(
  type: string,
  result: PromptGenerationResult | APlusPromptGenerationResult | null,
): string {
  return result?.items?.find((item) => item.slotId === type)?.title
    || [...imageTypeOptions, ...aplusImageTypeOptions].find((option) => option.value === type)?.label
    || type
}

function buildReferenceAwarePromptHint(type: PromptKey, analysisResult: BasicAnalysisResult): string {
  if (type.startsWith('aplus-')) {
    const text = collectObservationText(analysisResult)
    const hasLifestyle = /(场景|使用|人物|环境|桌面|家居|户外)/.test(text)
    const hasDetail = /(细节|纹理|材质|做工|接口|结构|特写)/.test(text)
    const isHero = type === 'aplus-hero'
    const isGrid = type === 'aplus-grid' || type === 'aplus-feature'
    const isBottom = type === 'aplus-lifestyle' || type === 'aplus-detail'
    const lines = [
      '产品外观、结构和材质优先参考现有参考图，不要偏离商品本身。',
      hasLifestyle
        ? `可以自然吸收参考图已有的场景线索，让${isHero ? '这一张' : '当前模块'}更贴近真实使用语境。`
        : '如果参考图缺少明确场景，请根据商品类目、使用对象和核心利益补足自然、可理解的生活语境；如果目标用户需要出现在画面中，可以自然加入相应用户，不要把人物默认为禁用。',
      hasDetail
        ? `可以适度强化${isBottom ? '材质、做工和局部细节' : isGrid ? '材质质感、结构表现和卖点层次' : '材质质感和结构表现'}。`
        : '如果参考图细节有限，细节表现保持克制真实，不要虚构太多微小结构。',
    ]
    if (type === 'aplus-transform') {
      lines.push('这一张更适合自然表现产品如何展开、如何使用或为什么方便，不要重新拍成新的 hero 图。')
    }
    if (isGrid) {
      lines.push('这一张更适合做卖点信息区、卡片区或局部特写区，但仍然要像整页中的中段切片。')
    }
    if (isBottom) {
      lines.push('这一张更适合做底部收束区，可偏场景延展、规格或安心感信息，但整体气质仍要和前面的 A+ 图保持一致。')
    }
    return `参考图使用策略：${lines.join(' ')}`
  }

  const baseType = getBaseType(type)
  const text = collectObservationText(analysisResult)

  const hasDetail = /(细节|纹理|材质|做工|接口|结构|特写)/.test(text)
  const hasSize = /(尺寸|比例|手持|对比|参照)/.test(text)
  const hasLifestyle = /(场景|使用|人物|环境|桌面|家居|户外)/.test(text)
  const hasFront = /(正面|主视图|标准展示)/.test(text)
  const hasAngle = /(45 度|侧面|多角度|俯视|斜侧)/.test(text)

  const lines: string[] = []

  if (hasFront || hasAngle) {
    lines.push('优先继承参考图里已经明确的产品外观比例、轮廓和主要结构。')
  }

  if (!hasDetail && (baseType === 'detail' || baseType === 'infographic')) {
    lines.push('参考图缺少足够细节，不要过度虚构微小结构、接口或材质纹理，细节表达以稳妥为主。')
  }

  if (hasDetail && (baseType === 'detail' || baseType === 'infographic')) {
    lines.push('可以参考现有细节信息去强化材质、纹理和关键结构表现。')
  }

  if (!hasSize && baseType === 'size') {
    lines.push('参考图没有清楚尺寸参照，不要捏造精确比例关系，优先做自然、保守的尺寸认知表达。')
  }

  if (hasSize && baseType === 'size') {
    lines.push('可结合参考图已有的比例或参照信息，增强尺寸表达的可信度。')
  }

  if (!hasLifestyle && baseType === 'lifestyle') {
    lines.push('参考图缺少明确场景信息，请根据商品类目、目标用户和核心用途补足一个真实、可理解的使用语境；如果商品的目标用户需要出现在场景中，可以自然加入相应用户，不要把人物默认为禁用，场景仍需以产品为主。')
  }

  if (hasLifestyle && baseType === 'lifestyle') {
    lines.push('可吸收参考图中已有的使用环境或生活方式线索，并根据商品用途补足一个清晰的动作、结果和情绪，让场景图更贴近真实用户语境。')
  }

  if (!hasFront && baseType === 'main-white') {
    lines.push('参考图未必提供了完整标准主视角，白底主图应以清晰、完整、稳妥的电商展示为先，不追求复杂角度。')
  }

  return lines.length ? `参考图使用策略：${lines.join(' ')}` : ''
}

function buildStructuredPromptDirectives(type: PromptKey): string[] {
  if (type.startsWith('aplus-')) {
    return [
      '这是 Amazon A+ module image，不是 listing 白底主图。',
      '产品必须是视觉主角，且与参考图保持一致。',
      '视觉方向优先服从商品类目、使用对象和核心利益；如果真实使用语境需要，可以自然呈现相应用户、婴儿、儿童或照护者，帮助表达尺度、动作和情绪。',
      '图片内不得出现中文、中文字符或中文标点；如果出现任何标题、说明或标签，全部使用简短自然的英文，无法保证英文准确时不要放文字。',
      '整体感觉要像成熟、干净、有生活感和叙事的 A+ 模块，而不是复杂编辑稿或杂乱海报；每个装饰元素都要服务于购买理解。',
    ]
  }

  const baseType = getBaseType(type)
  const directives = [
    '执行约束：提示词可以使用中文，但图片内不得出现中文、中文字符或中文标点；如需标题、说明、尺寸标注或其他文案，只能使用准确简短英文，无法保证英文准确时不要放文字。',
    '执行约束：这是 Amazon listing image，画面优先服务电商转化；可以使用有目的的氛围、生活感和叙事，但不添加与商品无关的装饰。',
  ]

  if (type === 'main-white') {
    directives.push('分工要求：这是整套图里的唯一白底主图，必须最优先保证合规、主体完整、背景纯白。')
  }

  if (type === 'size') {
    directives.push('分工要求：这是整套图里的唯一尺寸图，重点建立大小、比例和摆放关系，不要把卖点信息塞进这一张。')
  }

  if (type === 'detail') {
    directives.push('分工要求：这是整套图里的唯一细节图，重点放大材质、纹理、做工或关键结构，不承担尺寸说明和密集卖点说明。')
  }

  if (type === 'infographic-1') {
    directives.push('分工要求：这是卖点图一，只讲最强的 1-2 个核心卖点，信息量克制，不要堆满。')
  }

  if (type === 'infographic-2') {
    directives.push('分工要求：这是卖点图二，用来承接另一组卖点或使用收益，与卖点图一明确分工，不重复。')
  }

  if (type === 'lifestyle-1') {
    directives.push('分工要求：这是核心利益与使用场景图，必须用一个真实、有情绪的单一场景讲清最强购买理由和使用结果，不能退化成纯产品摆拍或纯功能卡片。')
  }

  if (type === 'lifestyle-2') {
    directives.push('分工要求：这是补充使用场景图，展示与场景图一不同的真实使用方式、关键动作、前后变化或使用收益；商品确实有多种功能或多个典型场景时，可使用 2-4 格受控拼图、分区或连续动作画面，提高信息密度，但必须围绕同一个购买问题，保持清晰主次、统一产品外观、足够留白和移动端可读性。')
  }

  if (baseType === 'infographic') {
    directives.push('版式要求：信息图保持清晰留白，避免密集小字和过多模块。')
  }

  if (baseType === 'lifestyle') {
    directives.push('场景要求：产品必须仍是视觉主角；根据商品真实的使用对象和场景自然加入相应人物（包括婴儿、儿童或照护者），人物用于说明尺度、动作和情绪，不喧宾夺主；不得新增未证实的功能、安全效果或其他产品事实。')
  }

  return directives
}

function AnalysisCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-3xl border border-slate-200 bg-white p-5 ${className}`.trim()}>
      <SkeletonBlock className="h-4 w-32" />
      <div className="mt-4 space-y-3">
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-11/12" />
        <SkeletonBlock className="h-4 w-9/12" />
      </div>
    </div>
  )
}

function TaskStatusPanel({
  title,
  stage,
  label,
  progress,
  warnings,
  helperText,
  elapsedText,
  steps,
}: {
  title: string
  stage: TaskStatus
  label: string
  progress: number
  warnings: string[]
  helperText: string
  elapsedText?: string
  steps: Array<{ key: Exclude<TaskStatus, 'idle' | 'error'>; label: string }>
}) {
  const activeIndex = steps.findIndex((step) => step.key === stage)

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 md:col-span-2">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{label}</p>
          <p className="mt-2 text-xs text-slate-500">
            {helperText}
          </p>
          {elapsedText && (
            <p className="mt-2 text-xs font-medium text-slate-600">
              本阶段已用时 {elapsedText}
            </p>
          )}
        </div>
        <div className="min-w-[220px]">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-amazon-orange transition-all duration-300"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <div className="mt-2 text-right text-xs font-medium text-slate-500">{progress}%</div>
        </div>
      </div>

      <div className={`mt-5 grid gap-3 ${steps.length > 3 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
        {steps.map((step, index) => {
          const isComplete = activeIndex > index || stage === 'completed'
          const isActive = activeIndex === index
          return (
            <div
              key={step.key}
              className={`rounded-2xl border px-4 py-3 text-sm ${
                isComplete
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : isActive
                    ? 'border-amazon-orange bg-orange-50 text-amazon-orange'
                    : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {step.label}
            </div>
          )
        })}
      </div>

      {warnings.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {warnings.join(' ')}
        </div>
      )}
    </div>
  )
}

export default function AmazonPage({
  initialResumeState,
  initialPointsBalance,
}: {
  initialResumeState: AmazonResumeState | null
  initialPointsBalance: number
}) {
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [storedReferenceImages, setStoredReferenceImages] = useState<StoredReferenceImage[]>(initialResumeState?.referenceImages || [])
  const [analysisId, setAnalysisId] = useState(initialResumeState?.analysisId || '')
  const [currentStep, setCurrentStep] = useState<'input' | 'analysis' | 'generate'>('input')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('idle')
  const [analysisStageLabel, setAnalysisStageLabel] = useState('')
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null)
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState(0)
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([])
  const [streamError, setStreamError] = useState('')
  const [isStreamCompleted, setIsStreamCompleted] = useState(false)
  const [basicAnalysisResult, setBasicAnalysisResult] = useState<BasicAnalysisResult | null>(null)
  const [analysisSections, setAnalysisSections] = useState<AmazonAnalysisStageResult[]>([])
  const [promptResults, setPromptResults] = useState<PromptResults>(initialResumeState?.promptResults || EMPTY_PROMPT_RESULTS)
  const [selectedBranch, setSelectedBranch] = useState<AmazonBranch | null>(initialResumeState?.currentBranch || null)
  const [branchPromptStatus, setBranchPromptStatus] = useState<TaskStatus>('idle')
  const [branchPromptLabel, setBranchPromptLabel] = useState('')
  const [branchPromptProgress, setBranchPromptProgress] = useState(0)
  const [branchPromptStartedAt, setBranchPromptStartedAt] = useState<number | null>(null)
  const [branchPromptElapsedMs, setBranchPromptElapsedMs] = useState(0)
  const [promptGenerationError, setPromptGenerationError] = useState('')
  const [userGuidance, setUserGuidance] = useState('')
  const [selectedImageType, setSelectedImageType] = useState<PromptKey>('main-white')
  const [selectedSize, setSelectedSize] = useState<RenderSize>('1024x1024')
  const [containsSyntheticPerformer, setContainsSyntheticPerformer] = useState(false)
  const [editedPrompt, setEditedPrompt] = useState('')
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [pointsBalance, setPointsBalance] = useState(initialPointsBalance)
  const { refreshPoints } = usePoints()
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [editingImage, setEditingImage] = useState<GeneratedImage | null>(null)
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null)
  const [routeNotice, setRouteNotice] = useState('')
  const [resumeNotice, setResumeNotice] = useState('')
  const analyzeRequestIdRef = useRef(0)
  const analyzeAbortControllerRef = useRef<AbortController | null>(null)
  const autoAmazonPromptRequestRef = useRef(false)
  const generationPollingRef = useRef<Map<string, number>>(new Map())
  const analysisPollingRef = useRef<number | null>(null)
  const appliedResumeIdRef = useRef<string | null>(null)
  const analysisChargeRef = useRef({
    amazon: initialResumeState?.status === 'SUCCEEDED',
    aplus: Boolean(initialResumeState?.promptResults.aplus),
  })
  const currentPromptResult = useMemo(
    () => (selectedBranch ? getPromptResultForBranch(promptResults, selectedBranch) : null),
    [promptResults, selectedBranch],
  )
  const amazonPromptResult = promptResults.amazonSet
  const generationCost = useMemo(
    () => getGenerationCostDisplay(selectedBranch === 'aplus' ? 'aplus' : 'amazon'),
    [selectedBranch],
  )
  const generationCostText = useMemo(() => formatPoints(generationCost), [generationCost])
  const amazonGenerationCost = useMemo(() => getGenerationCostDisplay('amazon'), [])
  const amazonAnalysisCost = useMemo(() => getAnalysisCostDisplay('amazon-analysis'), [])
  const amazonAnalysisCostText = useMemo(() => formatPoints(amazonAnalysisCost), [amazonAnalysisCost])
  const aplusAnalysisCost = useMemo(() => getAnalysisCostDisplay('aplus-analysis'), [])
  const aplusAnalysisCostText = useMemo(() => formatPoints(aplusAnalysisCost), [aplusAnalysisCost])
  const hasEnoughPointsToGenerate = pointsBalance >= generationCost
  const activeReferenceImageCount = referenceImages.length || storedReferenceImages.length
  // 再次编辑：用已生成的图作为参考图走 edits 接口，按自有生图标准计费
  const editImageCost = useMemo(() => getGenerationCostDisplay('playground'), [])
  const editImageCostText = useMemo(() => formatPoints(editImageCost), [editImageCost])
  const hasEnoughPointsToEdit = pointsBalance >= editImageCost

  const isBranchPromptActive = branchPromptStatus !== 'idle' && branchPromptStatus !== 'error'

  const markLocalAnalysisCharge = useCallback((kind: 'amazon' | 'aplus', cost: number) => {
    if (analysisChargeRef.current[kind]) {
      return
    }

    analysisChargeRef.current[kind] = true
    setPointsBalance((current) => Math.max(0, Number((current - cost).toFixed(1))))
    void refreshPoints()
  }, [refreshPoints])

  useEffect(() => {
    if (currentStep !== 'analysis') return

    const startedAt = isBranchPromptActive ? branchPromptStartedAt : analysisStartedAt
    if (!startedAt) return

    const updateElapsedTime = () => {
      const elapsedMs = Date.now() - startedAt
      if (isBranchPromptActive) {
        setBranchPromptElapsedMs(elapsedMs)
      } else {
        setAnalysisElapsedMs(elapsedMs)
      }
    }

    updateElapsedTime()
    const timerId = window.setInterval(updateElapsedTime, 1000)
    return () => window.clearInterval(timerId)
  }, [analysisStartedAt, branchPromptStartedAt, currentStep, isBranchPromptActive])

  const setPromptValue = useCallback((type: PromptKey, value: string) => {
    setEditedPrompts((previous) => ({ ...previous, [type]: value }))
    if (selectedImageType === type) {
      setEditedPrompt(value)
    }
  }, [selectedImageType])

  useEffect(() => {
    return () => {
      generationPollingRef.current.forEach((timerId) => window.clearInterval(timerId))
      generationPollingRef.current.clear()
      if (analysisPollingRef.current) {
        window.clearInterval(analysisPollingRef.current)
        analysisPollingRef.current = null
      }
    }
  }, [])

  const buildPrompt = useCallback((type: PromptKey, promptBody?: string) => {
    if (!basicAnalysisResult) return ''
    const basePrompt = promptBody || getSuggestedPrompt(currentPromptResult, type)

    // V2 Amazon prompts already contain the product-truth and visual execution
    // constraints. Do not append the old reference-strategy block to them.
    if (selectedBranch === 'amazon-set' && currentPromptResult?.items?.some((item) => item.slotId === type)) {
      return userGuidance.trim()
        ? `${basePrompt}\n\n补充要求：${userGuidance.trim()}`
        : basePrompt
    }

    const referenceAwareHint = buildReferenceAwarePromptHint(type, basicAnalysisResult)
    const structuredDirectives = buildStructuredPromptDirectives(type).join('\n')
    const extraParts = [
      structuredDirectives
        ? (type.startsWith('aplus-') ? structuredDirectives : `补充执行要求：\n${structuredDirectives}`)
        : '',
      referenceAwareHint,
      userGuidance.trim() ? `补充要求：${userGuidance.trim()}` : '',
    ].filter(Boolean)
    if (!extraParts.length) {
      return basePrompt
    }
    return `${basePrompt}\n\n${extraParts.join('\n\n')}`
  }, [basicAnalysisResult, currentPromptResult, selectedBranch, userGuidance])

  const requestGenerate = useCallback(async (
    type: PromptKey,
    promptOverride?: string,
    sizeOverride?: RenderSize,
    includeContextualHints = true,
  ) => {
    const prompt = includeContextualHints
      ? buildPrompt(type, promptOverride)
      : (promptOverride || getSuggestedPrompt(currentPromptResult, type))
    const size = sizeOverride || getDefaultSizeForType(type)
    const formData = new FormData()
    formData.append('prompt', prompt)
    formData.append('imageType', type)
    formData.append('size', size)
    formData.append('sourcePage', 'amazon')
    formData.append('billingScene', getBillingSceneForPromptType(type))
    if (analysisId) {
      formData.append('analysisId', analysisId)
    }
    formData.append('containsSyntheticPerformer', String(containsSyntheticPerformer))
    if (referenceImages.length > 0) {
      referenceImages.slice(0, AMAZON_REFERENCE_IMAGE_LIMIT).forEach((image) => {
        formData.append('referenceImages', image)
      })
    } else if (storedReferenceImages.length > 0) {
      formData.append('referenceImageUrls', JSON.stringify(storedReferenceImages.slice(0, AMAZON_REFERENCE_IMAGE_LIMIT).map((image) => image.url)))
    }

    const response = await fetch('/api/generate/stream', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok || !response.body) {
      throw new Error('Failed to start image generation stream')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let resultEvent: GenerateStreamEvent | null = null
    let queuedEvent: Extract<GenerateStreamEvent, { type: 'queued' }> | null = null

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line) as GenerateStreamEvent

        if (event.type === 'status') {
          setRouteNotice(event.message)
          continue
        }

        if (event.type === 'result') {
          resultEvent = event
          continue
        }

        if (event.type === 'queued') {
          queuedEvent = event
          continue
        }

        if (event.type === 'error') {
          throw new Error(event.message)
        }
      }
    }

    if (buffer.trim()) {
      const event = JSON.parse(buffer) as GenerateStreamEvent
      if (event.type === 'status') {
        setRouteNotice(event.message)
      } else if (event.type === 'result') {
        resultEvent = event
      } else if (event.type === 'queued') {
        queuedEvent = event
      } else if (event.type === 'error') {
        throw new Error(event.message)
      }
    }

    if (queuedEvent) {
      return {
        kind: 'queued' as const,
        data: queuedEvent.data,
        prompt,
        size,
        imageType: type,
      }
    }

    if (!resultEvent || resultEvent.type !== 'result') {
      throw new Error('Image generation stream ended without a result')
    }

    return {
      kind: 'result' as const,
      data: {
        requestId: resultEvent.data.requestId,
        imageUrl: resultEvent.data.imageUrl as string,
        prompt: (resultEvent.data.revisedPrompt || prompt) as string,
        routeSummary: (resultEvent.data.routeSummary || null) as RouteSummary | null,
        size,
        imageType: type,
      },
    }
  }, [analysisId, buildPrompt, containsSyntheticPerformer, currentPromptResult, referenceImages, storedReferenceImages])

  // 再次编辑：把已生成的图作为参考图，走 edits 接口，按 playground 标准计费
  const requestEditImage = useCallback(async (
    sourceImageUrl: string,
    promptOverride: string,
    imageType: string,
    sizeOverride?: RenderSize,
  ) => {
    const prompt = promptOverride
    const size = sizeOverride || '1024x1024'
    const formData = new FormData()
    formData.append('prompt', prompt)
    formData.append('imageType', imageType)
    formData.append('size', size)
    formData.append('sourcePage', 'playground')
    formData.append('billingScene', 'playground')
    if (analysisId) {
      formData.append('analysisId', analysisId)
    }
    formData.append('referenceImageUrls', JSON.stringify([sourceImageUrl]))

    const response = await fetch('/api/generate/stream', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok || !response.body) {
      throw new Error('Failed to start image edit stream')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let resultEvent: GenerateStreamEvent | null = null
    let queuedEvent: Extract<GenerateStreamEvent, { type: 'queued' }> | null = null

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line) as GenerateStreamEvent

        if (event.type === 'status') {
          setRouteNotice(event.message)
          continue
        }

        if (event.type === 'result') {
          resultEvent = event
          continue
        }

        if (event.type === 'queued') {
          queuedEvent = event
          continue
        }

        if (event.type === 'error') {
          throw new Error(event.message)
        }
      }
    }

    if (buffer.trim()) {
      const event = JSON.parse(buffer) as GenerateStreamEvent
      if (event.type === 'status') {
        setRouteNotice(event.message)
      } else if (event.type === 'result') {
        resultEvent = event
      } else if (event.type === 'queued') {
        queuedEvent = event
      } else if (event.type === 'error') {
        throw new Error(event.message)
      }
    }

    if (queuedEvent) {
      return {
        kind: 'queued' as const,
        data: queuedEvent.data,
        prompt,
        size,
        imageType,
      }
    }

    if (!resultEvent || resultEvent.type !== 'result') {
      throw new Error('Image edit stream ended without a result')
    }

    return {
      kind: 'result' as const,
      data: {
        requestId: resultEvent.data.requestId,
        imageUrl: resultEvent.data.imageUrl as string,
        prompt: (resultEvent.data.revisedPrompt || prompt) as string,
        routeSummary: (resultEvent.data.routeSummary || null) as RouteSummary | null,
        size,
        imageType,
      },
    }
  }, [analysisId])

  const applyRecoveredAnalysisState = useCallback((resumeState: AmazonResumeState, options?: {
    stageLabel?: string
    resumeMessage?: string
  }) => {
    setAnalysisId(resumeState.analysisId)
    setStoredReferenceImages(resumeState.referenceImages || [])
    setBasicAnalysisResult(resumeState.basicAnalysisResult)
    setAnalysisSections(resumeState.basicAnalysisResult?.analysisStages || [])
    setPromptResults(resumeState.promptResults || EMPTY_PROMPT_RESULTS)
    setPromptGenerationError(resumeState.status === 'FAILED' ? (resumeState.errorMessage || '这次分析没有成功完成。') : '')
    setStreamError(resumeState.status === 'FAILED' ? (resumeState.errorMessage || '这次分析没有成功完成。') : '')
    setAnalysisWarnings([])
    setIsAnalyzing(false)
    setBranchPromptStatus('idle')
    setBranchPromptLabel('')
    setBranchPromptProgress(0)

    const canResumeToPromptPage = resumeState.canResumeToPromptPage
      && isPromptGenerationComplete(resumeState.promptResults.amazonSet)
    const resolvedBranch = canResumeToPromptPage ? 'amazon-set' : null

    const resolvedPromptResult = resolvedBranch
      ? getPromptResultForBranch(resumeState.promptResults, resolvedBranch)
      : null
    const restoredPrompts = resolvedPromptResult
      ? {
          ...resolvedPromptResult.suggestedPrompts,
          ...(resolvedPromptResult.items || []).reduce<Record<string, string>>((accumulator, item) => {
            accumulator[item.slotId] = item.displayPrompt || item.prompt
            return accumulator
          }, {}),
        }
      : {}
    setEditedPrompts(restoredPrompts)

    setSelectedBranch(resolvedBranch)
    setEditedPrompt(
      resolvedBranch
        ? getSuggestedPrompt(
          resolvedPromptResult,
          resolvedBranch === 'amazon-set'
            ? 'main-white'
            : getDefaultAPlusPromptKey(getPromptResultForBranch(resumeState.promptResults, resolvedBranch)),
        )
        : '',
    )
    setSelectedImageType('main-white')
    setSelectedSize('1024x1024')

    if (resumeState.status === 'SUCCEEDED' && canResumeToPromptPage && resolvedPromptResult) {
      setIsStreamCompleted(true)
      setAnalysisStage('completed')
      setAnalysisStageLabel(options?.stageLabel || '已恢复 Amazon 图组 Prompt，可以继续编辑或生成图片')
      setAnalysisProgress(100)
      setCurrentStep('generate')
      if (options?.resumeMessage) {
        setResumeNotice(options.resumeMessage)
      }
      return
    }

    if (resumeState.status === 'STARTED') {
      setIsStreamCompleted(false)
      setAnalysisStage('analyzing')
      setAnalysisStageLabel(options?.stageLabel || '分析仍在服务端执行，正在尝试自动恢复结果')
      setAnalysisProgress(65)
      setCurrentStep('analysis')
      if (options?.resumeMessage) {
        setResumeNotice(options.resumeMessage)
      }
      return
    }

    setIsStreamCompleted(false)
    setAnalysisStage('error')
    setAnalysisStageLabel(
      options?.stageLabel
      || resumeState.errorMessage
      || '没有已保存的 Amazon 图组 Prompt，无法从历史记录恢复',
    )
    setAnalysisProgress(0)
    setCurrentStep('analysis')
    if (options?.resumeMessage) {
      setResumeNotice(options.resumeMessage)
    }
  }, [])

  const fetchAnalysisStatus = useCallback(async (targetAnalysisId: string) => {
    const response = await fetch(`/api/analyze/${targetAnalysisId}`, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(response.status === 404 ? '分析记录不存在' : `HTTP ${response.status}`)
    }

    return await response.json() as AnalysisStatusPayload
  }, [])

  const stopAnalysisPolling = useCallback(() => {
    if (analysisPollingRef.current) {
      window.clearInterval(analysisPollingRef.current)
      analysisPollingRef.current = null
    }
  }, [])

  const startPollingAnalysis = useCallback((targetAnalysisId: string) => {
    if (analysisPollingRef.current) {
      return
    }

    const pollOnce = async () => {
      try {
        const payload = await fetchAnalysisStatus(targetAnalysisId)
        if (payload.analysisId !== targetAnalysisId || analyzeAbortControllerRef.current?.signal.aborted) {
          return
        }

        if (payload.status === 'SUCCEEDED') {
          markLocalAnalysisCharge('amazon', amazonAnalysisCost)
        }

        applyRecoveredAnalysisState(payload, {
          stageLabel: payload.status === 'STARTED'
            ? '分析仍在服务端执行，正在自动恢复结果'
            : payload.status === 'SUCCEEDED'
              ? '分析已在服务端完成，结果已自动恢复'
              : payload.errorMessage || '分析未成功完成',
          resumeMessage: payload.status === 'STARTED'
            ? '流式连接已中断，但服务端任务仍在继续。系统会自动轮询恢复结果。'
            : payload.status === 'SUCCEEDED'
              ? '流式连接中断后，系统已从服务端自动恢复这次分析结果。'
              : '流式连接中断后，系统已同步到服务端的失败状态。',
        })

        if (!payload.active) {
          stopAnalysisPolling()
        }
      } catch (error) {
        console.error('Failed to poll analysis status:', error)
        const message = error instanceof Error ? error.message : '同步分析结果失败'
        setStreamError(message)
        setAnalysisStage('error')
        setAnalysisStageLabel(message)
        stopAnalysisPolling()
      }
    }

    void pollOnce()
    analysisPollingRef.current = window.setInterval(() => {
      void pollOnce()
    }, 5000)
  }, [amazonAnalysisCost, applyRecoveredAnalysisState, fetchAnalysisStatus, markLocalAnalysisCharge, stopAnalysisPolling])

  const startPollingGenerationRequest = useCallback((params: {
    requestId: string
    imageId: string
    fallbackPrompt: string
    fallbackImageType: string
    onSettled?: (status: 'SUCCEEDED' | 'FAILED') => void
  }) => {
    if (generationPollingRef.current.has(params.requestId)) {
      return
    }

    let settledReported = false

    const pollOnce = async () => {
      try {
        const response = await fetch(`/api/generate/${params.requestId}`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const payload = await response.json() as GenerationStatusPayload
        setGeneratedImages((prev) => prev.map((image) => {
          if (image.id !== params.imageId) {
            return image
          }

          const nextImage: GeneratedImage = {
            ...image,
            requestId: params.requestId,
            imageUrl: payload.imageUrl,
            prompt: payload.prompt || params.fallbackPrompt,
            revisedPrompt: payload.revisedPrompt || payload.prompt || image.revisedPrompt || params.fallbackPrompt,
            imageType: payload.imageType || image.imageType || params.fallbackImageType,
            size: (payload.size as RenderSize) || image.size,
            status: payload.status,
            statusMessage: payload.statusMessage,
            errorMessage: payload.errorMessage,
          }

          if (payload.status === 'SUCCEEDED' && !image.charged) {
            const billedCost = image.billedCost ?? generationCost
            setPointsBalance((current) => Math.max(0, Number((current - billedCost).toFixed(1))))
            void refreshPoints()
            nextImage.charged = true
            nextImage.billedCost = billedCost
          }

          return nextImage
        }))

        if (payload.active) {
          setRouteNotice(payload.statusMessage || '任务仍在执行中')
          return
        }

        const timerId = generationPollingRef.current.get(params.requestId)
        if (timerId) {
          window.clearInterval(timerId)
          generationPollingRef.current.delete(params.requestId)
        }

        if (!settledReported && (payload.status === 'SUCCEEDED' || payload.status === 'FAILED')) {
          settledReported = true
          params.onSettled?.(payload.status)
        }
        setRouteNotice(payload.errorMessage || payload.statusMessage || '')
      } catch (error) {
        console.error('Failed to poll image generation request:', error)
        const message = error instanceof Error ? error.message : '同步生成结果失败'
        setRouteNotice(message)
        setGeneratedImages((prev) => prev.map((image) => (
          image.id === params.imageId
            ? {
                ...image,
                statusMessage: message,
                errorMessage: image.errorMessage,
              }
            : image
        )))
      }
    }

    void pollOnce()
    const timerId = window.setInterval(() => {
      void pollOnce()
    }, 5000)
    generationPollingRef.current.set(params.requestId, timerId)
  }, [generationCost])

  useEffect(() => {
    if (!initialResumeState || appliedResumeIdRef.current === initialResumeState.analysisId) {
      return
    }

    appliedResumeIdRef.current = initialResumeState.analysisId
    stopAnalysisPolling()
    setReferenceImages([])
    setEditingImage(null)
    setUserGuidance('')
    setSelectedImageType('main-white')
    setSelectedSize('1024x1024')

    // 恢复这次分析记录下已绑定保存的图片，并对仍在进行中的图重新轮询。
    // 编辑/再次生成会向前追加，这里只负责把历史快照载入，不覆盖后续新加的图。
    const resumedImages: GeneratedImage[] = (initialResumeState.generatedImages || []).map((image: AmazonResumeImage) => ({
      id: image.id,
      requestId: image.requestId ?? image.id,
      imageUrl: image.imageUrl,
      prompt: image.prompt,
      revisedPrompt: image.revisedPrompt ?? image.prompt,
      imageType: image.imageType ?? '',
      size: (image.size as RenderSize | null) ?? undefined,
      status: image.status,
      statusMessage: image.statusMessage,
      errorMessage: image.errorMessage,
      // 已成功的图在服务端已扣过积分，标记 charged 避免本地重复扣减；进行中的图在轮询成功时再扣。
      charged: image.status === 'SUCCEEDED',
      billedCost: undefined,
    }))
    setGeneratedImages(resumedImages)
    resumedImages.forEach((image) => {
      if (image.status === 'QUEUED' || image.status === 'PROCESSING') {
        startPollingGenerationRequest({
          requestId: image.requestId || image.id,
          imageId: image.id,
          fallbackPrompt: image.prompt,
          fallbackImageType: image.imageType,
        })
      }
    })

    applyRecoveredAnalysisState(initialResumeState, {
      stageLabel: initialResumeState.status === 'SUCCEEDED'
        ? '已从历史记录恢复 Amazon 图组 Prompt，可以继续编辑或生成图片'
        : initialResumeState.status === 'STARTED'
          ? '这次分析仍在服务端执行，正在尝试自动恢复结果'
          : initialResumeState.errorMessage || '历史分析记录未完成，暂时无法继续生图',
      resumeMessage: initialResumeState.status === 'SUCCEEDED'
        ? `已从 ${formatDateTimeInBeijing(initialResumeState.createdAt)} 的分析记录恢复，当前继续使用已保存的参考图。`
        : initialResumeState.status === 'STARTED'
          ? '这次分析还在后台执行。系统会在当前页面自动轮询恢复结果。'
          : '这次历史分析没有完成，先查看错误信息后再决定是否重新分析。',
    })

    if (initialResumeState.status === 'STARTED') {
      startPollingAnalysis(initialResumeState.analysisId)
    }
  }, [applyRecoveredAnalysisState, initialResumeState, startPollingAnalysis, startPollingGenerationRequest, stopAnalysisPolling])

  const handleAnalyze = useCallback(async (data: AnalyzeFormInput) => {
    if (pointsBalance < amazonAnalysisCost) {
      alert(`积分不足，Amazon 商品分析需要 ${amazonAnalysisCostText} 积分，请先充值。`)
      return
    }

    const requestId = analyzeRequestIdRef.current + 1
    analyzeRequestIdRef.current = requestId
    analysisChargeRef.current = { amazon: false, aplus: false }
    analyzeAbortControllerRef.current?.abort()
    const abortController = new AbortController()
    analyzeAbortControllerRef.current = abortController
    stopAnalysisPolling()

    setIsAnalyzing(true)
    setAnalysisStartedAt(Date.now())
    setAnalysisElapsedMs(0)
    setBranchPromptStartedAt(null)
    setBranchPromptElapsedMs(0)
    setPromptGenerationError('')
    setStreamError('')
    setAnalysisWarnings([])
    setIsStreamCompleted(false)
    setAnalysisStage('preparing')
    setAnalysisStageLabel('正在读取商品信息与参考图')
    setAnalysisProgress(10)
    autoAmazonPromptRequestRef.current = false
    let analysisId = ''
    setAnalysisId('')
    setReferenceImages(data.referenceImages)
    setStoredReferenceImages([])
    setGeneratedImages([])
    setEditingImage(null)
    setUserGuidance('')
    setResumeNotice('')
    setBasicAnalysisResult(null)
    setAnalysisSections([])
    setPromptResults(EMPTY_PROMPT_RESULTS)
    setSelectedBranch(null)
    setBranchPromptStatus('idle')
    setBranchPromptLabel('')
    setBranchPromptProgress(0)
    setCurrentStep('analysis')
    setSelectedImageType('main-white')
    setSelectedSize('1024x1024')
    setEditedPrompt('')
    setEditedPrompts({})
    let receivedBasicAnalysis = false
    let streamFinished = false

    try {
      const formData = new FormData()
      formData.append('productName', data.productName)
      formData.append('description', data.description)
      formData.append('additionalRequirements', data.additionalRequirements)
      data.referenceImages.slice(0, AMAZON_REFERENCE_IMAGE_LIMIT).forEach((image) => {
        formData.append('referenceImages', image)
      })

      const response = await fetch('/api/analyze/stream', {
        method: 'POST',
        body: formData,
        signal: abortController.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error('Failed to start analysis stream')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as AnalyzeStreamEvent

          if (analyzeRequestIdRef.current !== requestId) {
            return
          }

          if (event.type === 'analysis-created' && event.analysisId) {
            analysisId = event.analysisId
            setAnalysisId(event.analysisId)
            continue
          }

          if (event.type === 'stage') {
            setAnalysisStage(event.stage || 'analyzing')
            setAnalysisStageLabel(event.label || '')
            setAnalysisProgress(event.progress || 0)
            continue
          }

          if (event.type === 'partial-analysis' && event.data) {
            receivedBasicAnalysis = true
            setBasicAnalysisResult(event.data as BasicAnalysisResult)
            continue
          }

          if (event.type === 'analysis-stage' && event.data) {
            const stage = event.data as AmazonAnalysisStageResult
            setAnalysisSections((previous) => [
              ...previous.filter((item) => item.key !== stage.key),
              stage,
            ])
            continue
          }

          if (event.type === 'amazon-prompts' && event.data) {
            const result = event.data as PromptGenerationResult
            setPromptResults((previous) => ({ ...previous, amazonSet: result }))
            setSelectedBranch('amazon-set')
            setEditedPrompts({
              ...result.suggestedPrompts,
              ...(result.items || []).reduce<Record<string, string>>((accumulator, item) => {
                accumulator[item.slotId] = item.displayPrompt || item.prompt
                return accumulator
              }, {}),
            })
            continue
          }

          if (event.type === 'warning' && event.message) {
            setAnalysisWarnings((prev) => [...prev, event.message as string])
            continue
          }

          if (event.type === 'error') {
            setStreamError(event.message || '分析失败')
            setPromptGenerationError('')
            setAnalysisStage('error')
            setAnalysisStageLabel(event.message || '分析失败')
            setIsAnalyzing(false)
            continue
          }

          if (event.type === 'done') {
            streamFinished = true
            markLocalAnalysisCharge('amazon', amazonAnalysisCost)
            setIsStreamCompleted(true)
            setIsAnalyzing(false)
            setAnalysisStage('completed')
            setAnalysisStageLabel('分析完成，已生成 Amazon 图组 Prompt')
            setAnalysisProgress(100)
            setSelectedImageType('main-white')
            setSelectedSize('1024x1024')
            setCurrentStep('generate')
          }
        }
      }

      if (buffer.trim() && analyzeRequestIdRef.current === requestId) {
        const event = JSON.parse(buffer) as AnalyzeStreamEvent
        if (event.type === 'done') {
          streamFinished = true
          markLocalAnalysisCharge('amazon', amazonAnalysisCost)
          setIsStreamCompleted(true)
          setIsAnalyzing(false)
          setAnalysisStage('completed')
          setAnalysisStageLabel('分析完成，已生成 Amazon 图组 Prompt')
          setAnalysisProgress(100)
          setCurrentStep('generate')
        }
      }

      if (!streamFinished && analyzeRequestIdRef.current === requestId) {
        throw new Error('分析流意外中断')
      }
    } catch (error) {
      if (analyzeRequestIdRef.current !== requestId) return
      if (abortController.signal.aborted) {
        return
      }
      console.error('Error analyzing product:', error)
      const message = error instanceof Error ? error.message : 'Failed to analyze product. Please check your API keys.'

      if (!receivedBasicAnalysis && analysisId) {
        try {
          const payload = await fetchAnalysisStatus(analysisId)
          applyRecoveredAnalysisState(payload, {
            stageLabel: payload.status === 'STARTED'
              ? '流式连接已中断，分析仍在服务端执行'
              : payload.status === 'SUCCEEDED'
                ? '分析已在服务端完成，结果已自动恢复'
                : payload.errorMessage || '分析未成功完成',
            resumeMessage: payload.status === 'STARTED'
              ? '流式连接已中断，但服务端任务仍在继续。系统会自动轮询恢复结果。'
              : payload.status === 'SUCCEEDED'
                ? '流式连接中断后，系统已从服务端自动恢复这次分析结果。'
                : '流式连接中断后，系统已同步到服务端的失败状态。',
          })

          if (payload.active) {
            startPollingAnalysis(analysisId)
          }
          return
        } catch (recoveryError) {
          console.error('Failed to recover analysis after stream interruption:', recoveryError)
        }
      }

      setStreamError(message)
      setAnalysisStage('error')
      setAnalysisStageLabel(message)
      if (!receivedBasicAnalysis) {
        setCurrentStep('input')
        setBasicAnalysisResult(null)
        setPromptResults(EMPTY_PROMPT_RESULTS)
        setPromptGenerationError('')
      }
      setIsAnalyzing(false)
    }
  }, [amazonAnalysisCost, amazonAnalysisCostText, applyRecoveredAnalysisState, fetchAnalysisStatus, markLocalAnalysisCharge, pointsBalance, startPollingAnalysis, stopAnalysisPolling])

  const handleGenerateBranchPrompts = useCallback(async (branch: AmazonBranch) => {
    if (!analysisId) {
      setPromptGenerationError('缺少分析记录 ID，请重新分析后再试。')
      return
    }

    if (branch === 'aplus' && pointsBalance < aplusAnalysisCost) {
      alert(`积分不足，A+ 分析需要 ${aplusAnalysisCostText} 积分，请先充值。`)
      return
    }

    const isAppendingAPlus = branch === 'aplus' && currentStep === 'generate' && Boolean(promptResults.amazonSet)
    if (!isAppendingAPlus) {
      setSelectedBranch(branch)
    }
    if (!isAppendingAPlus) {
      setGeneratedImages([])
      setEditingImage(null)
    }
    setRouteNotice('')
    setBranchPromptStatus('preparing')
    setBranchPromptLabel('正在读取基础分析结果和参考图信息')
    setBranchPromptProgress(12)
    const promptStartedAt = Date.now()
    setBranchPromptStartedAt(promptStartedAt)
    setBranchPromptElapsedMs(0)
    setPromptGenerationError('')
    setStreamError('')
    const progressTimers = [
      window.setTimeout(() => {
        setBranchPromptStatus('analyzing')
        setBranchPromptLabel(`正在生成${branch === 'aplus' ? ' A+ ' : ' Amazon 图组 '}提示词`)
        setBranchPromptProgress(56)
      }, 450),
      window.setTimeout(() => {
        setBranchPromptStatus('saving')
        setBranchPromptLabel('正在整理并保存提示词结果')
        setBranchPromptProgress(84)
      }, 1300),
    ]

    try {
      const response = await fetch('/api/analyze/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId,
          branch,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '提示词生成失败')
      }

      const result = payload.result as PromptGenerationResult | APlusPromptGenerationResult
      if (branch === 'aplus' && payload.charged === true) {
        markLocalAnalysisCharge('aplus', aplusAnalysisCost)
      }
      progressTimers.forEach((timer) => window.clearTimeout(timer))
      setBranchPromptElapsedMs(Date.now() - promptStartedAt)
      setPromptResults((prev) => ({
        ...prev,
        amazonSet: branch === 'amazon-set' ? result as PromptGenerationResult : prev.amazonSet,
        aplus: branch === 'aplus' ? result as APlusPromptGenerationResult : prev.aplus,
      }))
      setSelectedBranch(branch)
      if (branch === 'amazon-set') {
        const amazonResult = result as PromptGenerationResult
        setEditedPrompts({
          ...amazonResult.suggestedPrompts,
          ...(amazonResult.items || []).reduce<Record<string, string>>((accumulator, item) => {
            accumulator[item.slotId] = item.displayPrompt || item.prompt
            return accumulator
          }, {}),
        })
      }
      setBranchPromptStatus('completed')
      setBranchPromptLabel(isAppendingAPlus ? 'A+ Prompt 已附加到当前页面' : 'Prompt 已生成，正在进入图片生成页')
      setBranchPromptProgress(100)
      const defaultPromptKey: PromptKey = branch === 'amazon-set' ? 'main-white' : getDefaultAPlusPromptKey(result)
      setSelectedImageType(defaultPromptKey)
      setSelectedSize(getDefaultSizeForType(defaultPromptKey))
      setEditedPrompt(getSuggestedPrompt(result, defaultPromptKey))
      setCurrentStep('generate')
      setBranchPromptStatus('idle')
      setBranchPromptLabel('')
      setBranchPromptProgress(0)
    } catch (error) {
      progressTimers.forEach((timer) => window.clearTimeout(timer))
      setBranchPromptElapsedMs(Date.now() - promptStartedAt)
      console.error('Error generating branch prompts:', error)
      setPromptGenerationError(error instanceof Error ? error.message : '提示词生成失败')
      setBranchPromptStatus('error')
      setBranchPromptLabel('')
      setBranchPromptProgress(0)
    }
  }, [analysisId, aplusAnalysisCost, aplusAnalysisCostText, currentStep, markLocalAnalysisCharge, pointsBalance, promptResults.amazonSet])

  useEffect(() => {
    if (
      currentStep !== 'analysis'
      || !isStreamCompleted
      || !basicAnalysisResult
      || promptResults.amazonSet
      || autoAmazonPromptRequestRef.current
    ) {
      return
    }

    autoAmazonPromptRequestRef.current = true
    void handleGenerateBranchPrompts('amazon-set')
  }, [basicAnalysisResult, currentStep, handleGenerateBranchPrompts, isStreamCompleted, promptResults.amazonSet])

  const handleGenerateSingle = useCallback(async (
    typeOverride?: PromptKey,
    promptOverride?: string,
    sizeOverride?: RenderSize,
    includeContextualHints = true,
  ) => {
    if (!basicAnalysisResult || !selectedBranch || isGenerating) return
    if (!activeReferenceImageCount) {
      alert('请先上传至少一张参考图，或从历史分析记录恢复参考图后再生成。')
      return
    }
    const generationType = typeOverride || selectedImageType
    const generationCostForImage = getGenerationCostDisplay(generationType.startsWith('aplus-') ? 'aplus' : 'amazon')
    if (pointsBalance < generationCostForImage) {
      alert('积分不足，请先充值后再生成图片。')
      return
    }

    const generationPrompt = getPromptForGeneration(
      currentPromptResult as PromptGenerationResult | null,
      generationType,
      promptOverride || editedPrompts[generationType] || editedPrompt,
    )
    const generationSize = sizeOverride || selectedSize

    setIsGenerating(true)
    setRouteNotice('正在提交任务到图片服务')

    try {
      const result = await requestGenerate(generationType, generationPrompt, generationSize, includeContextualHints)

      if (result.kind === 'queued') {
        const imageId = result.data.requestId
        setGeneratedImages((prev) => [{
          id: imageId,
          requestId: result.data.requestId,
          imageUrl: null,
          prompt: result.prompt,
          revisedPrompt: result.prompt,
          imageType: result.imageType,
          size: result.size,
          status: 'QUEUED',
          statusMessage: result.data.statusMessage,
          errorMessage: null,
          charged: false,
          billedCost: generationCostForImage,
        }, ...prev])
        startPollingGenerationRequest({
          requestId: result.data.requestId,
          imageId,
          fallbackPrompt: result.prompt,
          fallbackImageType: result.imageType,
        })
      } else {
        const newImage: GeneratedImage = {
          id: createImageId(),
          requestId: result.data.requestId,
          imageUrl: result.data.imageUrl,
          prompt: result.data.prompt,
          revisedPrompt: result.data.prompt,
          imageType: generationType,
          size: result.data.size,
          status: 'SUCCEEDED',
          charged: true,
          billedCost: generationCostForImage,
        }
        setGeneratedImages((prev) => [newImage, ...prev])
        setPointsBalance((prev) => Math.max(0, Number((prev - newImage.billedCost!).toFixed(1))))
        void refreshPoints()
      }
    } catch (error) {
      console.error('Error generating image:', error)
      const message = error instanceof Error ? error.message : 'Failed to generate image. Please check your API keys.'
      setRouteNotice(message)
      alert(message)
    } finally {
      setIsGenerating(false)
    }
  }, [activeReferenceImageCount, basicAnalysisResult, currentPromptResult, editedPrompt, editedPrompts, isGenerating, pointsBalance, requestGenerate, selectedBranch, selectedImageType, selectedSize, startPollingGenerationRequest])

  const handleGenerateAll = useCallback(async () => {
    if (!basicAnalysisResult || isGenerating || !amazonPromptResult) return
    if (!activeReferenceImageCount) {
      alert('请先上传至少一张参考图，或从历史分析记录恢复参考图后再生成。')
      return
    }

    const items = getAmazonGalleryItems(amazonPromptResult)
    const requiredPoints = items.length * amazonGenerationCost
    if (pointsBalance < requiredPoints) {
      alert(`积分不足，生成整套 ${items.length} 张图片需要 ${formatPoints(requiredPoints)} 积分，请先充值。`)
      return
    }

    setIsGenerating(true)
    setRouteNotice(`正在提交整套图片任务（${items.length} 张）`)
    const batchSummary = {
      total: items.length,
      finished: 0,
      succeeded: 0,
      failed: 0,
    }
    const reportBatchStatus = (status: 'SUCCEEDED' | 'FAILED') => {
      batchSummary.finished += 1
      if (status === 'SUCCEEDED') {
        batchSummary.succeeded += 1
      } else {
        batchSummary.failed += 1
      }

      if (batchSummary.finished === batchSummary.total) {
        setRouteNotice(`整套生成完成：成功 ${batchSummary.succeeded} 张，失败 ${batchSummary.failed} 张，按成功图片数量扣费。`)
      }
    }

    try {
      for (const item of items) {
        const prompt = getPromptForGeneration(
          currentPromptResult as PromptGenerationResult,
          item.slotId,
          editedPrompts[item.slotId] || item.displayPrompt || item.prompt,
        )
        try {
          const result = await requestGenerate(
            item.slotId,
            prompt,
            item.size === '2048x2048' ? '2048x2048' : '1024x1024',
            false,
          )

          if (result.kind === 'queued') {
            const imageId = result.data.requestId
            setGeneratedImages((previous) => [{
              id: imageId,
              requestId: result.data.requestId,
              imageUrl: null,
              prompt: result.prompt,
              revisedPrompt: result.prompt,
              imageType: result.imageType,
              size: result.size,
              status: 'QUEUED',
              statusMessage: result.data.statusMessage,
              errorMessage: null,
              charged: false,
              billedCost: amazonGenerationCost,
            }, ...previous])
            startPollingGenerationRequest({
              requestId: result.data.requestId,
              imageId,
              fallbackPrompt: result.prompt,
              fallbackImageType: result.imageType,
              onSettled: reportBatchStatus,
            })
          } else {
            const newImage: GeneratedImage = {
              id: createImageId(),
              requestId: result.data.requestId,
              imageUrl: result.data.imageUrl,
              prompt: result.data.prompt,
              revisedPrompt: result.data.prompt,
              imageType: result.data.imageType,
              size: result.data.size,
              status: 'SUCCEEDED',
              charged: true,
              billedCost: amazonGenerationCost,
            }
            setGeneratedImages((previous) => [newImage, ...previous])
            setPointsBalance((previous) => Math.max(0, Number((previous - amazonGenerationCost).toFixed(1))))
            reportBatchStatus('SUCCEEDED')
          }
        } catch (error) {
          reportBatchStatus('FAILED')
          console.error(`Error generating ${item.slotId}:`, error)
        }
        if (batchSummary.finished < batchSummary.total) {
          setRouteNotice(`整套任务已提交：${batchSummary.finished}/${items.length} 张已完成，等待其余结果。`)
        }
      }
      void refreshPoints()
      if (batchSummary.finished < batchSummary.total) {
        setRouteNotice(`整套任务已提交，等待生成完成；最终按成功图片数量扣费。`)
      }
    } finally {
      setIsGenerating(false)
    }
  }, [activeReferenceImageCount, amazonGenerationCost, amazonPromptResult, basicAnalysisResult, editedPrompts, isGenerating, pointsBalance, requestGenerate, refreshPoints, startPollingGenerationRequest])

  const handleEditImage = useCallback(async () => {
    if (!editingImage || !editingImage.imageUrl || isGenerating) return
    if (!editingImage.prompt.trim()) {
      alert('请先填写这次编辑想做的修改。')
      return
    }
    if (!hasEnoughPointsToEdit) {
      alert(`积分不足，再次编辑需要 ${editImageCostText} 积分/张，请先充值。`)
      return
    }

    setIsGenerating(true)
    setRouteNotice('正在提交编辑任务到图片服务')

    try {
      const result = await requestEditImage(
        editingImage.imageUrl,
        editingImage.prompt,
        editingImage.imageType,
        editingImage.size,
      )

      if (result.kind === 'queued') {
        const imageId = result.data.requestId
        // 编辑结果作为新卡片追加到网格头部，原图保留
        setGeneratedImages((prev) => [{
          id: imageId,
          requestId: result.data.requestId,
          imageUrl: null,
          prompt: result.prompt,
          revisedPrompt: result.prompt,
          imageType: result.imageType,
          size: result.size,
          status: 'QUEUED',
          statusMessage: result.data.statusMessage,
          errorMessage: null,
          charged: false,
          billedCost: editImageCost,
        }, ...prev])
        setEditingImage(null)
        startPollingGenerationRequest({
          requestId: result.data.requestId,
          imageId,
          fallbackPrompt: result.prompt,
          fallbackImageType: result.imageType,
        })
      } else {
        const newImage: GeneratedImage = {
          id: createImageId(),
          requestId: result.data.requestId,
          imageUrl: result.data.imageUrl,
          prompt: result.data.prompt,
          revisedPrompt: result.data.prompt,
          imageType: editingImage.imageType,
          size: result.data.size,
          status: 'SUCCEEDED',
          charged: true,
          billedCost: editImageCost,
        }
        setGeneratedImages((prev) => [newImage, ...prev])
        setEditingImage(null)
        setPointsBalance((prev) => Math.max(0, Number((prev - newImage.billedCost!).toFixed(1))))
        void refreshPoints()
      }
    } catch (error) {
      console.error('Error editing image:', error)
      const message = error instanceof Error ? error.message : 'Failed to edit image. Please check your API keys.'
      setRouteNotice(message)
      alert(message)
    } finally {
      setIsGenerating(false)
    }
  }, [editImageCost, editImageCostText, editingImage, hasEnoughPointsToEdit, isGenerating, requestEditImage, startPollingGenerationRequest])

  const handleDownload = async (image: GeneratedImage) => {
    try {
      if (!image.imageUrl) return
      const link = document.createElement('a')
      link.href = `/api/download?requestId=${encodeURIComponent(image.requestId || '')}&url=${encodeURIComponent(image.imageUrl)}&filename=${encodeURIComponent(`amazon-product-${image.id}.png`)}`
      link.download = `amazon-product-${image.id}.png`
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Failed to download:', err)
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amazon-dark text-white shadow-sm">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </Link>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">亚马逊工作流</div>
              <h1 className="text-xl font-semibold text-slate-950">Amazon 图片工作流</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="panel mb-8 overflow-hidden px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                先分析商品，再生成适合 Amazon 的图片。
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
                输入商品信息并上传参考图，系统会自动整理 Amazon 图组 Prompt；Amazon 分析成功扣 {amazonAnalysisCostText} 积分，A+ 分析成功扣 {aplusAnalysisCostText} 积分。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { step: '01', label: '填写商品信息' },
                { step: '02', label: '自动生成 Prompt' },
                { step: '03', label: '编辑 Prompt' },
                { step: '04', label: '生成图片' },
              ].map((item) => (
                <div key={item.step} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold text-slate-400">{item.step}</div>
                  <div className="mt-1 text-sm font-medium text-slate-800">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {resumeNotice && (
          <section className="mb-6 rounded-3xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-800">
            {resumeNotice}
          </section>
        )}

        <div>
          <section className="space-y-6">
            {currentStep === 'input' && (
              <ProductInput onAnalyze={handleAnalyze} isLoading={isAnalyzing} analysisCostText={amazonAnalysisCostText} />
            )}

            {currentStep === 'analysis' && (
              <div className="panel space-y-8 p-6 sm:p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      正在准备图片 Prompt
                    </span>
                    <h3 className="mt-3 text-2xl font-semibold text-slate-950">AI 正在整理整套 Amazon 图片</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      系统会自动根据商品信息和参考图生成主图与副图 Prompt，完成后直接展示给你编辑。
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                      <span className="rounded-full bg-slate-100 px-3 py-1">4 个分析模块并行</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">当前已用时 {formatElapsedTime(analysisElapsedMs)}</span>
                    </div>
                  </div>
                </div>

                <TaskStatusPanel
                  title="准备状态"
                  stage={analysisStage}
                  label={analysisStageLabel}
                  progress={analysisProgress}
                  warnings={analysisWarnings}
                    helperText={`四个分析模块会并发执行，分析成功后扣 ${amazonAnalysisCostText} 积分，并直接生成 Amazon 图组 Prompt。`}
                  elapsedText={formatElapsedTime(analysisElapsedMs)}
                  steps={[
                    { key: 'preparing', label: '读取商品信息' },
                    { key: 'analyzing', label: '并行分析 4 个模块' },
                    { key: 'prompting', label: '生成图组 Prompt' },
                    { key: 'completed', label: '完成' },
                  ]}
                />

                {analysisSections.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {analysisSections.map((section) => (
                      <div key={section.key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold text-slate-900">{section.title}</h4>
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">已完成</span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-600">{section.summary}</p>
                        {section.points.length > 0 && (
                          <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-500">
                            {section.points.slice(0, 6).map((point) => <li key={point}>· {point}</li>)}
                          </ul>
                        )}
                        {section.cautions.length > 0 && (
                          <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                            注意：{section.cautions.join('；')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {branchPromptStatus !== 'idle' && (
                  <TaskStatusPanel
                    title="补充生成 A+ Prompt"
                    stage={branchPromptStatus}
                    label={branchPromptLabel || '正在等待 A+ Prompt 生成结果'}
                    progress={branchPromptProgress}
                    warnings={[]}
                        helperText={`A+ 分析成功后扣 ${aplusAnalysisCostText} 积分，会在 Amazon Prompt 页面中附加显示，不影响 Amazon 图组。`}
                    elapsedText={formatElapsedTime(branchPromptElapsedMs)}
                    steps={[
                      { key: 'preparing', label: '读取分析' },
                      { key: 'analyzing', label: '生成 A+ Prompt' },
                      { key: 'saving', label: '保存结果' },
                      { key: 'completed', label: '完成' },
                    ]}
                  />
                )}

                {streamError && (
                  <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                    {streamError}
                  </div>
                )}
                {promptGenerationError && basicAnalysisResult && (
                  <div className="flex flex-col gap-3 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between">
                    <span>{promptGenerationError}</span>
                    <button
                      type="button"
                      onClick={() => handleGenerateBranchPrompts('amazon-set')}
                      disabled={branchPromptStatus !== 'idle' && branchPromptStatus !== 'error'}
                      className="rounded-xl bg-amazon-blue px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      重试生成 Prompt
                    </button>
                  </div>
                )}
              </div>
            )}

            {currentStep === 'generate' && basicAnalysisResult && currentPromptResult && selectedBranch && (
              <>
                <div className="panel p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        Amazon 图片 Prompt
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-slate-900">生成方式</h3>
                        <p className="mt-1 text-sm text-slate-500">
                        Amazon 图组可以整套生成或逐张生成，普通图片成功一张扣 {formatPoints(amazonGenerationCost)} 积分；A+ Prompt 需要时可从右上角继续附加，A+ 图片成功一张扣 {generationCostText} 积分。
                      </p>
                      {storedReferenceImages.length > 0 && referenceImages.length === 0 && (
                        <p className="mt-2 text-sm text-sky-700">当前正在复用历史分析里保存的 {storedReferenceImages.length} 张参考图。</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      {selectedBranch === 'amazon-set' && !promptResults.aplus && (
                        <button
                          type="button"
                          onClick={() => handleGenerateBranchPrompts('aplus')}
                          disabled={branchPromptStatus !== 'idle' && branchPromptStatus !== 'error'}
                          className="rounded-2xl border border-amazon-orange bg-orange-50 px-5 py-3 text-sm font-semibold text-amazon-orange transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {branchPromptStatus !== 'idle' && branchPromptStatus !== 'error' ? 'A+ Prompt 生成中...' : `继续生成 A+ Prompt（${aplusAnalysisCostText} 积分）`}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {branchPromptStatus !== 'idle' && (
                  <TaskStatusPanel
                    title="补充生成 A+ Prompt"
                    stage={branchPromptStatus}
                    label={branchPromptLabel || '正在等待 A+ Prompt 生成结果'}
                    progress={branchPromptProgress}
                    warnings={[]}
                    helperText={`A+ 会附加到当前 Prompt 页面，不影响已生成的 Amazon 图组；A+ 分析成功扣 ${aplusAnalysisCostText} 积分，图片成功一张扣 ${generationCostText} 积分。`}
                    elapsedText={formatElapsedTime(branchPromptElapsedMs)}
                    steps={[
                      { key: 'preparing', label: '读取分析' },
                      { key: 'analyzing', label: '生成 A+ Prompt' },
                      { key: 'saving', label: '保存结果' },
                      { key: 'completed', label: '完成' },
                    ]}
                  />
                )}

                {routeNotice && (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                    <p>{routeNotice}</p>
                  </div>
                )}

                {amazonPromptResult && (
                <div className="panel p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        Amazon 图片 Prompt
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        已自动整理 {getAmazonGalleryItems(amazonPromptResult).length} 张图片。普通 Amazon 图片成功一张扣 {formatPoints(amazonGenerationCost)} 积分；失败图片不扣费。
                      </p>
                    </div>
                    {amazonPromptResult && (
                      <button
                        type="button"
                        onClick={handleGenerateAll}
                        disabled={isGenerating}
                        className="inline-flex items-center justify-center rounded-2xl bg-amazon-orange px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {isGenerating ? '整套提交中...' : `生成整套图片（${formatPoints(amazonGenerationCost)} 积分/张）`}
                      </button>
                    )}
                  </div>

                  <div className="mt-6 space-y-4">
                      {getAmazonGalleryItems(amazonPromptResult).map((item, index) => (
                        <div key={item.slotId} className="rounded-3xl border border-slate-200 bg-white p-5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {item.slotId === 'main-white' ? '主图' : `副图 ${index}`} · {item.title}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">{item.visualForm}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleGenerateSingle(
                                item.slotId,
                                getPromptForGeneration(
                                  amazonPromptResult,
                                  item.slotId,
                                  editedPrompts[item.slotId] || item.displayPrompt || item.prompt,
                                ),
                                item.size === '2048x2048' ? '2048x2048' : '1024x1024',
                                false,
                              )}
                              disabled={isGenerating || !(editedPrompts[item.slotId] || item.displayPrompt || item.prompt).trim()}
                              className="rounded-xl bg-amazon-blue px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                            >
                              生成此图（{formatPoints(amazonGenerationCost)} 积分）
                            </button>
                          </div>
                          <textarea
                            value={editedPrompts[item.slotId] || item.displayPrompt || item.prompt}
                            onChange={(event) => setPromptValue(item.slotId, event.target.value)}
                            rows={6}
                            className="input-field mt-4 min-h-[148px] resize-y"
                            aria-label={`${item.title} Prompt`}
                          />
                        </div>
                      ))}
                  </div>

                  {selectedBranch !== 'amazon-set' && (
                    <>
                    <div className="mt-8 border-t border-slate-200 pt-6">
                      <h3 className="text-lg font-semibold text-slate-900">A+ Prompt</h3>
                      <p className="mt-1 text-sm text-slate-500">A+ 模块 Prompt 已附加到当前页面，保持独立的横版模块编排和计费。</p>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {getAPlusOptionSet(currentPromptResult).map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSelectedImageType(option.value)
                          setSelectedSize(getDefaultSizeForType(option.value))
                          setEditedPrompt(getSuggestedPrompt(currentPromptResult, option.value))
                        }}
                        className={`rounded-2xl border p-4 text-left transition ${
                          selectedImageType === option.value
                            ? 'border-amazon-orange bg-orange-50 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="font-medium text-slate-800">{option.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{option.description}</div>
                      </button>
                    ))}
                    </div>
                    </>
                  )}

                  <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition-colors hover:border-slate-300">
                    <input
                      type="checkbox"
                      checked={containsSyntheticPerformer}
                      onChange={(event) => setContainsSyntheticPerformer(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amazon-blue focus:ring-amazon-blue"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">图片含逼真 AI 生成人物</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">勾选后，本次生成图片下载时会自动写入 Amazon 合规元数据：contains-synthetic-performer。</span>
                    </span>
                  </label>

                  {selectedBranch !== 'amazon-set' && (
                  <div className="mt-6">
                    <label className="mb-3 block text-sm font-medium text-slate-800">
                      补充要求（选填）
                    </label>
                    <textarea
                      value={userGuidance}
                      onChange={(e) => setUserGuidance(e.target.value)}
                      rows={4}
                      className="input-field min-h-[116px] resize-none"
                      placeholder="比如：四张图统一暖白家居风、像同一页 A+ 页面切片、第二张更强调展开方式、第四张带简洁参数区等"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      这部分会在生成时附加到当前推荐提示词后面，不会改写系统已经生成好的基础策略。
                    </p>
                  </div>
                  )}

                  {selectedBranch !== 'amazon-set' && (
                  <div className="mt-6">
                    <label className="mb-3 block text-sm font-medium text-slate-800">
                      AI 原始提示词
                    </label>
                    <textarea
                      value={editedPrompt}
                      onChange={(e) => setEditedPrompt(e.target.value)}
                      rows={8}
                      className="input-field min-h-[180px] resize-none"
                      placeholder="在这里微调提示词..."
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      生成时会自动拼接上方的参考图策略和补充要求。
                    </p>
                  </div>
                  )}

                  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm text-slate-700">
                      通常生成 1 张图片约需 90 秒到 2 分钟，生成 2K 图片通常更久。
                    </p>
                  </div>

                  {isGenerating && routeNotice ? (
                    <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                      <p>{routeNotice}</p>
                    </div>
                  ) : null}

                  {selectedBranch !== 'amazon-set' && (<button
                    onClick={() => handleGenerateSingle()}
                    disabled={isGenerating || !editedPrompt.trim()}
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amazon-blue px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {isGenerating ? (
                      <>
                        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      `生成当前 A+ 区段图（${generationCostText} 积分）`
                    )}
                  </button>)}
                </div>
                )}

                {generatedImages.length > 0 && (
                  <div className="panel p-6">
                    <h3 className="text-lg font-semibold text-slate-900">已生成图片</h3>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {generatedImages.map((image) => (
                        <div key={image.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                          {image.imageUrl ? (
                            <img
                              src={image.imageUrl}
                              alt="Generated product"
                              role="button"
                              tabIndex={0}
                              onClick={() => setPreviewImage(image)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  setPreviewImage(image)
                                }
                              }}
                              aria-label="点击放大图片"
                              className={`${image.imageType.startsWith('aplus-') ? 'aspect-[8/5]' : 'aspect-square'} w-full cursor-zoom-in object-cover transition-opacity hover:opacity-90`}
                            />
                          ) : (
                            <div className={`${image.imageType.startsWith('aplus-') ? 'aspect-[8/5]' : 'aspect-square'} flex w-full items-center justify-center bg-slate-100 text-sm text-slate-400`}>
                              {image.status === 'FAILED' ? '生成失败' : '生成中'}
                            </div>
                          )}
                          <div className="p-4">
                            <div className="mb-2 text-xs text-slate-500">
                              {getImageTypeLabel(image.imageType, currentPromptResult)}
                            </div>
                            <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1">{image.status}</span>
                              {image.size && <span className="rounded-full bg-slate-100 px-2.5 py-1">{image.size}</span>}
                            </div>
                            {image.statusMessage && image.status !== 'SUCCEEDED' && (
                              <p className="mb-3 text-xs leading-5 text-slate-500">{image.statusMessage}</p>
                            )}
                            {image.errorMessage && (
                              <p className="mb-3 text-xs leading-5 text-rose-600">{image.errorMessage}</p>
                            )}
                            <div className="flex gap-2">
                              {image.imageUrl && image.status === 'SUCCEEDED' && (
                                <>
                                  <button
                                    onClick={() => setEditingImage({ ...image, prompt: '' })}
                                    className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                                  >
                                    再次编辑
                                  </button>
                                  <button
                                    onClick={() => handleDownload(image)}
                                    className="flex-1 rounded-xl bg-amazon-blue px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-600"
                                  >
                                    Download
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {editingImage && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-image-title"
              >
                <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h3 id="edit-image-title" className="text-lg font-semibold text-slate-900">
                      再次编辑 - {getImageTypeLabel(editingImage.imageType, currentPromptResult)}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEditingImage(null)}
                      aria-label="关闭再次编辑弹窗"
                      className="rounded-full px-2 text-2xl leading-8 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      ×
                    </button>
                  </div>

                  <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
                    将以上图作为参考图进行再次编辑，按自有生图标准计费，每张成功结果扣 <span className="font-semibold">{editImageCostText}</span> 积分，失败不扣费。编辑结果会作为一张新图追加到上方网格。
                  </p>

                  <div className="mb-5 flex justify-center rounded-2xl bg-slate-50 p-3">
                    <img
                      src={editingImage.imageUrl || ''}
                      alt="Editing"
                      className="max-h-[38vh] max-w-md rounded-2xl border border-slate-200 object-contain"
                    />
                  </div>

                  <div className="mb-5">
                    <label className="mb-2 block text-sm font-medium text-slate-800">
                      编辑提示词
                    </label>
                    <textarea
                      value={editingImage.prompt}
                      onChange={(e) => setEditingImage({ ...editingImage, prompt: e.target.value })}
                      rows={5}
                      className="input-field min-h-[128px] resize-y"
                      placeholder="描述这次想在原图基础上做的修改，比如：把背景换成纯白、放大某个细节、去掉画面里的文字……"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleEditImage}
                    disabled={isGenerating || !editingImage.prompt.trim()}
                    className="w-full rounded-2xl bg-amazon-orange px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {isGenerating ? '编辑中...' : `再次编辑（${editImageCostText} 积分/张）`}
                  </button>
                </div>
              </div>
            )}

            {previewImage?.imageUrl && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="preview-image-title"
                onClick={() => setPreviewImage(null)}
              >
                <div
                  className="relative flex max-h-[90vh] max-w-5xl items-center justify-center rounded-3xl bg-white p-3 shadow-2xl sm:p-5"
                  onClick={(event) => event.stopPropagation()}
                >
                  <h3 id="preview-image-title" className="sr-only">
                    放大预览 - {getImageTypeLabel(previewImage.imageType, currentPromptResult)}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setPreviewImage(null)}
                    aria-label="关闭图片预览"
                    className="absolute right-3 top-3 z-10 rounded-full bg-slate-900/70 px-3 text-2xl leading-9 text-white transition hover:bg-slate-900"
                  >
                    ×
                  </button>
                  <img
                    src={previewImage.imageUrl}
                    alt="放大预览"
                    className="max-h-[82vh] max-w-full rounded-2xl object-contain"
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
