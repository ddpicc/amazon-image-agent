'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import ProductInput from '@/components/ProductInput'
import LoadingSpinner, { SkeletonBlock } from '@/components/LoadingSpinner'
import { AmazonResumeState, BasicAnalysisResult, PromptGenerationResult, RecommendedImagePlanItem, StoredReferenceImage, isPromptGenerationComplete } from '@/lib/amazon-workflow'
import { RenderSize } from '@/lib/image-options'

type AmazonImageType = 'main-white' | 'lifestyle' | 'infographic' | 'detail' | 'size'
type PromptImageType = 'main-white' | 'size' | 'detail' | 'infographic-1' | 'infographic-2' | 'lifestyle-1' | 'lifestyle-2'

interface ImageTypeOption {
  value: PromptImageType
  label: string
  description: string
}

interface GeneratedImage {
  id: string
  imageUrl: string
  prompt: string
  imageType: string
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
  | { type: 'result'; data: { imageUrl: string; revisedPrompt: string; routeSummary: RouteSummary | null } }
  | { type: 'error'; message: string }

interface AnalysisResult extends BasicAnalysisResult {
  recommendedImagePlan: RecommendedImagePlanItem[]
  suggestedPrompts: Record<string, string>
}

type AnalysisStage = 'idle' | 'preparing' | 'analyzing' | 'prompting' | 'completed' | 'error'

interface PromptProgressState {
  completed: number
  total: number
  current: string
}

interface AnalyzeStreamEvent {
  type: 'stage' | 'partial-analysis' | 'prompt-progress' | 'prompt-item' | 'warning' | 'error' | 'done'
  stage?: Exclude<AnalysisStage, 'idle' | 'error'>
  label?: string
  progress?: number
  data?: BasicAnalysisResult
  completed?: number
  total?: number
  current?: string
  key?: string
  plan?: RecommendedImagePlanItem
  prompt?: string
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
  { value: 'lifestyle-1', label: '场景图一', description: '最常见使用场景' },
  { value: 'lifestyle-2', label: '场景图二', description: '综合场景或第二场景' },
]

const imageTypeOrder: PromptImageType[] = ['main-white', 'size', 'detail', 'infographic-1', 'infographic-2', 'lifestyle-1', 'lifestyle-2']

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
  'lifestyle-1': '为亚马逊商品详情页生成场景图一，聚焦最常见、最容易理解的核心使用场景，帮助用户一眼明白产品怎么用、适合谁用，画面自然可信、偏高端感，产品仍是视觉主角。如需出现任何文字，必须使用英文。',
  'lifestyle-2': '为亚马逊商品详情页生成场景图二。若产品存在多样化使用方式，就展示另一种或综合使用场景；若不适合多场景，就换一个明显不同但同样真实的应用语境。画面层次丰富但不堆砌，产品始终是视觉焦点。如需文字必须为英文。',
}

function createImageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function getDefaultSizeForType(_: string): RenderSize {
  return '1024x1024'
}

function collectObservationText(analysisResult: AnalysisResult): string {
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

function getSuggestedPrompt(analysisResult: AnalysisResult | null, type: string): string {
  if (!analysisResult) return ''
  return analysisResult.suggestedPrompts[type] || fallbackPrompts[type as PromptImageType] || ''
}

function getPromptKeyFromPlan(plan: RecommendedImagePlanItem): PromptImageType {
  if (plan.type === 'main-white' || plan.type === 'size' || plan.type === 'detail') {
    return plan.type
  }

  return `${plan.type}-${plan.index}` as PromptImageType
}

function getPromptOrderIndex(key: string) {
  return imageTypeOrder.indexOf(key as PromptImageType)
}

function buildReferenceAwarePromptHint(type: string, analysisResult: AnalysisResult): string {
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

function buildStructuredPromptDirectives(type: string): string[] {
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
    directives.push('分工要求：这是场景图一，优先表现最常见、最典型、最容易理解的核心使用场景。')
  }

  if (type === 'lifestyle-2') {
    directives.push('分工要求：这是场景图二；如果产品适合多样化使用，展示第二场景或综合场景，否则也要与场景图一形成明确区分。')
  }

  if (baseType === 'infographic') {
    directives.push('版式要求：信息图保持清晰留白，避免密集小字和过多模块。')
  }

  if (baseType === 'lifestyle') {
    directives.push('场景要求：产品必须仍是视觉主角，场景和人物只服务于理解用途，不喧宾夺主。')
  }

  return directives
}

function buildAnalysisSummaryPayload(result: BasicAnalysisResult): string {
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

function AnalysisPlanSkeleton() {
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <SkeletonBlock className="h-4 w-28" />
          <div className="mt-3 space-y-2">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-10/12" />
            <SkeletonBlock className="h-4 w-8/12" />
          </div>
        </div>
      ))}
    </div>
  )
}

function AnalysisStatusPanel({
  stage,
  label,
  progress,
  promptProgress,
  warnings,
}: {
  stage: AnalysisStage
  label: string
  progress: number
  promptProgress: PromptProgressState
  warnings: string[]
}) {
  const steps = [
    { key: 'preparing', label: '准备素材' },
    { key: 'analyzing', label: '基础分析' },
    { key: 'prompting', label: '生成图片规划与 Prompt' },
    { key: 'completed', label: '完成' },
  ] as const

  const activeIndex = steps.findIndex((step) => step.key === stage)

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 md:col-span-2">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">任务状态</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{label}</p>
          <p className="mt-2 text-xs text-slate-500">
            Prompt 进度 {promptProgress.completed}/{promptProgress.total}
            {promptProgress.current ? ` · 当前：${promptProgress.current}` : ''}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            预计总等待约 1-2 分钟，参考图越多、Prompt 套餐越完整，等待时间越长。
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

      <div className="mt-5 grid gap-3 md:grid-cols-4">
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
  initialStep,
}: {
  initialResumeState: AmazonResumeState | null
  initialStep: 'analysis' | 'generate'
}) {
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [storedReferenceImages, setStoredReferenceImages] = useState<StoredReferenceImage[]>(initialResumeState?.referenceImages || [])
  const [currentStep, setCurrentStep] = useState<'input' | 'analysis' | 'generate'>('input')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('idle')
  const [analysisStageLabel, setAnalysisStageLabel] = useState('')
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [promptProgress, setPromptProgress] = useState<PromptProgressState>({
    completed: 0,
    total: imageTypeOrder.length,
    current: '',
  })
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([])
  const [streamError, setStreamError] = useState('')
  const [isStreamCompleted, setIsStreamCompleted] = useState(false)
  const [basicAnalysisResult, setBasicAnalysisResult] = useState<BasicAnalysisResult | null>(null)
  const [promptGenerationResult, setPromptGenerationResult] = useState<PromptGenerationResult | null>(null)
  const [promptGenerationError, setPromptGenerationError] = useState('')
  const [userGuidance, setUserGuidance] = useState('')
  const [selectedImageType, setSelectedImageType] = useState<PromptImageType>('main-white')
  const [selectedSize, setSelectedSize] = useState<RenderSize>('1024x1024')
  const [editedPrompt, setEditedPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [editingImage, setEditingImage] = useState<GeneratedImage | null>(null)
  const [routeNotice, setRouteNotice] = useState('')
  const [resumeNotice, setResumeNotice] = useState('')
  const analyzeRequestIdRef = useRef(0)
  const analyzeAbortControllerRef = useRef<AbortController | null>(null)
  const lastAnalyzeInputRef = useRef<AnalyzeFormInput | null>(null)
  const appliedResumeIdRef = useRef<string | null>(null)

  const analysisResult = useMemo<AnalysisResult | null>(() => {
    if (!basicAnalysisResult) return null

    return {
      ...basicAnalysisResult,
      recommendedImagePlan: promptGenerationResult?.recommendedImagePlan || [],
      suggestedPrompts: promptGenerationResult?.suggestedPrompts || {},
    }
  }, [basicAnalysisResult, promptGenerationResult])

  const canProceedToGeneration = useMemo(() => {
    return Boolean(analysisResult && isStreamCompleted && Object.keys(analysisResult.suggestedPrompts).length === imageTypeOrder.length)
  }, [analysisResult, isStreamCompleted])
  const activeReferenceImageCount = referenceImages.length || storedReferenceImages.length

  useEffect(() => {
    if (!initialResumeState || appliedResumeIdRef.current === initialResumeState.analysisId) {
      return
    }

    appliedResumeIdRef.current = initialResumeState.analysisId
    setReferenceImages([])
    setStoredReferenceImages(initialResumeState.referenceImages || [])
    setGeneratedImages([])
    setEditingImage(null)
    setUserGuidance('')
    setBasicAnalysisResult(initialResumeState.basicAnalysisResult)
    setPromptGenerationResult(initialResumeState.promptGenerationResult)
    setPromptGenerationError(initialResumeState.status === 'FAILED' ? (initialResumeState.errorMessage || '这次分析没有成功完成。') : '')
    setStreamError(initialResumeState.status === 'FAILED' ? (initialResumeState.errorMessage || '这次分析没有成功完成。') : '')
    setAnalysisWarnings([])
    setIsAnalyzing(false)
    setPromptProgress({
      completed: initialResumeState.promptGenerationResult?.recommendedImagePlan.length || 0,
      total: imageTypeOrder.length,
      current: '',
    })
    setSelectedImageType('main-white')
    setSelectedSize('1024x1024')
    setEditedPrompt(initialResumeState.promptGenerationResult?.suggestedPrompts?.['main-white'] || '')

    if (initialResumeState.status === 'SUCCEEDED' && isPromptGenerationComplete(initialResumeState.promptGenerationResult)) {
      setIsStreamCompleted(true)
      setAnalysisStage('completed')
      setAnalysisStageLabel('已从历史记录恢复分析结果，可以继续生成图片')
      setAnalysisProgress(100)
      setCurrentStep(initialStep === 'generate' ? 'generate' : 'analysis')
      setResumeNotice(`已从 ${new Date(initialResumeState.createdAt).toLocaleString()} 的分析记录恢复，当前继续使用已保存的参考图。`)
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
  }, [initialResumeState, initialStep])

  const buildPrompt = useCallback((type: string, promptBody?: string) => {
    if (!analysisResult) return ''
    const basePrompt = promptBody || getSuggestedPrompt(analysisResult, type)
    const referenceAwareHint = buildReferenceAwarePromptHint(type, analysisResult)
    const structuredDirectives = buildStructuredPromptDirectives(type).join('\n')
    const extraParts = [
      structuredDirectives ? `补充执行要求：\n${structuredDirectives}` : '',
      referenceAwareHint,
      userGuidance.trim() ? `补充要求：${userGuidance.trim()}` : '',
    ].filter(Boolean)
    if (!extraParts.length) {
      return basePrompt
    }
    return `${basePrompt}\n\n${extraParts.join('\n\n')}`
  }, [analysisResult, userGuidance])

  const requestGenerate = useCallback(async (
    type: string,
    promptOverride?: string,
    sizeOverride?: RenderSize,
    includeContextualHints = true,
  ) => {
    const prompt = includeContextualHints
      ? buildPrompt(type, promptOverride)
      : (promptOverride || getSuggestedPrompt(analysisResult, type))
    const size = sizeOverride || getDefaultSizeForType(type as AmazonImageType)
    const formData = new FormData()
    formData.append('prompt', prompt)
    formData.append('imageType', type)
    formData.append('size', size)
    formData.append('sourcePage', 'amazon')
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
      } else if (event.type === 'error') {
        throw new Error(event.message)
      }
    }

    if (!resultEvent || resultEvent.type !== 'result') {
      throw new Error('Image generation stream ended without a result')
    }

    return {
      imageUrl: resultEvent.data.imageUrl as string,
      prompt: (resultEvent.data.revisedPrompt || prompt) as string,
      routeSummary: (resultEvent.data.routeSummary || null) as RouteSummary | null,
    }
  }, [analysisResult, buildPrompt, referenceImages, storedReferenceImages])

  const handleAnalyze = useCallback(async (data: AnalyzeFormInput) => {
    const requestId = analyzeRequestIdRef.current + 1
    analyzeRequestIdRef.current = requestId
    analyzeAbortControllerRef.current?.abort()
    const abortController = new AbortController()
    analyzeAbortControllerRef.current = abortController
    lastAnalyzeInputRef.current = data

    setIsAnalyzing(true)
    setPromptGenerationError('')
    setStreamError('')
    setAnalysisWarnings([])
    setIsStreamCompleted(false)
    setAnalysisStage('preparing')
    setAnalysisStageLabel('正在读取商品信息与参考图')
    setAnalysisProgress(10)
    setPromptProgress({ completed: 0, total: imageTypeOrder.length, current: '' })
    setReferenceImages(data.referenceImages)
    setStoredReferenceImages([])
    setGeneratedImages([])
    setEditingImage(null)
    setUserGuidance('')
    setResumeNotice('')
    setBasicAnalysisResult(null)
    setPromptGenerationResult(null)
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

          if (event.type === 'prompt-progress') {
            setPromptProgress({
              completed: event.completed || 0,
              total: event.total || imageTypeOrder.length,
              current: event.current || '',
            })
            continue
          }

          if (event.type === 'prompt-item' && event.key && event.plan && event.prompt) {
            setPromptGenerationResult((prev) => {
              const incomingPlan = event.plan as RecommendedImagePlanItem
              const nextPrompts = {
                ...(prev?.suggestedPrompts || {}),
                [event.key as string]: event.prompt as string,
              }
              const nextPlan = [
                ...(prev?.recommendedImagePlan || []).filter(
                  (item) => !(item.type === incomingPlan.type && item.index === incomingPlan.index),
                ),
                incomingPlan,
              ].sort((a, b) => getPromptOrderIndex(getPromptKeyFromPlan(a)) - getPromptOrderIndex(getPromptKeyFromPlan(b)))

              return {
                recommendedImagePlan: nextPlan,
                suggestedPrompts: nextPrompts,
              }
            })
            continue
          }

          if (event.type === 'warning' && event.message) {
            setAnalysisWarnings((prev) => [...prev, event.message as string])
            continue
          }

          if (event.type === 'error') {
            setStreamError(event.message || '分析失败')
            setPromptGenerationError(event.recoverable ? event.message || 'Prompt 生成失败' : '')
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
            setAnalysisStageLabel('分析完成，可以进入图片生成')
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
          setAnalysisStageLabel('分析完成，可以进入图片生成')
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
        setPromptGenerationResult(null)
        setPromptGenerationError('')
      } else {
        setPromptGenerationError('基础分析已完成，但完整 Prompt 套餐未完成。请重试。')
      }
      setIsAnalyzing(false)
    }
  }, [basicAnalysisResult])

  const handleProceedToGeneration = useCallback(() => {
    if (!analysisResult || !canProceedToGeneration) return
    setSelectedSize(getDefaultSizeForType(selectedImageType))
    setEditedPrompt(getSuggestedPrompt(analysisResult, selectedImageType))
    setCurrentStep('generate')
  }, [analysisResult, canProceedToGeneration, selectedImageType])

  const handleRetryPromptGeneration = useCallback(async () => {
    if (!lastAnalyzeInputRef.current || !basicAnalysisResult) return

    setIsAnalyzing(true)
    setPromptGenerationError('')
    setStreamError('')
    setAnalysisWarnings([])
    setAnalysisStage('prompting')
    setAnalysisStageLabel('正在重新生成完整 Prompt 套餐（0/7）')
    setAnalysisProgress(45)
    setPromptProgress({ completed: 0, total: imageTypeOrder.length, current: '' })
    setPromptGenerationResult(null)
    setIsStreamCompleted(false)

    try {
      const imagePayloads = await Promise.all(
        lastAnalyzeInputRef.current.referenceImages.slice(0, 3).map(async (image) => {
          const arrayBuffer = await image.arrayBuffer()
          const bytes = new Uint8Array(arrayBuffer)
          let binary = ''
          bytes.forEach((byte) => {
            binary += String.fromCharCode(byte)
          })

          return {
            data: btoa(binary),
            mediaType: image.type || 'image/jpeg',
          }
        }),
      )

      const promptsResponse = await axios.post('/api/analyze/prompts', {
        productName: lastAnalyzeInputRef.current.productName,
        description: lastAnalyzeInputRef.current.description,
        category: lastAnalyzeInputRef.current.category,
        targetAudience: lastAnalyzeInputRef.current.targetAudience,
        referenceImages: imagePayloads,
        analysisSummary: buildAnalysisSummaryPayload(basicAnalysisResult),
      })

      const promptsResult = promptsResponse.data as PromptGenerationResult
      setPromptGenerationResult(promptsResult)
      setPromptProgress({
        completed: imageTypeOrder.length,
        total: imageTypeOrder.length,
        current: '',
      })
      setAnalysisStage('completed')
      setAnalysisStageLabel('分析完成，可以进入图片生成')
      setAnalysisProgress(100)
      setIsStreamCompleted(true)
    } catch (error) {
      console.error('Error regenerating prompts:', error)
      setPromptGenerationError('基础分析已完成，但完整 Prompt 套餐未完成。请重试。')
      setAnalysisStage('error')
      setAnalysisStageLabel('Prompt 套餐重新生成失败')
    } finally {
      setIsAnalyzing(false)
    }
  }, [basicAnalysisResult])

  const handleGenerateSingle = useCallback(async () => {
    if (!analysisResult || isGenerating) return
    if (!activeReferenceImageCount) {
      alert('请先上传至少一张参考图，或从历史分析记录恢复参考图后再生成。')
      return
    }

    setIsGenerating(true)
    setRouteNotice('正在尝试第一线路')

    try {
      const result = await requestGenerate(selectedImageType, editedPrompt, selectedSize)
      const newImage: GeneratedImage = {
        id: createImageId(),
        imageUrl: result.imageUrl,
        prompt: result.prompt,
        imageType: selectedImageType,
      }
      setGeneratedImages((prev) => [newImage, ...prev])
    } catch (error) {
      console.error('Error generating image:', error)
      const message = error instanceof Error ? error.message : 'Failed to generate image. Please check your API keys.'
      setRouteNotice(message)
      alert(message)
    } finally {
      setIsGenerating(false)
    }
  }, [activeReferenceImageCount, analysisResult, editedPrompt, isGenerating, requestGenerate, selectedImageType, selectedSize])

  const handleGenerateFullSet = useCallback(async () => {
    if (!analysisResult || isGenerating) return
    if (!activeReferenceImageCount) {
      alert('请先上传至少一张参考图，或从历史分析记录恢复参考图后再生成。')
      return
    }

    setIsGenerating(true)
    setRouteNotice('正在尝试第一线路')

    try {
      const nextImages: GeneratedImage[] = []

      for (const imageType of imageTypeOrder) {
        const result = await requestGenerate(imageType, undefined, getDefaultSizeForType(imageType as AmazonImageType))
        nextImages.push({
          id: createImageId(),
          imageUrl: result.imageUrl,
          prompt: result.prompt,
          imageType,
        })
      }

      setGeneratedImages((prev) => [...nextImages.reverse(), ...prev])
      setRouteNotice('整套图片已完成生成。')
    } catch (error) {
      console.error('Error generating full set:', error)
      const message = error instanceof Error ? error.message : 'Failed to generate the full image set. Please check your API keys.'
      setRouteNotice(message)
      alert(message)
    } finally {
      setIsGenerating(false)
    }
  }, [activeReferenceImageCount, analysisResult, isGenerating, requestGenerate])

  const handleRegenerate = useCallback(async () => {
    if (!editingImage || !activeReferenceImageCount || isGenerating) return

    setIsGenerating(true)
    setRouteNotice('正在尝试第一线路')

    try {
      const result = await requestGenerate(editingImage.imageType, editingImage.prompt, undefined, false)
      const updatedImage: GeneratedImage = {
        ...editingImage,
        id: createImageId(),
        imageUrl: result.imageUrl,
        prompt: result.prompt,
      }

      setGeneratedImages((prev) =>
        prev.map((image) => (image.id === editingImage.id ? updatedImage : image)),
      )
      setEditingImage(updatedImage)
    } catch (error) {
      console.error('Error regenerating image:', error)
      const message = error instanceof Error ? error.message : 'Failed to regenerate image. Please check your API keys.'
      setRouteNotice(message)
      alert(message)
    } finally {
      setIsGenerating(false)
    }
  }, [activeReferenceImageCount, editingImage, isGenerating, requestGenerate])

  const handleDownload = async (image: GeneratedImage) => {
    try {
      const response = await fetch(image.imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `amazon-product-${image.id}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download:', err)
    }
  }

  const handleCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt)
      alert('Prompt copied!')
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
              <h1 className="text-xl font-semibold text-slate-950">Amazon 图片生成助手</h1>
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
                先输入商品信息并上传参考图，让系统理解商品卖点和平台规范，再生成整套图片或单张精修图。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { step: '01', label: '填写商品信息' },
                { step: '02', label: '查看 AI 分析' },
                { step: '03', label: '生成图片' },
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
                      先展示基础分析，再继续生成推荐图片规划和默认提示词。
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {promptGenerationError && basicAnalysisResult && lastAnalyzeInputRef.current && (
                      <button
                        onClick={handleRetryPromptGeneration}
                        disabled={isAnalyzing}
                        className="inline-flex rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        重新生成 Prompt 套餐
                      </button>
                    )}
                    <button
                      onClick={handleProceedToGeneration}
                      disabled={!canProceedToGeneration}
                      className="inline-flex rounded-2xl bg-amazon-orange px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {canProceedToGeneration
                        ? '继续进入图片生成'
                        : `正在生成完整 Prompt 套餐（${promptProgress.completed}/${promptProgress.total}）`}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <AnalysisStatusPanel
                    stage={analysisStage}
                    label={analysisStageLabel}
                    progress={analysisProgress}
                    promptProgress={promptProgress}
                    warnings={analysisWarnings}
                  />

                  {streamError && (
                    <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 md:col-span-2">
                      {streamError}
                    </div>
                  )}

                  {basicAnalysisResult ? (
                    <>
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 md:col-span-2">
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

                      <div className={`rounded-3xl border p-5 ${basicAnalysisResult.referenceImageAdvice.needMoreReferences ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
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

                  <div className="rounded-3xl border border-slate-200 bg-white p-5 md:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-slate-800">参考图规划建议</h4>
                      {!isStreamCompleted && (
                        <span className="text-xs font-medium text-slate-500">
                          正在生成 {promptProgress.completed}/{promptProgress.total}
                        </span>
                      )}
                    </div>

                    {promptGenerationResult?.recommendedImagePlan.length ? (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {imageTypeOrder.map((promptKey) => {
                          const plan = promptGenerationResult.recommendedImagePlan.find(
                            (item) => getPromptKeyFromPlan(item) === promptKey,
                          )
                          const option = imageTypeOptions.find((item) => item.value === promptKey)
                          const prompt = promptGenerationResult.suggestedPrompts[promptKey]

                          return (
                            <div key={promptKey} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="font-medium text-slate-900">{plan?.title || option?.label || promptKey}</div>
                              {plan ? (
                                <>
                                  <p className="mt-2 text-sm text-slate-600">{plan.goal}</p>
                                  <ul className="mt-3 space-y-2 text-sm text-slate-500">
                                    {plan.notes.map((note, idx) => (
                                      <li key={idx} className="flex gap-2">
                                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                                        <span>{note}</span>
                                      </li>
                                    ))}
                                  </ul>
                                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
                                    {prompt || '正在生成 Prompt...'}
                                  </div>
                                </>
                              ) : (
                                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                                  等待生成
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : promptGenerationError ? (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {promptGenerationError}
                      </div>
                    ) : (
                      <AnalysisPlanSkeleton />
                    )}
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-5 md:col-span-2">
                    <h4 className="mb-2 text-sm font-semibold text-slate-800">补充要求将在生成页编辑</h4>
                    <p className="text-sm leading-6 text-slate-500">
                      当前阶段先完成基础分析和整套 Prompt 生成。等完整结果准备好后，再进入下一步统一编辑补充要求与单张 Prompt。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 'generate' && analysisResult && (
              <>
                {buildReferenceAwarePromptHint(selectedImageType, analysisResult) && (
                  <div className="panel p-6">
                    <h3 className="text-lg font-semibold text-slate-900">参考图使用策略</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {buildReferenceAwarePromptHint(selectedImageType, analysisResult)}
                    </p>
                    <p className="mt-3 text-xs text-slate-500">
                      这部分会在发送给生图模型时自动附加，不会覆盖你在下方编辑器里调整的 AI 原始提示词。
                    </p>
                  </div>
                )}

                <div className="panel p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">生成方式</h3>
                      <p className="mt-1 text-sm text-slate-500">可以单张精修，也可以按亚马逊常见图组顺序整套生成。</p>
                      {storedReferenceImages.length > 0 && referenceImages.length === 0 && (
                        <p className="mt-2 text-sm text-sky-700">当前正在复用历史分析里保存的 {storedReferenceImages.length} 张参考图。</p>
                      )}
                    </div>
                    <button
                      onClick={handleGenerateFullSet}
                      disabled={isGenerating}
                      className="rounded-2xl bg-amazon-orange px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {isGenerating ? 'Generating...' : '直接生成整套图'}
                    </button>
                  </div>
                </div>

                {routeNotice && (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                    <p>{routeNotice}</p>
                  </div>
                )}

                <div className="panel p-6">
                  <h3 className="text-lg font-semibold text-slate-900">单张生成</h3>
                  <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {imageTypeOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSelectedImageType(option.value)
                          setSelectedSize(getDefaultSizeForType(option.value))
                          setEditedPrompt(getSuggestedPrompt(analysisResult, option.value))
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
                      Amazon 工作流当前只保留方图输出：`1024x1024` 或 `2048x2048`。
                    </p>
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
                      placeholder="比如：更偏高端感、强调礼赠属性、尽量避免人物出镜、强调北美家居场景等"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      这部分会在生成时附加到当前推荐 Prompt 后面，不会改写系统已经生成好的基础策略。
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
                      生成时会自动拼接上方的参考图策略，以及分析页里填写的补充要求。
                    </p>
                  </div>

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
                      '生成当前这张图'
                    )}
                  </button>
                </div>

                {generatedImages.length > 0 && (
                  <div className="panel p-6">
                    <h3 className="text-lg font-semibold text-slate-900">已生成图片</h3>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {generatedImages.map((image) => (
                        <div key={image.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                          <img
                            src={image.imageUrl}
                            alt="Generated product"
                            className="aspect-square w-full object-cover"
                          />
                          <div className="p-4">
                            <div className="mb-3 text-xs text-slate-500">
                              {imageTypeOptions.find((type) => type.value === image.imageType)?.label}
                            </div>
                            <div className="flex gap-2">
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
                    Edit Image - {imageTypeOptions.find((type) => type.value === editingImage.imageType)?.label}
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
                    src={editingImage.imageUrl}
                    alt="Editing"
                    className="mx-auto w-full max-w-xl rounded-3xl border border-slate-200"
                  />
                </div>

                <div className="mb-5">
                  <label className="mb-2 block text-sm font-medium text-slate-800">
                    Edit Prompt & Regenerate
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
                    Copy Prompt
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
