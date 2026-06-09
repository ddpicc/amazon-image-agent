'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import ReferenceImageUploader from '@/components/ReferenceImageUploader'
import { ASPECT_RATIO_OPTIONS, AspectRatio, getDefaultSizeForAspectRatio, getSizesForAspectRatio, RenderSize } from '@/lib/image-options'
import { formatPoints, getGenerationCostDisplay } from '@/lib/points-config'

interface GeneratedImage {
  id: string
  requestId?: string
  imageUrl: string | null
  prompt: string
  revisedPrompt: string
  size: RenderSize
  aspectRatio: AspectRatio
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
  | { type: 'result'; data: { requestId: string; imageUrl: string; revisedPrompt: string; size: RenderSize; aspectRatio?: AspectRatio; routeSummary: RouteSummary | null } }
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
  size: string | null
  aspectRatio: string | null
  active: boolean
}

function createImageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export default function ReversePromptPageClient({ initialPointsBalance }: { initialPointsBalance: number }) {
  const [sourceImages, setSourceImages] = useState<File[]>([])
  const [prompt, setPrompt] = useState('')
  const [analysisSummary, setAnalysisSummary] = useState('')
  const [generationReferenceImages, setGenerationReferenceImages] = useState<File[]>([])
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [size, setSize] = useState<RenderSize>(getDefaultSizeForAspectRatio('1:1'))
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [pointsBalance, setPointsBalance] = useState(initialPointsBalance)
  const [isRefiningPrompt, setIsRefiningPrompt] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [promptRefineError, setPromptRefineError] = useState('')
  const [routeNotice, setRouteNotice] = useState('')
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [showGenerationStage, setShowGenerationStage] = useState(false)
  const [userIntent, setUserIntent] = useState('')
  const [lastRefinedIntent, setLastRefinedIntent] = useState('')
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const pollingTimersRef = useRef<Map<string, number>>(new Map())

  const availableSizes = useMemo(() => getSizesForAspectRatio(aspectRatio), [aspectRatio])
  const generationCost = getGenerationCostDisplay('reverse-prompt')
  const hasEnoughPointsToGenerate = pointsBalance >= generationCost
  const sourcePreviewUrl = useMemo(() => {
    const sourceImage = sourceImages[0]
    return sourceImage ? URL.createObjectURL(sourceImage) : null
  }, [sourceImages])

  useEffect(() => {
    if (!sourcePreviewUrl) return
    return () => window.URL.revokeObjectURL(sourcePreviewUrl)
  }, [sourcePreviewUrl])

  useEffect(() => {
    if (!availableSizes.some((option) => option.value === size)) {
      setSize(getDefaultSizeForAspectRatio(aspectRatio))
    }
  }, [aspectRatio, availableSizes, size])

  useEffect(() => {
    if (!copiedPrompt) return

    const timeoutId = window.setTimeout(() => setCopiedPrompt(false), 2000)
    return () => window.clearTimeout(timeoutId)
  }, [copiedPrompt])

  useEffect(() => {
    setShowGenerationStage(false)
    setPrompt('')
    setAnalysisSummary('')
    setAnalyzeError('')
    setPromptRefineError('')
    setUserIntent('')
    setLastRefinedIntent('')
    setGenerationReferenceImages([])
    setGeneratedImages([])
    setRouteNotice('')
  }, [sourceImages])

  useEffect(() => {
    return () => {
      pollingTimersRef.current.forEach((timerId) => window.clearInterval(timerId))
      pollingTimersRef.current.clear()
    }
  }, [])

  const streamGenerate = async (formData: FormData) => {
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
      return { kind: 'queued' as const, data: queuedEvent.data }
    }

    if (!resultEvent || resultEvent.type !== 'result') {
      throw new Error('Image generation stream ended without a result')
    }

    return { kind: 'result' as const, data: resultEvent.data }
  }

  const startPollingRequest = (requestId: string) => {
    if (pollingTimersRef.current.has(requestId)) {
      return
    }

    const pollOnce = async () => {
      try {
        const response = await fetch(`/api/generate/${requestId}`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const payload = await response.json() as GenerationStatusPayload
        setGeneratedImages((prev) => prev.map((image) => {
          if (image.requestId !== requestId) {
            return image
          }

          const nextImage: GeneratedImage = {
            ...image,
            imageUrl: payload.imageUrl,
            prompt: payload.prompt || image.prompt,
            revisedPrompt: payload.revisedPrompt || image.revisedPrompt,
            size: (payload.size as RenderSize) || image.size,
            aspectRatio: (payload.aspectRatio as AspectRatio) || image.aspectRatio,
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

        if (!payload.active) {
          const timerId = pollingTimersRef.current.get(requestId)
          if (timerId) {
            window.clearInterval(timerId)
            pollingTimersRef.current.delete(requestId)
          }
        }
      } catch (error) {
        console.error('Failed to poll image generation request:', error)
        const message = error instanceof Error ? error.message : '同步生成结果失败'
        setRouteNotice(message)
        setGeneratedImages((prev) => prev.map((image) => (
          image.requestId === requestId
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
    pollingTimersRef.current.set(requestId, timerId)
  }

  const handleAnalyze = async () => {
    const sourceImage = sourceImages[0]
    if (!sourceImage) return

    setIsAnalyzing(true)
    setAnalyzeError('')
    setAnalysisSummary('')
    setShowGenerationStage(false)

    try {
      const formData = new FormData()
      formData.append('sourceImage', sourceImage)

      const response = await fetch('/api/reverse-prompt', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze image')
      }

      setPrompt(data.prompt || data.summary || '')
      setAnalysisSummary('')
      setPromptRefineError('')
      setUserIntent('')
      setLastRefinedIntent('')
      requestAnimationFrame(() => {
        promptTextareaRef.current?.focus()
        promptTextareaRef.current?.setSelectionRange(0, promptTextareaRef.current.value.length)
      })
    } catch (error) {
      console.error('Failed to analyze reverse prompt image:', error)
      setAnalyzeError(error instanceof Error ? error.message : 'Failed to analyze image')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleRemoveSourceImage = () => {
    setSourceImages([])
  }

  const refinePrompt = async () => {
    const trimmedPrompt = prompt.trim()
    const trimmedIntent = userIntent.trim()

    if (!trimmedPrompt) {
      throw new Error('Prompt is required')
    }

    if (!trimmedIntent) {
      setPromptRefineError('请输入一句话补充要求后再优化提示词')
      return trimmedPrompt
    }

    setIsRefiningPrompt(true)
    setPromptRefineError('')

    try {
      const response = await fetch('/api/reverse-prompt/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractedPrompt: trimmedPrompt,
          userIntent: trimmedIntent,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to refine prompt')
      }

      const nextPrompt = typeof data.finalPrompt === 'string' && data.finalPrompt.trim()
        ? data.finalPrompt.trim()
        : trimmedPrompt

      setPrompt(nextPrompt)
      setUserIntent('')
      setLastRefinedIntent(trimmedIntent)
      return nextPrompt
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refine prompt'
      setPromptRefineError(message)
      throw error
    } finally {
      setIsRefiningPrompt(false)
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    if (!hasEnoughPointsToGenerate) {
      alert('积分不足，请先充值后再进入图片生成。')
      return
    }

    setIsGenerating(true)
    setRouteNotice('正在尝试第一线路')

    try {
      const resolvedPrompt = prompt.trim()
      const formData = new FormData()
      formData.append('prompt', resolvedPrompt)
      formData.append('aspectRatio', aspectRatio)
      formData.append('size', size)
      formData.append('sourcePage', 'playground')
      formData.append('billingScene', 'reverse-prompt')
      generationReferenceImages.slice(0, 3).forEach((image) => {
        formData.append('referenceImages', image)
      })

      const result = await streamGenerate(formData)

      if (result.kind === 'queued') {
        setRouteNotice(result.data.statusMessage)
        setGeneratedImages((prev) => [{
          id: result.data.requestId,
          requestId: result.data.requestId,
          imageUrl: null,
          prompt: resolvedPrompt,
          revisedPrompt: resolvedPrompt,
          size,
          aspectRatio,
          status: 'QUEUED',
          statusMessage: result.data.statusMessage,
          errorMessage: null,
          charged: false,
        }, ...prev])
        startPollingRequest(result.data.requestId)
      } else {
        const nextImage: GeneratedImage = {
          id: createImageId(),
          requestId: result.data.requestId,
          imageUrl: result.data.imageUrl as string,
          prompt: resolvedPrompt,
          revisedPrompt: (result.data.revisedPrompt || resolvedPrompt) as string,
          size: (result.data.size || size) as RenderSize,
          aspectRatio: (result.data.aspectRatio || aspectRatio) as AspectRatio,
          status: 'SUCCEEDED',
          charged: true,
        }

        setGeneratedImages((prev) => [nextImage, ...prev])
        setPointsBalance((prev) => Math.max(0, Number((prev - generationCost).toFixed(1))))
      }
    } catch (error) {
      console.error('Failed to generate reverse prompt image:', error)
      const message = error instanceof Error ? error.message : 'Failed to generate image. Please check your API keys.'
      setRouteNotice(message)
      alert(message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownload = async (image: GeneratedImage) => {
    try {
      if (!image.imageUrl) return
      const response = await fetch(image.imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `reverse-prompt-${image.id}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download:', error)
    }
  }

  const handleCopyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedPrompt(true)
    } catch (error) {
      console.error('Failed to copy prompt:', error)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">灵感拆解</div>
            <h1 className="text-xl font-semibold text-slate-950">以图生提示词</h1>
          </div>
          <Link href="/" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回首页
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="panel mb-6 px-6 py-7 sm:px-8">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full bg-amazon-blue/10 px-3 py-1 text-xs font-semibold text-amazon-blue">新工作流</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">先拆提示词，再做同款图片</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              先上传一张目标图，让 AI 拆解出一段可直接生图的提示词；确认后，再展开同款生成选项继续做图。再生图每次扣 {formatPoints(generationCost)} 积分。
            </p>
          </div>
        </section>

        <section className="panel p-6 sm:p-8">
          <div className="mx-auto max-w-3xl space-y-6">
            {sourceImages.length === 0 && (
              <ReferenceImageUploader
                label="源图片 *"
                helperText="这里只上传 1 张要拆解的目标图。拿到提示词前，页面不会显示后续生图选项。"
                maxImages={1}
                emptySummaryText="上传 1 张源图片，支持 PNG、JPG、WEBP。"
                value={sourceImages}
                onChange={setSourceImages}
              />
            )}

            {sourcePreviewUrl && (
              <div className={`overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 ${isAnalyzing ? 'scan-frame' : ''}`}>
                <div className="relative aspect-[4/3] w-full bg-slate-100">
                  <img src={sourcePreviewUrl} alt="源图片预览" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={handleRemoveSourceImage}
                    className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-base text-white transition hover:bg-black/80"
                  >
                    ×
                  </button>
                  {isAnalyzing && (
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-slate-950/70 via-slate-900/20 to-transparent px-4 py-4 text-white">
                      <div>
                        <div className="text-sm font-semibold">正在拆解画面信息</div>
                        <div className="mt-1 text-xs text-white/80">识别主体、构图、材质、光线和整体风格...</div>
                      </div>
                      <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
                        AI 扫描中
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing || sourceImages.length === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isAnalyzing ? '正在拆解提示词...' : '开始拆解提示词'}
            </button>

            {analyzeError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {analyzeError}
              </div>
            )}

            {prompt && !showGenerationStage && !hasEnoughPointsToGenerate && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                当前积分不足，以图生提示词再生图需要 {formatPoints(generationCost)} 积分。请先前往 <Link href="/points/recharge" className="font-semibold underline">积分中心</Link> 充值或兑换积分包后再进入生图。
              </div>
            )}

            {prompt && (
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="block text-sm font-medium text-slate-800">当前提示词</div>
                  <button
                    type="button"
                    onClick={() => handleCopyPrompt(prompt)}
                    disabled={!prompt.trim()}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    {copiedPrompt ? '已复制' : '复制提示词'}
                  </button>
                </div>
                <textarea
                  id="prompt"
                  ref={promptTextareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  className="input-field min-h-[140px] resize-none"
                  placeholder="上传图片并开始分析后，这里会出现可直接继续编辑的提示词..."
                />
                {!showGenerationStage && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!hasEnoughPointsToGenerate) {
                        alert('积分不足，请先充值后再进入图片生成。')
                        return
                      }
                      setShowGenerationStage(true)
                    }}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amazon-blue px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600"
                  >
                    做同款图片
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {showGenerationStage && (
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <section className="panel space-y-6 p-6 sm:p-8">
              <ReferenceImageUploader
                label="附加参考图"
                helperText="可选，最多上传 3 张。这些图片会参与后续生图控图，不等于上面的源图片。"
                value={generationReferenceImages}
                onChange={setGenerationReferenceImages}
              />

              <div>
                <label className="mb-3 block text-sm font-medium text-slate-800">宽高比</label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {ASPECT_RATIO_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setAspectRatio(option.value)}
                      className={`rounded-2xl border p-4 text-left transition ${aspectRatio === option.value ? 'border-amazon-orange bg-orange-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <div className="text-sm font-medium text-slate-800">{option.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-3 block text-sm font-medium text-slate-800">图片尺寸</label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {availableSizes.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSize(option.value)}
                      className={`rounded-2xl border p-4 text-left transition ${size === option.value ? 'border-amazon-orange bg-orange-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <div className="text-sm font-medium text-slate-800">{option.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{option.note}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amazon-blue px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isGenerating ? '生成中...' : '开始生成图片'}
              </button>

              {!hasEnoughPointsToGenerate && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  当前积分不足，以图生提示词再生图需要 {formatPoints(generationCost)} 积分。请先前往 <Link href="/points/recharge" className="font-semibold underline">积分中心</Link> 充值或兑换积分包后再进入生图。
                </div>
              )}

              {routeNotice && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p>{routeNotice}</p>
                </div>
              )}
            </section>

            <section className="space-y-6">
              <div className="panel p-6">
                <h3 className="text-lg font-semibold text-slate-900">当前 Prompt</h3>
                <div className="mt-4 space-y-5">
                  <div>
                    <textarea
                      id="generation-prompt"
                      value={prompt}
                      onChange={(e) => {
                        setPrompt(e.target.value)
                        setPromptRefineError('')
                        setLastRefinedIntent('')
                      }}
                      rows={6}
                      className="input-field min-h-[170px] resize-none"
                      placeholder="这里会保留当前提示词，你也可以手动微调。"
                    />
                  </div>

                  <div>
                    <label htmlFor="user-intent" className="mb-2 block text-sm font-medium text-slate-800">一句话补充要求</label>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        id="user-intent"
                        type="text"
                        value={userIntent}
                        onChange={(e) => {
                          setUserIntent(e.target.value)
                          setPromptRefineError('')
                        }}
                        className="input-field"
                        placeholder="例如：用参考图中的人物，做同款"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void refinePrompt()
                        }}
                        disabled={isRefiningPrompt || !prompt.trim() || !userIntent.trim() || userIntent.trim() === lastRefinedIntent}
                        className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {isRefiningPrompt ? '优化中...' : '优化提示词'}
                      </button>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">这句话会和当前提示词一起汇总成最终用于生图的提示词。</p>
                  </div>

                  {promptRefineError && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                      {promptRefineError}
                    </div>
                  )}
                </div>
              </div>

              {generatedImages.length === 0 ? (
                <div className="panel px-6 py-12 text-center sm:px-8">
                  <div className="mb-4 text-slate-300">
                    <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-lg font-medium text-slate-700">还没有生成图片</p>
                  <p className="mt-2 text-sm text-slate-500">提示词已经拆好，接下来可以补充参考图或直接开始做同款。</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {generatedImages.map((image) => (
                    <article key={image.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                      {image.imageUrl ? (
                        <img src={image.imageUrl} alt="生成结果" className="aspect-square w-full object-cover" />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center bg-slate-100 text-sm text-slate-400">
                          {image.status === 'FAILED' ? '生成失败' : '生成中'}
                        </div>
                      )}
                      <div className="space-y-3 p-4">
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">{image.aspectRatio}</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">{image.size}</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">{image.status}</span>
                        </div>
                        {image.statusMessage && image.status !== 'SUCCEEDED' ? (
                          <p className="text-sm leading-6 text-slate-500">{image.statusMessage}</p>
                        ) : (
                          <p className="line-clamp-3 text-sm leading-6 text-slate-600">{image.revisedPrompt}</p>
                        )}
                        {image.errorMessage && (
                          <p className="text-sm text-rose-600">{image.errorMessage}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyPrompt(image.revisedPrompt)}
                            className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                          >
                            复制提示词
                          </button>
                          {image.imageUrl && image.status === 'SUCCEEDED' && (
                            <button
                              type="button"
                              onClick={() => handleDownload(image)}
                              className="flex-1 rounded-xl bg-amazon-blue px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-600"
                            >
                              下载图片
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
