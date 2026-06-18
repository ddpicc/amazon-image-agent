'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ReferenceImageUploader from '@/components/ReferenceImageUploader'
import { DEFAULT_IMAGE_MODEL, IMAGE_MODEL_OPTIONS, ImageModel, RenderSize, SIZE_OPTIONS } from '@/lib/image-options'
import { formatPoints, getGenerationCostDisplay } from '@/lib/points-config'

interface GeneratedImage {
  id: string
  requestId?: string
  imageUrl: string | null
  prompt: string
  revisedPrompt: string
  size: RenderSize
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
  | { type: 'result'; data: { requestId: string; imageUrl: string; revisedPrompt: string; size: RenderSize; routeSummary: RouteSummary | null } }
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
  active: boolean
}

function createImageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export default function PlaygroundPage({ initialPointsBalance }: { initialPointsBalance: number }) {
  const [prompt, setPrompt] = useState('')
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [model, setModel] = useState<ImageModel>(DEFAULT_IMAGE_MODEL)
  const [size, setSize] = useState<RenderSize>('1024x1024')
  const [isGenerating, setIsGenerating] = useState(false)
  const [pointsBalance, setPointsBalance] = useState(initialPointsBalance)
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [routeNotice, setRouteNotice] = useState('')
  const pollingTimersRef = useRef<Map<string, number>>(new Map())

  const generationCost = getGenerationCostDisplay('playground')
  const hasEnoughPointsToGenerate = pointsBalance >= generationCost

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

          const nextStatus = payload.status
          const nextImage: GeneratedImage = {
            ...image,
            imageUrl: payload.imageUrl,
            prompt: payload.prompt || image.prompt,
            revisedPrompt: payload.revisedPrompt || image.revisedPrompt,
            size: (payload.size as RenderSize) || image.size,
            status: nextStatus,
            statusMessage: payload.statusMessage,
            errorMessage: payload.errorMessage,
          }

          if (nextStatus === 'SUCCEEDED' && !image.charged) {
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

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    if (!hasEnoughPointsToGenerate) {
      alert('积分不足，请先充值后再进入图片生成。')
      return
    }

    setIsGenerating(true)
    setRouteNotice('正在提交任务到图片服务')

    try {
      const formData = new FormData()
      formData.append('prompt', prompt.trim())
      formData.append('model', model)
      formData.append('size', size)
      formData.append('sourcePage', 'playground')
      formData.append('billingScene', 'playground')
      referenceImages.slice(0, 3).forEach((image) => {
        formData.append('referenceImages', image)
      })

      const result = await streamGenerate(formData)

      if (result.kind === 'queued') {
        setRouteNotice(result.data.statusMessage)
        setGeneratedImages((prev) => [{
          id: result.data.requestId,
          requestId: result.data.requestId,
          imageUrl: null,
          prompt: prompt.trim(),
          revisedPrompt: prompt.trim(),
          size,
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
          prompt,
          revisedPrompt: (result.data.revisedPrompt || prompt.trim()) as string,
          size: (result.data.size || size) as RenderSize,
          status: 'SUCCEEDED',
          charged: true,
        }

        setGeneratedImages((prev) => [nextImage, ...prev])
        setPointsBalance((prev) => Math.max(0, Number((prev - generationCost).toFixed(1))))
      }
    } catch (error) {
      console.error('Failed to generate playground image:', error)
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
      link.download = `playground-${image.id}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download:', error)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">自由生成</div>
            <h1 className="text-xl font-semibold text-slate-950">单张自由生成</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="panel mb-6 px-6 py-7 sm:px-8">
          <div className="max-w-3xl">
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">提示词 + 参考图 + 尺寸</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              不经过商品分析，直接组合提示词、参考图与尺寸来测试单张图片效果。当前单张自由生成每次扣 {formatPoints(generationCost)} 积分。
            </p>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <section className="panel space-y-6 p-6 sm:p-8">
            <div>
              <label htmlFor="prompt" className="mb-2 block text-sm font-medium text-slate-800">提示词 *</label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={8}
                className="input-field min-h-[180px] resize-none"
                placeholder="请描述你想生成的图片效果，例如主体、场景、风格、材质、光线和构图重点..."
              />
            </div>

            <ReferenceImageUploader
              label="参考图"
              helperText="可选，最多上传 3 张。不上传时会直接走纯提示词生图。"
              value={referenceImages}
              onChange={setReferenceImages}
            />

            <div>
              <label className="mb-3 block text-sm font-medium text-slate-800">生成模型</label>
              <div className="grid gap-3 sm:grid-cols-2">
                {IMAGE_MODEL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setModel(option.value)}
                    className={`rounded-2xl border p-4 text-left transition ${model === option.value ? 'border-amazon-orange bg-orange-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
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
                {SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSize(option.value)}
                    className={`rounded-2xl border p-4 text-left transition ${size === option.value ? 'border-amazon-orange bg-orange-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <div className="text-sm font-medium text-slate-800">{option.label}</div>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                支持方图、横版和竖版多种尺寸，方便做清晰度和构图测试。
              </p>
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
                当前积分不足，单张自由生成需要 {formatPoints(generationCost)} 积分。请先前往 <Link href="/points/recharge" className="font-semibold underline">积分中心</Link> 充值或兑换积分包后再进入生图。
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
              <h3 className="text-lg font-semibold text-slate-900">当前设置</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">模型</div>
                  <div className="mt-1 text-sm font-medium text-slate-800">{IMAGE_MODEL_OPTIONS.find((option) => option.value === model)?.label || model}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">尺寸</div>
                  <div className="mt-1 text-sm font-medium text-slate-800">{size}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">参考图</div>
                  <div className="mt-1 text-sm font-medium text-slate-800">{referenceImages.length ? `${referenceImages.length} / 3` : '未上传'}</div>
                </div>
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
                <p className="mt-2 text-sm text-slate-500">填写提示词后即可测试；如需控图，再补充参考图。</p>
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
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{image.size}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{image.status}</span>
                      </div>
                      {image.statusMessage && image.status !== 'SUCCEEDED' && (
                        <p className="text-xs text-slate-500">{image.statusMessage}</p>
                      )}
                      {image.errorMessage && (
                        <p className="text-xs text-rose-600">{image.errorMessage}</p>
                      )}
                      <div className="flex gap-2">
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
      </div>
    </main>
  )
}
