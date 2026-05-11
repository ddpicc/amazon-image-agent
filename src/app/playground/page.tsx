'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import Link from 'next/link'
import ReferenceImageUploader from '@/components/ReferenceImageUploader'
import { ASPECT_RATIO_OPTIONS, AspectRatio, getDefaultSizeForAspectRatio, getSizesForAspectRatio, RenderSize, SIZE_OPTIONS } from '@/lib/image-options'

interface GeneratedImage {
  id: string
  imageUrl: string
  prompt: string
  revisedPrompt: string
  size: RenderSize
  aspectRatio: AspectRatio
}

function createImageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export default function PlaygroundPage() {
  const [prompt, setPrompt] = useState('')
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [size, setSize] = useState<RenderSize>(getDefaultSizeForAspectRatio('1:1'))
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])

  const availableSizes = useMemo(() => getSizesForAspectRatio(aspectRatio), [aspectRatio])

  useEffect(() => {
    if (!availableSizes.some((option) => option.value === size)) {
      setSize(getDefaultSizeForAspectRatio(aspectRatio))
    }
  }, [aspectRatio, availableSizes, size])

  const handleGenerate = async () => {
    if (!prompt.trim() || !referenceImages.length) return

    setIsGenerating(true)

    try {
      const formData = new FormData()
      formData.append('prompt', prompt.trim())
      formData.append('aspectRatio', aspectRatio)
      formData.append('size', size)
      referenceImages.slice(0, 3).forEach((image) => {
        formData.append('referenceImages', image)
      })

      const response = await axios.post('/api/generate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      const nextImage: GeneratedImage = {
        id: createImageId(),
        imageUrl: response.data.imageUrl as string,
        prompt,
        revisedPrompt: (response.data.revisedPrompt || prompt.trim()) as string,
        size: (response.data.size || size) as RenderSize,
        aspectRatio: (response.data.aspectRatio || aspectRatio) as AspectRatio,
      }

      setGeneratedImages((prev) => [nextImage, ...prev])
    } catch (error) {
      console.error('Failed to generate playground image:', error)
      alert('Failed to generate image. Please check your API keys.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownload = async (image: GeneratedImage) => {
    try {
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

  const handleCopyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error('Failed to copy prompt:', error)
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
          <Link href="/" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回首页
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="panel mb-6 px-6 py-7 sm:px-8">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full bg-amazon-blue/10 px-3 py-1 text-xs font-semibold text-amazon-blue">独立测试流程</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">提示词 + 参考图 + 比例 + 尺寸</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              不经过商品分析，直接组合提示词、参考图、宽高比与尺寸来测试单张图片效果。
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
              helperText="至少上传 1 张，最多 3 张。"
              value={referenceImages}
              onChange={setReferenceImages}
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
              <p className="mt-3 text-xs text-slate-500">
                当前比例只展示可用尺寸；后端会按所选比例自动兜底到可用尺寸。
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim() || !referenceImages.length}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amazon-blue px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isGenerating ? '生成中...' : '开始生成图片'}
            </button>
          </section>

          <section className="space-y-6">
            <div className="panel p-6">
              <h3 className="text-lg font-semibold text-slate-900">当前设置</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">比例</div>
                  <div className="mt-1 text-sm font-medium text-slate-800">{aspectRatio}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">尺寸</div>
                  <div className="mt-1 text-sm font-medium text-slate-800">{size}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">参考图</div>
                  <div className="mt-1 text-sm font-medium text-slate-800">{referenceImages.length} / 3</div>
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
                <p className="mt-2 text-sm text-slate-500">填写提示词并上传参考图后，就可以开始测试单张图片效果。</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {generatedImages.map((image) => (
                  <article key={image.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <img src={image.imageUrl} alt="生成结果" className="aspect-square w-full object-cover" />
                    <div className="space-y-3 p-4">
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{image.aspectRatio}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{image.size}</span>
                      </div>
                      <p className="line-clamp-3 text-sm leading-6 text-slate-600">{image.revisedPrompt}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyPrompt(image.revisedPrompt)}
                          className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                        >
                          复制提示词
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(image)}
                          className="flex-1 rounded-xl bg-amazon-blue px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-600"
                        >
                          下载图片
                        </button>
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
