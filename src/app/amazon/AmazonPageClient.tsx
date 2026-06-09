'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import ProductInput from '@/components/ProductInput'
import LoadingSpinner, { SkeletonBlock } from '@/components/LoadingSpinner'
import {
  APlusPromptGenerationResult,
  AmazonBranch,
  AmazonPromptKey,
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
import { formatPoints, GenerationBillingScene, getGenerationCostDisplay } from '@/lib/points-config'

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
  aspectRatio?: string
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
  statusMessage?: string | null
  errorMessage?: string | null
  charged?: boolean
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
  aspectRatio: string | null
  active: boolean
  routeSummary: RouteSummary | null
}

type AnalysisStage = 'idle' | 'preparing' | 'analyzing' | 'completed' | 'error'
type TaskStatus = 'idle' | 'preparing' | 'analyzing' | 'saving' | 'completed' | 'error'

interface AnalyzeStreamEvent {
  type: 'analysis-created' | 'stage' | 'partial-analysis' | 'warning' | 'error' | 'done'
  analysisId?: string
  stage?: Exclude<AnalysisStage, 'idle' | 'error'>
  label?: string
  progress?: number
  data?: BasicAnalysisResult
  message?: string
  recoverable?: boolean
}

interface AnalyzeFormInput {
  productName: string
  description: string
  category: string
  targetAudience: string
  referenceImages: File[]
}

const imageTypeOptions: ImageTypeOption[] = [
  { value: 'main-white', label: '白底主图', description: '主图合规与点击优先' },
  { value: 'size', label: '尺寸图', description: '建立尺寸与比例认知' },
  { value: 'detail', label: '细节图', description: '强调材质与做工' },
  { value: 'infographic-1', label: '卖点图一', description: '第一张卖点图，聚焦最强卖点' },
  { value: 'infographic-2', label: '卖点图二', description: '第二张卖点图，拆分补充信息' },
  { value: 'lifestyle-1', label: '场景图一', description: '深化展示一个核心使用场景' },
  { value: 'lifestyle-2', label: '场景图二', description: '优先多场景拼图，也可第二场景' },
]

const aplusImageTypeOptions: ImageTypeOption[] = [
  { value: 'aplus-hero', label: 'A+ 模块一', description: '顶部 hero 区，建立品牌感和主场景' },
  { value: 'aplus-transform', label: 'A+ 模块二', description: '中段承接区，讲清如何展开或如何使用' },
  { value: 'aplus-grid', label: 'A+ 模块三', description: '卖点信息区，承载功能亮点和材质细节' },
  { value: 'aplus-lifestyle', label: 'A+ 模块四', description: '底部收束区，延展场景并补充参数信息' },
]

const amazonSizeOptions: Array<{ value: RenderSize; label: string; note: string }> = [
  { value: '1024x1024', label: '1:1', note: 'Listing 常用' },
  { value: '2048x2048', label: '2K 方图', note: '更高分辨率，适合精修导出' },
]

const fallbackPrompts: Record<PromptImageType, string> = {
  'main-white': '为亚马逊商品详情页生成一张白底主图，聚焦商品本体，纯白背景，主体完整清晰、边缘干净、真实质感，构图适合电商展示，强调专业棚拍与高点击率，避免文字、水印、Logo、价格标签和无关道具。图片内如需任何文字展示，必须使用英文。',
  size: '为亚马逊商品详情页生成一张尺寸认知图，重点让用户快速理解产品大小、比例和摆放关系，可借助自然参照物表达尺寸，视觉清楚可信，比例准确不做过度夸张。图中所有尺寸标注或说明文字必须为英文。',
  detail: '为亚马逊商品详情页生成一张细节特写图，突出产品材质、纹理、做工或关键结构，强调真实微距质感、清晰边缘和高级光线，让用户直观感受品质。提示词可以用中文，但如果图片内出现文字，必须为英文。',
  'infographic-1': '为亚马逊商品详情页生成卖点图一，聚焦 1-2 个最核心的功能、材质或差异化优势，信息量不要过密，版式清晰利落，标题和说明文字必须为英文，整体风格适合高质量亚马逊电商展示。',
  'infographic-2': '为亚马逊商品详情页生成卖点图二，补充另一组卖点、功能价值或使用收益，与第一张形成明确分工，不要重复堆砌同一信息，文字说明必须为英文，版式清楚易读。',
  'lifestyle-1': '为亚马逊商品详情页生成场景图一，聚焦一个最常见、最典型、最容易理解的核心使用场景，做更深入、更完整的单场景展示，让用户一眼明白产品怎么用、适合谁用，画面自然可信、偏高端感，产品仍是视觉主角。如需出现任何文字，必须使用英文。',
  'lifestyle-2': '为亚马逊商品详情页生成场景图二，优先采用拼图或分区构图，展示产品的多个使用场景、多个使用方式，或同一场景下的多种功能动作；若产品不适合拼图，也要切换到与场景图一明显不同的第二使用场景。整体信息更丰富但不杂乱，产品始终是视觉焦点。如需出现任何文字，必须使用英文。',
}

const aplusFallbackPrompts: Record<APlusPromptImageType, string> = {
  'aplus-main': '为亚马逊普通 A+ 页面生成一张横版模块图，强调产品、品牌感和卖点整合，不要做成 listing 白底主图。提示词可以使用中文，但如果图片内出现任何标题、说明或标签，必须全部使用英文。',
  'aplus-hero': '为亚马逊普通 A+ 页面生成第一张横版模块图，作为整页顶部 hero 切片。画面要像成熟 A+ 页面的第一屏，有清晰主标题区、自然留白、温和品牌感和可信的生活方式场景。产品与参考图保持一致，产品是视觉主角，整体干净、简洁、有高级感，不要做成白底主图或夸张海报。',
  'aplus-transform': '为亚马逊普通 A+ 页面生成第二张横版模块图，作为整页中段的机制讲解切片。延续第一页的色调和空间语境，更自然地表现产品如何展开、如何使用或为什么方便，可以带简洁英文说明、步骤感或形态变化，但不要做成说明书式拼贴。',
  'aplus-grid': '为亚马逊普通 A+ 页面生成第三张横版模块图，作为整页卖点信息区切片。延续前两张的视觉气质，用更有层级的方式承载功能优势、结构亮点、材质细节或局部特写，可以有卡片、分区或局部放大，但整体仍然像成熟 A+ 页面，而不是独立卖货海报。',
  'aplus-lifestyle': '为亚马逊普通 A+ 页面生成第四张横版模块图，作为整页底部的场景与信息收束切片。延续前面的色调与品牌感，自然呈现适用场景、安心感、参数或材质信息，让整套 A+ 页面完整收束。画面可包含简洁英文信息区，但不应重新变成新的主视觉图。',
  'aplus-feature': '为亚马逊普通 A+ 页面生成一张横版卖点模块图，延续整页语境，自然表现核心卖点、结构亮点或使用收益。',
  'aplus-detail': '为亚马逊普通 A+ 页面生成一张横版细节模块图，延续整页语境，重点表现材质、做工、局部结构或补充场景。',
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

  return result.suggestedPrompts[type]
    || (type.startsWith('aplus-') ? aplusFallbackPrompts[type as APlusPromptImageType] : fallbackPrompts[type as PromptImageType])
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
        : '如果参考图缺少明确场景，环境表达保持自然简洁，不要凭空加太复杂的人物和空间设定。',
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
    lines.push('参考图缺少明确场景信息，场景表达保持自然泛化，不要绑定过于具体的人物、空间或生活方式。')
  }

  if (hasLifestyle && baseType === 'lifestyle') {
    lines.push('可吸收参考图中已有的使用环境或生活方式线索，让场景图更贴近真实用户语境。')
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
      '如果图片内出现任何标题、说明或标签，全部使用简短自然的英文。',
      '整体感觉要像成熟、干净、自然的 A+ 模块，而不是复杂编辑稿或杂乱海报。',
    ]
  }

  const baseType = getBaseType(type)
  const directives = [
    '执行约束：提示词可以使用中文，但如果图片中出现任何标题、说明、尺寸标注或其他文案，必须全部使用英文。',
    '执行约束：这是 Amazon listing image，画面优先服务电商转化，不做无关艺术化表达。',
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
    directives.push('分工要求：这是场景图一，优先表现最常见、最典型、最容易理解的核心使用场景，并做单场景深化展示。')
  }

  if (type === 'lifestyle-2') {
    directives.push('分工要求：这是场景图二，优先使用拼图或分区方式展示多个使用场景、多个使用动作或多个使用形式；若不适合拼图，也要切换到与场景图一明显不同的第二场景。')
  }

  if (baseType === 'infographic') {
    directives.push('版式要求：信息图保持清晰留白，避免密集小字和过多模块。')
  }

  if (baseType === 'lifestyle') {
    directives.push('场景要求：产品必须仍是视觉主角，场景和人物只服务于理解用途，不喧宾夺主。')
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
  steps,
}: {
  title: string
  stage: TaskStatus
  label: string
  progress: number
  warnings: string[]
  helperText: string
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
  const emptyPromptResults: PromptResults = {
    amazonSet: null,
    aplus: null,
  }
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [storedReferenceImages, setStoredReferenceImages] = useState<StoredReferenceImage[]>(initialResumeState?.referenceImages || [])
  const [analysisId, setAnalysisId] = useState(initialResumeState?.analysisId || '')
  const [currentStep, setCurrentStep] = useState<'input' | 'analysis' | 'branch-select' | 'generate'>('input')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('idle')
  const [analysisStageLabel, setAnalysisStageLabel] = useState('')
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([])
  const [streamError, setStreamError] = useState('')
  const [isStreamCompleted, setIsStreamCompleted] = useState(false)
  const [basicAnalysisResult, setBasicAnalysisResult] = useState<BasicAnalysisResult | null>(null)
  const [promptResults, setPromptResults] = useState<PromptResults>(initialResumeState?.promptResults || emptyPromptResults)
  const [selectedBranch, setSelectedBranch] = useState<AmazonBranch | null>(initialResumeState?.currentBranch || null)
  const [branchPromptStatus, setBranchPromptStatus] = useState<TaskStatus>('idle')
  const [branchPromptLabel, setBranchPromptLabel] = useState('')
  const [branchPromptProgress, setBranchPromptProgress] = useState(0)
  const [promptGenerationError, setPromptGenerationError] = useState('')
  const [userGuidance, setUserGuidance] = useState('')
  const [selectedImageType, setSelectedImageType] = useState<PromptKey>('main-white')
  const [selectedSize, setSelectedSize] = useState<RenderSize>('1024x1024')
  const [editedPrompt, setEditedPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [pointsBalance, setPointsBalance] = useState(initialPointsBalance)
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [editingImage, setEditingImage] = useState<GeneratedImage | null>(null)
  const [routeNotice, setRouteNotice] = useState('')
  const [resumeNotice, setResumeNotice] = useState('')
  const analyzeRequestIdRef = useRef(0)
  const analyzeAbortControllerRef = useRef<AbortController | null>(null)
  const generationPollingRef = useRef<Map<string, number>>(new Map())
  const appliedResumeIdRef = useRef<string | null>(null)
  const currentPromptResult = useMemo(
    () => (selectedBranch ? getPromptResultForBranch(promptResults, selectedBranch) : null),
    [promptResults, selectedBranch],
  )
  const canProceedToBranchSelection = Boolean(basicAnalysisResult && isStreamCompleted)
  const generationCost = useMemo(
    () => getGenerationCostDisplay(selectedBranch === 'aplus' ? 'aplus' : 'amazon'),
    [selectedBranch],
  )
  const hasEnoughPointsToGenerate = pointsBalance >= generationCost
  const activeReferenceImageCount = referenceImages.length || storedReferenceImages.length

  useEffect(() => {
    return () => {
      generationPollingRef.current.forEach((timerId) => window.clearInterval(timerId))
      generationPollingRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!initialResumeState || appliedResumeIdRef.current === initialResumeState.analysisId) {
      return
    }

    appliedResumeIdRef.current = initialResumeState.analysisId
    setReferenceImages([])
    setAnalysisId(initialResumeState.analysisId)
    setStoredReferenceImages(initialResumeState.referenceImages || [])
    setGeneratedImages([])
    setEditingImage(null)
    setUserGuidance('')
    setBasicAnalysisResult(initialResumeState.basicAnalysisResult)
    setPromptResults(initialResumeState.promptResults || emptyPromptResults)
    setPromptGenerationError(initialResumeState.status === 'FAILED' ? (initialResumeState.errorMessage || '这次分析没有成功完成。') : '')
    setStreamError(initialResumeState.status === 'FAILED' ? (initialResumeState.errorMessage || '这次分析没有成功完成。') : '')
    setAnalysisWarnings([])
    setIsAnalyzing(false)
    setBranchPromptStatus('idle')
    setBranchPromptLabel('')
    setBranchPromptProgress(0)
    setSelectedImageType('main-white')
    setSelectedSize('1024x1024')

    const resumeAmazonSet = initialResumeState.promptResults.amazonSet
    const resumeAplus = initialResumeState.promptResults.aplus
    const resolvedBranch = initialResumeState.currentBranch
      || (resumeAmazonSet ? 'amazon-set' : null)
      || (resumeAplus ? 'aplus' : null)

    setSelectedBranch(resolvedBranch)
    setEditedPrompt(
      resolvedBranch
        ? getSuggestedPrompt(
          getPromptResultForBranch(initialResumeState.promptResults, resolvedBranch),
          resolvedBranch === 'amazon-set'
            ? 'main-white'
            : getDefaultAPlusPromptKey(getPromptResultForBranch(initialResumeState.promptResults, resolvedBranch)),
        )
        : '',
    )
    setSelectedImageType(
      resolvedBranch === 'aplus'
        ? getDefaultAPlusPromptKey(getPromptResultForBranch(initialResumeState.promptResults, resolvedBranch))
        : 'main-white',
    )
    setSelectedSize(resolvedBranch === 'aplus' ? HIDDEN_APLUS_RENDER_SIZE : '1024x1024')

    if (initialResumeState.status === 'SUCCEEDED' && initialResumeState.basicAnalysisResult) {
      setIsStreamCompleted(true)
      setAnalysisStage('completed')
      setAnalysisStageLabel('已从历史记录恢复分析结果，可以继续选择提示词分支或生成图片')
      setAnalysisProgress(100)
      if (resolvedBranch && isPromptGenerationComplete(getPromptResultForBranch(initialResumeState.promptResults, resolvedBranch))) {
        setCurrentStep('generate')
      } else {
        setCurrentStep('branch-select')
      }
      setResumeNotice(`已从 ${formatDateTimeInBeijing(initialResumeState.createdAt)} 的分析记录恢复，当前继续使用已保存的参考图。`)
      return
    }

    if (initialResumeState.status === 'STARTED') {
      setIsStreamCompleted(false)
      setAnalysisStage('preparing')
      setAnalysisStageLabel('这次分析仍在服务端执行，请前往 /history 等待完成后再继续生图')
      setAnalysisProgress(10)
      setCurrentStep('analysis')
      setResumeNotice('这次分析还在后台执行。你可以在 /history 里持续查看状态，完成后再继续生图。')
      return
    }

    setIsStreamCompleted(false)
    setAnalysisStage('error')
    setAnalysisStageLabel(initialResumeState.errorMessage || '历史分析记录未完成，暂时无法继续生图')
    setAnalysisProgress(0)
    setCurrentStep('analysis')
    setResumeNotice('这次历史分析没有完成，先查看错误信息后再决定是否重新分析。')
  }, [initialResumeState])

  const buildPrompt = useCallback((type: PromptKey, promptBody?: string) => {
    if (!basicAnalysisResult) return ''
    const basePrompt = promptBody || getSuggestedPrompt(currentPromptResult, type)
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
  }, [basicAnalysisResult, currentPromptResult, userGuidance])

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
    if (type.startsWith('aplus-')) {
      formData.append('aspectRatio', '8:5')
    }
    if (referenceImages.length > 0) {
      referenceImages.slice(0, 3).forEach((image) => {
        formData.append('referenceImages', image)
      })
    } else if (storedReferenceImages.length > 0) {
      formData.append('referenceImageUrls', JSON.stringify(storedReferenceImages.slice(0, 3).map((image) => image.url)))
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
  }, [buildPrompt, currentPromptResult, referenceImages, storedReferenceImages])

  const startPollingGenerationRequest = useCallback((params: {
    requestId: string
    imageId: string
    fallbackPrompt: string
    fallbackImageType: string
  }) => {
    if (generationPollingRef.current.has(params.requestId)) {
      return
    }

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
            aspectRatio: payload.aspectRatio || image.aspectRatio,
            status: payload.status,
            statusMessage: payload.statusMessage,
            errorMessage: payload.errorMessage,
          }

          if (payload.status === 'SUCCEEDED' && !image.charged) {
            setPointsBalance((current) => Math.max(0, Number((current - generationCost).toFixed(1))))
            nextImage.charged = true
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

  const handleAnalyze = useCallback(async (data: AnalyzeFormInput) => {
    const requestId = analyzeRequestIdRef.current + 1
    analyzeRequestIdRef.current = requestId
    analyzeAbortControllerRef.current?.abort()
    const abortController = new AbortController()
    analyzeAbortControllerRef.current = abortController

    setIsAnalyzing(true)
    setPromptGenerationError('')
    setStreamError('')
    setAnalysisWarnings([])
    setIsStreamCompleted(false)
    setAnalysisStage('preparing')
    setAnalysisStageLabel('正在读取商品信息与参考图')
    setAnalysisProgress(10)
    setAnalysisId('')
    setReferenceImages(data.referenceImages)
    setStoredReferenceImages([])
    setGeneratedImages([])
    setEditingImage(null)
    setUserGuidance('')
    setResumeNotice('')
    setBasicAnalysisResult(null)
    setPromptResults(emptyPromptResults)
    setSelectedBranch(null)
    setBranchPromptStatus('idle')
    setBranchPromptLabel('')
    setBranchPromptProgress(0)
    setCurrentStep('analysis')
    setSelectedImageType('main-white')
    setSelectedSize('1024x1024')
    setEditedPrompt('')
    let receivedBasicAnalysis = false
    let streamFinished = false

    try {
      const formData = new FormData()
      formData.append('productName', data.productName)
      formData.append('description', data.description)
      formData.append('category', data.category)
      formData.append('targetAudience', data.targetAudience)
      data.referenceImages.slice(0, 3).forEach((image) => {
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
            setBasicAnalysisResult(event.data)
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
            setIsStreamCompleted(true)
            setIsAnalyzing(false)
            setAnalysisStage('completed')
            setAnalysisStageLabel('分析完成，可以进入下一步选择提示词分支')
            setAnalysisProgress(100)
            setSelectedImageType('main-white')
            setSelectedSize('1024x1024')
          }
        }
      }

      if (buffer.trim() && analyzeRequestIdRef.current === requestId) {
        const event = JSON.parse(buffer) as AnalyzeStreamEvent
        if (event.type === 'done') {
          streamFinished = true
          setIsStreamCompleted(true)
          setIsAnalyzing(false)
          setAnalysisStage('completed')
          setAnalysisStageLabel('分析完成，可以进入下一步选择提示词分支')
          setAnalysisProgress(100)
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
      setStreamError(message)
      setAnalysisStage('error')
      setAnalysisStageLabel(message)
      if (!receivedBasicAnalysis) {
        setCurrentStep('input')
        setBasicAnalysisResult(null)
        setPromptResults(emptyPromptResults)
        setPromptGenerationError('')
      }
      setIsAnalyzing(false)
    }
  }, [])

  const handleProceedToBranchSelect = useCallback(() => {
    if (!canProceedToBranchSelection) return
    setCurrentStep('branch-select')
  }, [canProceedToBranchSelection])

  const handleGenerateBranchPrompts = useCallback(async (branch: AmazonBranch) => {
    if (!analysisId) {
      setPromptGenerationError('缺少分析记录 ID，请重新分析后再试。')
      return
    }

    setSelectedBranch(branch)
    setGeneratedImages([])
    setEditingImage(null)
    setRouteNotice('')
    setBranchPromptStatus('preparing')
    setBranchPromptLabel('正在读取基础分析结果和参考图信息')
    setBranchPromptProgress(12)
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
      progressTimers.forEach((timer) => window.clearTimeout(timer))
      setPromptResults((prev) => ({
        ...prev,
        amazonSet: branch === 'amazon-set' ? result as PromptGenerationResult : prev.amazonSet,
        aplus: branch === 'aplus' ? result as APlusPromptGenerationResult : prev.aplus,
      }))
      setBranchPromptStatus('completed')
      setBranchPromptLabel('提示词已生成，正在进入图片生成页')
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
      console.error('Error generating branch prompts:', error)
      setPromptGenerationError(error instanceof Error ? error.message : '提示词生成失败')
      setBranchPromptStatus('error')
      setBranchPromptLabel('')
      setBranchPromptProgress(0)
    }
  }, [analysisId])

  const handleGenerateSingle = useCallback(async () => {
    if (!basicAnalysisResult || !selectedBranch || isGenerating) return
    if (!activeReferenceImageCount) {
      alert('请先上传至少一张参考图，或从历史分析记录恢复参考图后再生成。')
      return
    }
    if (!hasEnoughPointsToGenerate) {
      alert('积分不足，请先充值后再生成图片。')
      return
    }

    setIsGenerating(true)
    setRouteNotice('正在尝试第一线路')

    try {
      const result = await requestGenerate(selectedImageType, editedPrompt, selectedSize)

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
          aspectRatio: selectedImageType.startsWith('aplus-') ? '8:5' : '1:1',
          status: 'QUEUED',
          statusMessage: result.data.statusMessage,
          errorMessage: null,
          charged: false,
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
          imageType: selectedImageType,
          size: result.data.size,
          aspectRatio: selectedImageType.startsWith('aplus-') ? '8:5' : '1:1',
          status: 'SUCCEEDED',
          charged: true,
        }
        setGeneratedImages((prev) => [newImage, ...prev])
        setPointsBalance((prev) => Math.max(0, Number((prev - generationCost).toFixed(1))))
      }
    } catch (error) {
      console.error('Error generating image:', error)
      const message = error instanceof Error ? error.message : 'Failed to generate image. Please check your API keys.'
      setRouteNotice(message)
      alert(message)
    } finally {
      setIsGenerating(false)
    }
  }, [activeReferenceImageCount, basicAnalysisResult, editedPrompt, generationCost, hasEnoughPointsToGenerate, isGenerating, requestGenerate, selectedBranch, selectedImageType, selectedSize, startPollingGenerationRequest])

  const handleRegenerate = useCallback(async () => {
    if (!editingImage || !activeReferenceImageCount || isGenerating) return
    if (!hasEnoughPointsToGenerate) {
      alert('积分不足，请先充值后再生成图片。')
      return
    }

    setIsGenerating(true)
    setRouteNotice('正在尝试第一线路')

    try {
      const result = await requestGenerate(editingImage.imageType as PromptKey, editingImage.prompt, undefined, false)

      if (result.kind === 'queued') {
        setGeneratedImages((prev) => prev.map((image) => (
          image.id === editingImage.id
            ? {
                ...image,
                requestId: result.data.requestId,
                imageUrl: image.imageUrl,
                prompt: editingImage.prompt,
                revisedPrompt: editingImage.prompt,
                status: 'QUEUED',
                statusMessage: result.data.statusMessage,
                errorMessage: null,
                charged: false,
              }
            : image
        )))
        setEditingImage(null)
        startPollingGenerationRequest({
          requestId: result.data.requestId,
          imageId: editingImage.id,
          fallbackPrompt: editingImage.prompt,
          fallbackImageType: editingImage.imageType,
        })
      } else {
        const updatedImage: GeneratedImage = {
          ...editingImage,
          id: createImageId(),
          requestId: result.data.requestId,
          imageUrl: result.data.imageUrl,
          prompt: result.data.prompt,
          revisedPrompt: result.data.prompt,
          status: 'SUCCEEDED',
          charged: true,
        }

        setGeneratedImages((prev) =>
          prev.map((image) => (image.id === editingImage.id ? updatedImage : image)),
        )
        setEditingImage(updatedImage)
        setPointsBalance((prev) => Math.max(0, Number((prev - generationCost).toFixed(1))))
      }
    } catch (error) {
      console.error('Error regenerating image:', error)
      const message = error instanceof Error ? error.message : 'Failed to regenerate image. Please check your API keys.'
      setRouteNotice(message)
      alert(message)
    } finally {
      setIsGenerating(false)
    }
  }, [activeReferenceImageCount, editingImage, generationCost, hasEnoughPointsToGenerate, isGenerating, requestGenerate, startPollingGenerationRequest])

  const handleDownload = async (image: GeneratedImage) => {
    try {
      if (!image.imageUrl) return
      const link = document.createElement('a')
      link.href = `/api/download?url=${encodeURIComponent(image.imageUrl)}&filename=${encodeURIComponent(`amazon-product-${image.id}.png`)}`
      link.download = `amazon-product-${image.id}.png`
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Failed to download:', err)
    }
  }

  const handleCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt)
      alert('提示词已复制')
    } catch (err) {
      console.error('Failed to copy:', err)
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
          <Link href="/" className="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 md:inline-flex">
            返回首页
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="panel mb-8 overflow-hidden px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full bg-amazon-orange/10 px-3 py-1 text-xs font-semibold text-amazon-orange">
                生产流程
              </span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                先分析商品，再生成适合 Amazon 的图片。
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
                先输入商品信息并上传参考图，让系统理解商品卖点和平台规范，再选择生成 Amazon 图组提示词或 A+ 提示词。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { step: '01', label: '填写商品信息' },
                { step: '02', label: '查看 AI 分析' },
                { step: '03', label: '选择提示词分支' },
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
              <ProductInput onAnalyze={handleAnalyze} isLoading={isAnalyzing} />
            )}

            {currentStep === 'analysis' && (
              <div className="panel space-y-8 p-6 sm:p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      分析结果
                    </span>
                    <h3 className="mt-3 text-2xl font-semibold text-slate-950">AI 商品图片规划</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      当前步骤只完成商品分析。分析完成后，再选择生成 Amazon 图组提示词或 A+ 提示词。
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {canProceedToBranchSelection && !hasEnoughPointsToGenerate && (
                      <Link
                        href="/points/recharge"
                        className="inline-flex rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100"
                      >
                        积分不足，去充值
                      </Link>
                    )}
                    <button
                      onClick={handleProceedToBranchSelect}
                      disabled={!canProceedToBranchSelection}
                      className="inline-flex rounded-2xl bg-amazon-orange px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {canProceedToBranchSelection ? '下一步：选择提示词分支' : '正在完成基础分析'}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <TaskStatusPanel
                    title="分析状态"
                    stage={analysisStage}
                    label={analysisStageLabel}
                    progress={analysisProgress}
                    warnings={analysisWarnings}
                    helperText="预计总等待约 1-2 分钟，参考图越多，基础分析时间越长。"
                    steps={[
                      { key: 'preparing', label: '准备素材' },
                      { key: 'analyzing', label: '基础分析' },
                      { key: 'completed', label: '完成' },
                    ]}
                  />

                  {streamError && (
                    <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 md:col-span-2">
                      {streamError}
                    </div>
                  )}

                  {basicAnalysisResult ? (
                    <>
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                        <h4 className="text-sm font-semibold text-slate-800">商品总结</h4>
                        <p className="mt-3 text-sm leading-7 text-slate-600">{basicAnalysisResult.productSummary}</p>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <h4 className="text-sm font-semibold text-slate-800">核心卖点</h4>
                        <ul className="mt-3 space-y-2 text-sm text-slate-600">
                          {basicAnalysisResult.sellingPoints.map((point, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amazon-orange" />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-5 md:col-span-2">
                        <h4 className="text-sm font-semibold text-slate-800">参考图观察</h4>
                        <p className="mt-3 text-sm leading-6 text-slate-600">{basicAnalysisResult.referenceImageSummary}</p>
                        {basicAnalysisResult.referenceImageObservations.length > 0 ? (
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            {basicAnalysisResult.referenceImageObservations.map((item) => (
                              <div key={item.imageIndex} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="text-sm font-medium text-slate-800">参考图 {item.imageIndex}</div>
                                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                                  {item.observations.map((observation, idx) => (
                                    <li key={idx} className="flex gap-2">
                                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                                      <span>{observation}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 text-sm text-slate-500">当前没有参考图观察结果。</div>
                        )}
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <h4 className="text-sm font-semibold text-slate-800">图片规范摘要</h4>
                        <ul className="mt-3 space-y-2 text-sm text-slate-600">
                          {basicAnalysisResult.amazonImageGuidelines.map((item, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amazon-blue" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <h4 className="text-sm font-semibold text-slate-800">生成后检查清单</h4>
                        <ul className="mt-3 space-y-2 text-sm text-slate-600">
                          {basicAnalysisResult.complianceChecklist.map((item, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <h4 className="text-sm font-semibold text-slate-800">建议做的图片内容</h4>
                        <ul className="mt-3 space-y-2 text-sm text-slate-600">
                          {basicAnalysisResult.imageContentSuggestions.map((item, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <h4 className="text-sm font-semibold text-slate-800">视觉风格建议</h4>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {basicAnalysisResult.visualStyleRecommendations.map((style, idx) => (
                            <span key={idx} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                              {style}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <h4 className="text-sm font-semibold text-slate-800">整组视觉系统建议</h4>
                        <ul className="mt-3 space-y-2 text-sm text-slate-600">
                          {basicAnalysisResult.visualSystemGuidance.map((item, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className={`rounded-3xl border p-5 md:col-span-2 ${basicAnalysisResult.referenceImageAdvice.needMoreReferences ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                        <h4 className="text-sm font-semibold text-slate-800">参考图建议</h4>
                        <p className="mt-3 text-sm leading-6 text-slate-600">{basicAnalysisResult.referenceImageAdvice.reason}</p>
                        <ul className="mt-3 space-y-2 text-sm text-slate-600">
                          {basicAnalysisResult.referenceImageAdvice.recommendedShots.map((item, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-500" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-5 md:col-span-2">
                        <h4 className="text-sm font-semibold text-slate-800">提示词策略</h4>
                        <ul className="mt-3 space-y-2 text-sm text-slate-600">
                          {basicAnalysisResult.promptingPrinciples.map((item, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-5 md:col-span-2">
                        <h4 className="mb-2 text-sm font-semibold text-slate-800">下一步</h4>
                        <p className="text-sm leading-6 text-slate-500">
                          基础分析完成后，你可以在下一步选择生成 Amazon 图组提示词，或者生成 A+ 页面提示词。
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-3xl border border-slate-200 bg-white p-6 md:col-span-2">
                        <LoadingSpinner message="正在完成第一步商品分析，预计约 1-2 分钟..." />
                        <p className="text-center text-xs text-slate-500">
                          当前正在理解商品卖点、参考图内容和 Amazon 规范，结果出来后会立即开始展示。
                        </p>
                      </div>
                      <AnalysisCardSkeleton className="md:col-span-2" />
                      <AnalysisCardSkeleton />
                      <AnalysisCardSkeleton />
                      <AnalysisCardSkeleton className="md:col-span-2" />
                      <AnalysisCardSkeleton />
                      <AnalysisCardSkeleton />
                      <AnalysisCardSkeleton />
                      <AnalysisCardSkeleton />
                      <AnalysisCardSkeleton className="md:col-span-2" />
                    </>
                  )}
                </div>
              </div>
            )}

            {currentStep === 'branch-select' && basicAnalysisResult && (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="panel p-6">
                  <div className="inline-flex rounded-full bg-amazon-orange/10 px-3 py-1 text-xs font-semibold text-amazon-orange">
                    分支选择
                  </div>
                  <h3 className="mt-4 text-2xl font-semibold text-slate-950">选择接下来要生成哪一类提示词</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    基础分析已经完成。现在选择继续生成 Amazon 图组提示词，或者生成 4 张按整页 A+ 页面思路编排的模块图提示词。
                  </p>
                  {promptGenerationError && (
                    <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {promptGenerationError}
                    </div>
                  )}
                  {storedReferenceImages.length > 0 && referenceImages.length === 0 && (
                    <p className="mt-4 text-sm text-sky-700">当前正在复用历史分析里保存的 {storedReferenceImages.length} 张参考图。</p>
                  )}
                </div>

                <div className="panel p-6">
                  <h4 className="text-sm font-semibold text-slate-800">可选分支</h4>
                  <div className="mt-4 grid gap-4">
                    <button
                      type="button"
                      onClick={() => handleGenerateBranchPrompts('amazon-set')}
                      disabled={branchPromptStatus !== 'idle' && branchPromptStatus !== 'error'}
                      className="rounded-3xl border border-slate-200 bg-white p-5 text-left transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="text-base font-semibold text-slate-900">生成 Amazon 图组提示词</div>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        生成现有 7 张 Amazon 图组的默认提示词：白底主图、尺寸图、细节图、两张卖点图和两张场景图。
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleGenerateBranchPrompts('aplus')}
                      disabled={branchPromptStatus !== 'idle' && branchPromptStatus !== 'error'}
                      className="rounded-3xl border border-slate-200 bg-white p-5 text-left transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="text-base font-semibold text-slate-900">生成 A+ 提示词</div>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        生成 4 条连续的 A+ 模块图提示词，可拼成一整页 A+ 页面叙事。
                      </p>
                    </button>
                  </div>

                  {branchPromptStatus !== 'idle' && branchPromptStatus !== 'error' && (
                    <div className="mt-4">
                      <TaskStatusPanel
                        title="提示词生成状态"
                        stage={branchPromptStatus}
                        label={branchPromptLabel}
                        progress={branchPromptProgress}
                        warnings={[]}
                        helperText="这一步会复用刚才的基础分析结果，生成完成后会直接进入图片生成页。"
                        steps={[
                          { key: 'preparing', label: '读取分析' },
                          { key: 'analyzing', label: '生成提示词' },
                          { key: 'saving', label: '保存结果' },
                          { key: 'completed', label: '完成' },
                        ]}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === 'generate' && basicAnalysisResult && currentPromptResult && selectedBranch && (
              <>
                <div className="panel p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {selectedBranch === 'amazon-set' ? 'Amazon 图组分支' : 'A+ 分支'}
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-slate-900">生成方式</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedBranch === 'amazon-set'
                          ? '可以单张精修，也可以按亚马逊常见图组顺序整套生成。'
                          : '当前分支生成 4 张连续的 A+ 横版模块图，按一整页 A+ 页面从上到下的区段来组织。'}
                      </p>
                      {storedReferenceImages.length > 0 && referenceImages.length === 0 && (
                        <p className="mt-2 text-sm text-sky-700">当前正在复用历史分析里保存的 {storedReferenceImages.length} 张参考图。</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => setCurrentStep('branch-select')}
                        className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                      >
                        切换提示词分支
                      </button>
                    </div>
                  </div>
                </div>

                {routeNotice && (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                    <p>{routeNotice}</p>
                  </div>
                )}

                <div className="panel p-6">
                  <h3 className="text-lg font-semibold text-slate-900">单张生成</h3>
                  <div className={`mt-5 grid gap-3 ${selectedBranch === 'amazon-set' ? 'grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
                    {(selectedBranch === 'amazon-set' ? imageTypeOptions : getAPlusOptionSet(currentPromptResult)).map((option) => (
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

                  {selectedBranch === 'amazon-set' && (
                    <div className="mt-6">
                      <label className="mb-3 block text-sm font-medium text-slate-800">
                        生成尺寸
                      </label>
                      <div className="grid gap-3 md:grid-cols-3">
                        {amazonSizeOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setSelectedSize(option.value)}
                            className={`rounded-2xl border p-4 text-left transition ${
                              selectedSize === option.value
                                ? 'border-amazon-orange bg-orange-50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="text-sm font-medium text-slate-800">{option.label}</div>
                            <div className="mt-1 text-xs text-slate-500">{option.note}</div>
                          </button>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        Amazon 图组分支当前只保留方图输出：`1024x1024` 或 `2048x2048`。
                      </p>
                    </div>
                  )}

                  <div className="mt-6">
                    <label className="mb-3 block text-sm font-medium text-slate-800">
                      参考图使用策略
                    </label>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm leading-6 text-slate-600">
                        {buildReferenceAwarePromptHint(selectedImageType, basicAnalysisResult) || '当前没有额外的参考图策略限制，会按基础分析和当前提示词执行。'}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        这部分会在发送给生图模型时自动附加，不会覆盖你在下方编辑器里调整的 AI 原始提示词。
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <label className="mb-3 block text-sm font-medium text-slate-800">
                      补充要求（选填）
                    </label>
                    <textarea
                      value={userGuidance}
                      onChange={(e) => setUserGuidance(e.target.value)}
                      rows={4}
                      className="input-field min-h-[116px] resize-none"
                      placeholder={selectedBranch === 'amazon-set' ? '比如：更偏高端感、强调礼赠属性、尽量避免人物出镜、强调北美家居场景等' : '比如：四张图统一暖白家居风、像同一页 A+ 页面切片、第二张更强调展开方式、第四张带简洁参数区等'}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      这部分会在生成时附加到当前推荐提示词后面，不会改写系统已经生成好的基础策略。
                    </p>
                  </div>

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

                  <button
                    onClick={handleGenerateSingle}
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
                      selectedBranch === 'amazon-set' ? '生成当前这张图' : '生成当前 A+ 区段图'
                    )}
                  </button>
                </div>

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
                              className={image.imageType.startsWith('aplus-') ? 'aspect-[8/5] w-full object-cover' : 'aspect-square w-full object-cover'}
                            />
                          ) : (
                            <div className={`${image.imageType.startsWith('aplus-') ? 'aspect-[8/5]' : 'aspect-square'} flex w-full items-center justify-center bg-slate-100 text-sm text-slate-400`}>
                              {image.status === 'FAILED' ? '生成失败' : '生成中'}
                            </div>
                          )}
                          <div className="p-4">
                            <div className="mb-2 text-xs text-slate-500">
                              {[...imageTypeOptions, ...aplusImageTypeOptions].find((type) => type.value === image.imageType)?.label}
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
                                    onClick={() => setEditingImage(image)}
                                    className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                                  >
                                    Edit
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
              <div className="panel p-6">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Edit Image - {[...imageTypeOptions, ...aplusImageTypeOptions].find((type) => type.value === editingImage.imageType)?.label}
                  </h3>
                  <button
                    onClick={() => setEditingImage(null)}
                    className="text-2xl text-slate-400 transition hover:text-slate-700"
                  >
                    ×
                  </button>
                </div>

                <div className="mb-5">
                  <img
                    src={editingImage.imageUrl || ''}
                    alt="Editing"
                    className="mx-auto w-full max-w-xl rounded-3xl border border-slate-200"
                  />
                </div>

                <div className="mb-5">
                  <label className="mb-2 block text-sm font-medium text-slate-800">
                    编辑提示词并重新生成
                  </label>
                  <textarea
                    value={editingImage.prompt}
                    onChange={(e) => setEditingImage({ ...editingImage, prompt: e.target.value })}
                    rows={6}
                    className="input-field min-h-[148px] resize-none"
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={handleRegenerate}
                    disabled={isGenerating}
                    className="flex-1 rounded-2xl bg-amazon-orange px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {isGenerating ? 'Generating...' : 'Regenerate'}
                  </button>
                  <button
                    onClick={() => handleCopyPrompt(editingImage.prompt)}
                    className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    复制提示词
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
