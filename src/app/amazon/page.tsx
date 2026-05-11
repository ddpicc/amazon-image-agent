'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import ProductInput from '@/components/ProductInput'
import HistorySidebar from '@/components/HistorySidebar'
import { SkeletonBlock } from '@/components/LoadingSpinner'
import { RenderSize } from '@/lib/image-options'

type AmazonImageType = 'main-white' | 'lifestyle' | 'infographic' | 'detail' | 'size'
type PromptImageType = 'main-white' | 'size' | 'detail' | 'infographic-1' | 'infographic-2' | 'lifestyle-1' | 'lifestyle-2'

interface HistoryItem {
  id: string
  productName: string
  timestamp: Date
  imageUrl: string
  prompt: string
  analysis: string
}

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

interface RecommendedImagePlanItem {
  type: AmazonImageType
  index: number
  title: string
  goal: string
  notes: string[]
}

interface ReferenceImageAdvice {
  needMoreReferences: boolean
  reason: string
  recommendedShots: string[]
}

interface ReferenceImageObservation {
  imageIndex: number
  observations: string[]
}

interface BasicAnalysisResult {
  productSummary: string
  sellingPoints: string[]
  referenceImageObservations: ReferenceImageObservation[]
  referenceImageSummary: string
  amazonImageGuidelines: string[]
  complianceChecklist: string[]
  imageContentSuggestions: string[]
  visualStyleRecommendations: string[]
  promptingPrinciples: string[]
  referenceImageAdvice: ReferenceImageAdvice
  canGeneratePrompts: boolean
}

interface AnalysisResult extends BasicAnalysisResult {
  recommendedImagePlan: RecommendedImagePlanItem[]
  suggestedPrompts: Record<string, string>
}

interface PromptGenerationResult {
  recommendedImagePlan: RecommendedImagePlanItem[]
  suggestedPrompts: Record<string, string>
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
  { value: '1536x1024', label: '3:2 横图', note: 'A+ 默认推荐' },
  { value: '1024x1536', label: '2:3 竖图', note: '适合高竖构图' },
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

export default function AmazonPage() {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [currentStep, setCurrentStep] = useState<'input' | 'analysis' | 'generate'>('input')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
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
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false)
  const analyzeRequestIdRef = useRef(0)

  const analysisResult = useMemo<AnalysisResult | null>(() => {
    if (!basicAnalysisResult) return null

    return {
      ...basicAnalysisResult,
      recommendedImagePlan: promptGenerationResult?.recommendedImagePlan || [],
      suggestedPrompts: promptGenerationResult?.suggestedPrompts || {},
    }
  }, [basicAnalysisResult, promptGenerationResult])

  const canProceedToGeneration = useMemo(() => {
    return Boolean(
      analysisResult &&
      !isGeneratingPrompts &&
      Object.keys(analysisResult.suggestedPrompts).length > 0,
    )
  }, [analysisResult, isGeneratingPrompts])

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
    referenceImages.slice(0, 3).forEach((image) => {
      formData.append('referenceImages', image)
    })

    const response = await axios.post('/api/generate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })

    return {
      imageUrl: response.data.imageUrl as string,
      prompt: (response.data.revisedPrompt || prompt) as string,
    }
  }, [analysisResult, buildPrompt, referenceImages])

  const handleAnalyze = useCallback(async (data: {
    productName: string
    description: string
    category: string
    targetAudience: string
    referenceImages: File[]
  }) => {
    const requestId = analyzeRequestIdRef.current + 1
    analyzeRequestIdRef.current = requestId

    setIsAnalyzing(true)
    setIsGeneratingPrompts(false)
    setPromptGenerationError('')
    setReferenceImages(data.referenceImages)
    setGeneratedImages([])
    setEditingImage(null)
    setUserGuidance('')
    setBasicAnalysisResult(null)
    setPromptGenerationResult(null)
    setCurrentStep('analysis')
    setSelectedImageType('main-white')
    setSelectedSize('1024x1024')
    setEditedPrompt('')

    const imagePayloadPromise = Promise.all(
      data.referenceImages.slice(0, 3).map(async (image) => {
        const arrayBuffer = await image.arrayBuffer()
        return {
          data: Buffer.from(arrayBuffer).toString('base64'),
          mediaType: image.type || 'image/jpeg',
        }
      }),
    )

    try {
      const formData = new FormData()
      formData.append('productName', data.productName)
      formData.append('description', data.description)
      formData.append('category', data.category)
      formData.append('targetAudience', data.targetAudience)
      data.referenceImages.slice(0, 3).forEach((image) => {
        formData.append('referenceImages', image)
      })

      const response = await axios.post('/api/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      if (analyzeRequestIdRef.current !== requestId) return

      const basicResult = response.data as BasicAnalysisResult
      setBasicAnalysisResult(basicResult)
      setIsAnalyzing(false)

      if (!basicResult.canGeneratePrompts) {
        return
      }

      setIsGeneratingPrompts(true)

      try {
        const imagePayloads = await imagePayloadPromise
        const promptsResponse = await axios.post('/api/analyze/prompts', {
          productName: data.productName,
          description: data.description,
          category: data.category,
          targetAudience: data.targetAudience,
          referenceImages: imagePayloads,
          analysisSummary: buildAnalysisSummaryPayload(basicResult),
        })

        if (analyzeRequestIdRef.current !== requestId) return

        const promptsResult = promptsResponse.data as PromptGenerationResult
        setPromptGenerationResult(promptsResult)
        setSelectedImageType('main-white')
        setSelectedSize('1024x1024')
        setEditedPrompt(promptsResult.suggestedPrompts['main-white'] || fallbackPrompts['main-white'])
      } catch (promptError) {
        if (analyzeRequestIdRef.current !== requestId) return
        console.error('Error generating prompts:', promptError)
        setPromptGenerationError('基础分析已完成，但推荐图片规划和提示词生成失败。你可以重新分析后再试。')
      } finally {
        if (analyzeRequestIdRef.current === requestId) {
          setIsGeneratingPrompts(false)
        }
      }
    } catch (error) {
      if (analyzeRequestIdRef.current !== requestId) return
      console.error('Error analyzing product:', error)
      alert('Failed to analyze product. Please check your API keys.')
      setCurrentStep('input')
      setBasicAnalysisResult(null)
      setPromptGenerationResult(null)
      setPromptGenerationError('')
      setIsAnalyzing(false)
    }
  }, [])

  const handleProceedToGeneration = useCallback(() => {
    if (!analysisResult || !canProceedToGeneration) return
    setSelectedSize(getDefaultSizeForType(selectedImageType))
    setEditedPrompt(getSuggestedPrompt(analysisResult, selectedImageType))
    setCurrentStep('generate')
  }, [analysisResult, canProceedToGeneration, selectedImageType])

  const handleGenerateSingle = useCallback(async () => {
    if (!analysisResult) return
    if (!referenceImages.length) {
      alert('Please upload at least one reference image first')
      return
    }

    setIsGenerating(true)

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
      alert('Failed to generate image. Please check your API keys.')
    } finally {
      setIsGenerating(false)
    }
  }, [analysisResult, editedPrompt, referenceImages, requestGenerate, selectedImageType, selectedSize])

  const handleGenerateFullSet = useCallback(async () => {
    if (!analysisResult) return
    if (!referenceImages.length) {
      alert('Please upload at least one reference image first')
      return
    }

    setIsGenerating(true)

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
    } catch (error) {
      console.error('Error generating full set:', error)
      alert('Failed to generate the full image set. Please check your API keys.')
    } finally {
      setIsGenerating(false)
    }
  }, [analysisResult, referenceImages, requestGenerate])

  const handleRegenerate = useCallback(async () => {
    if (!editingImage || !referenceImages.length) return

    setIsGenerating(true)

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
      alert('Failed to regenerate image. Please check your API keys.')
    } finally {
      setIsGenerating(false)
    }
  }, [editingImage, referenceImages, requestGenerate])

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

  const handleSelectHistoryItem = useCallback((item: HistoryItem) => {
    setCurrentStep('input')
    setGeneratedImages([
      {
        id: item.id,
        imageUrl: item.imageUrl,
        prompt: item.prompt,
        imageType: 'lifestyle',
      },
    ])
  }, [])

  const handleClearHistory = useCallback(() => {
    setHistory([])
  }, [])

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

        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-6 xl:self-start">
            <HistorySidebar
              history={history}
              onSelectItem={handleSelectHistoryItem}
              onClearHistory={handleClearHistory}
            />
          </aside>

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
                  <button
                    onClick={handleProceedToGeneration}
                    disabled={!canProceedToGeneration}
                    className="inline-flex rounded-2xl bg-amazon-orange px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {isGeneratingPrompts ? '正在生成提示词...' : '继续进入图片生成'}
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
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
                      {isGeneratingPrompts && <span className="text-xs font-medium text-slate-500">Generating prompts...</span>}
                    </div>

                    {promptGenerationResult ? (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {promptGenerationResult.recommendedImagePlan.map((plan) => (
                          <div key={`${plan.type}-${plan.index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="font-medium text-slate-900">{plan.title}</div>
                            <p className="mt-2 text-sm text-slate-600">{plan.goal}</p>
                            <ul className="mt-3 space-y-2 text-sm text-slate-500">
                              {plan.notes.map((note, idx) => (
                                <li key={idx} className="flex gap-2">
                                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                                  <span>{note}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
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
                    <h4 className="mb-2 text-sm font-semibold text-slate-800">你的补充要求（选填）</h4>
                    <textarea
                      value={userGuidance}
                      onChange={(e) => {
                        setUserGuidance(e.target.value)
                      }}
                      rows={4}
                      className="input-field min-h-[116px] resize-none"
                      placeholder="比如：更偏高端感、强调礼赠属性、尽量避免人物出镜、强调北美家居场景等"
                    />
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
                      当前图片服务链路稳定使用 `1024x1024 / 1536x1024 / 1024x1536`。A+ 常见模块以横版更合适。
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

            {currentStep === 'input' && (
              <div className="panel px-6 py-12 text-center sm:px-8">
                <div className="mb-4 text-slate-300">
                  <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-slate-700">No images generated yet</p>
                <p className="mt-2 text-sm text-slate-500">Enter your product information and reference image to get started.</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
