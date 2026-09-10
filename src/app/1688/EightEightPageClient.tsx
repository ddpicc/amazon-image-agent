'use client'

import { FormEvent, useState } from 'react'
import AmazonPageClient from '@/app/amazon/AmazonPageClient'
import type { ProductInputInitialSource } from '@/components/ProductInput'
import { AMAZON_REFERENCE_IMAGE_LIMIT } from '@/lib/amazon-workflow'
import type { ImageModelOption } from '@/lib/image-options'

interface Product1688Result {
  offerId: string
  title: string
  images: string[]
  sourceUrl: string
  selectionToken: string
}

export default function EightEightPageClient({
  initialPointsBalance,
  imageModels,
}: {
  initialPointsBalance: number
  imageModels: ImageModelOption[]
}) {
  const [source, setSource] = useState('')
  const [result, setResult] = useState<Product1688Result | null>(null)
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([])
  const [workflowSource, setWorkflowSource] = useState<ProductInputInitialSource | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setResult(null)
    setSelectedIndexes([])
    setIsLoading(true)

    try {
      const response = await fetch('/api/1688/product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      const payload = await response.json() as { result?: Product1688Result; error?: string }
      if (!response.ok || !payload.result) throw new Error(payload.error || '1688 商品图片获取失败，请稍后重试。')
      setResult(payload.result)
      setSelectedIndexes(payload.result.images.slice(0, AMAZON_REFERENCE_IMAGE_LIMIT).map((_, index) => index))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '1688 商品图片获取失败，请稍后重试。')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleImage = (index: number) => {
    setError('')
    setSelectedIndexes((current) => {
      if (current.includes(index)) return current.filter((item) => item !== index)
      if (current.length >= AMAZON_REFERENCE_IMAGE_LIMIT) {
        setError(`最多选择 ${AMAZON_REFERENCE_IMAGE_LIMIT} 张图片，请先取消一张。`)
        return current
      }
      return [...current, index].sort((a, b) => a - b)
    })
  }

  const startAmazonWorkflow = () => {
    if (!result || !selectedIndexes.length) return
    setWorkflowSource({
      productName: result.title,
      sourceLabel: `1688 · ${result.offerId}`,
      selectionToken: result.selectionToken,
      referenceImages: selectedIndexes.map((sourceIndex) => ({
        sourceIndex,
        url: result.images[sourceIndex],
      })),
    })
  }

  if (workflowSource) {
    return (
      <AmazonPageClient
        initialResumeState={null}
        initialPointsBalance={initialPointsBalance}
        imageModels={imageModels}
        initialSourceProduct={workflowSource}
        onBackToSource={() => setWorkflowSource(null)}
      />
    )
  }

  return (
    <main className="min-h-[calc(100vh-76px)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">1688 货源工作流</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">选择货源图片，继续制作 Amazon 图组</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">输入 1688 商品链接或 offerid，获取商品图片后勾选需要使用的图片，再进入 Amazon 图片分析与生图流程。</p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            {['获取图片', '勾选图片', '分析与生图'].map((label, index) => <div key={label} className="rounded-xl bg-slate-50 px-2 py-3 text-center"><div className="text-xs font-semibold text-violet-600">0{index + 1}</div><div className="mt-1 text-xs font-medium text-slate-700">{label}</div></div>)}
          </div>
        </header>

        <div className="mt-10 grid gap-6 xl:grid-cols-[minmax(0,410px)_minmax(0,1fr)] xl:items-start">
          <form onSubmit={handleSubmit} className="panel space-y-6 p-6 sm:p-8 xl:sticky xl:top-6">
            <div>
              <label htmlFor="1688-source" className="mb-2 block text-sm font-semibold text-slate-900">1688 商品链接或 offerid</label>
              <input id="1688-source" type="text" value={source} onChange={(event) => setSource(event.target.value)} placeholder="粘贴商品链接，或直接输入 offerid" className="input-field" required />
              <p className="mt-2 text-xs leading-5 text-slate-500">链接和纯数字 offerid 均可识别。</p>
            </div>

            {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">{error}</div>}

            <button type="submit" disabled={isLoading || !source.trim()} className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-400">
              {isLoading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
              {isLoading ? '正在获取商品图片...' : '获取商品图片'}
            </button>

            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-900">最多选择 {AMAZON_REFERENCE_IMAGE_LIMIT} 张。建议优先选择能看清商品全貌、不同角度和关键细节的图片。</div>
          </form>

          <section aria-live="polite" className="min-w-0">
            {!result && !isLoading && (
              <div className="panel flex min-h-[460px] flex-col items-center justify-center px-6 py-12 text-center sm:px-10">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-100 text-violet-600" aria-hidden="true"><svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 19.5h16.5A1.5 1.5 0 0 0 21.75 18V6A1.5 1.5 0 0 0 20.25 4.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z" /></svg></div>
                <h2 className="mt-5 text-xl font-semibold text-slate-900">商品图片会显示在这里</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">获取成功后，可以逐张勾选要带入 Amazon 图片工作流的参考图。</p>
              </div>
            )}

            {isLoading && (
              <div className="panel flex min-h-[460px] flex-col items-center justify-center px-6 py-12 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-violet-600" aria-hidden="true" />
                <h2 className="mt-5 text-xl font-semibold text-slate-900">正在获取商品图片</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">商品图片较多时可能需要一点时间，请保持页面打开。</p>
              </div>
            )}

            {result && !isLoading && (
              <div className="space-y-4">
                <div className="panel p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-sm font-semibold text-slate-950">已获取 {result.images.length} 张商品图片</p><p className="mt-1 text-xs text-slate-500">已选择 {selectedIndexes.length} / {AMAZON_REFERENCE_IMAGE_LIMIT} 张</p></div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setSelectedIndexes(result.images.slice(0, AMAZON_REFERENCE_IMAGE_LIMIT).map((_, index) => index))} className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-violet-300 hover:text-violet-700">选择前 {Math.min(AMAZON_REFERENCE_IMAGE_LIMIT, result.images.length)} 张</button>
                      <button type="button" onClick={() => setSelectedIndexes([])} className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900">清空</button>
                    </div>
                  </div>
                </div>

                <div className="panel p-5 sm:p-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {result.images.map((image, index) => {
                      const selected = selectedIndexes.includes(index)
                      const disabled = !selected && selectedIndexes.length >= AMAZON_REFERENCE_IMAGE_LIMIT
                      return (
                        <button key={`${image}-${index}`} type="button" aria-pressed={selected} disabled={disabled} onClick={() => toggleImage(index)} className={`group relative cursor-pointer overflow-hidden rounded-2xl border-2 bg-slate-50 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${selected ? 'border-violet-600 ring-4 ring-violet-100' : 'border-slate-200 hover:border-violet-300'}`}>
                          <img src={image} alt={`1688 商品图片 ${index + 1}`} loading={index < 4 ? 'eager' : 'lazy'} referrerPolicy="no-referrer" className="aspect-square w-full bg-white object-contain" />
                          <span className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold shadow-sm ${selected ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white/95 text-transparent'}`} aria-hidden="true">✓</span>
                          <span className="absolute bottom-2 left-2 rounded-full bg-slate-950/75 px-2 py-1 text-[11px] font-semibold text-white">图 {index + 1}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <button type="button" onClick={startAmazonWorkflow} disabled={!selectedIndexes.length} className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-amazon-orange px-6 py-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400">用选中图片开始 Amazon 图片工作流<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
