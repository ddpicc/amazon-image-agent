'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { AmazonMarketplace, CompetitorStrategyResult, ProductImageSourceMode } from '@/lib/competitor-strategy-types'
import CompetitorStrategyResults from './CompetitorStrategyResults'
import ProductImageSourceCard from './ProductImageSourceCard'

export default function CompetitorStrategyPageClient() {
  const [competitorMode, setCompetitorMode] = useState<ProductImageSourceMode>('asin')
  const [competitorAsin, setCompetitorAsin] = useState('')
  const [competitorMarketplace, setCompetitorMarketplace] = useState<AmazonMarketplace>('US')
  const [competitorImages, setCompetitorImages] = useState<File[]>([])
  const [hasOwnProduct, setHasOwnProduct] = useState(false)
  const [ownMode, setOwnMode] = useState<ProductImageSourceMode>('asin')
  const [ownAsin, setOwnAsin] = useState('')
  const [ownMarketplace, setOwnMarketplace] = useState<AmazonMarketplace>('US')
  const [ownImages, setOwnImages] = useState<File[]>([])
  const [result, setResult] = useState<CompetitorStrategyResult | null>(null)
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([])
  const [error, setError] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  useEffect(() => {
    const urls = competitorImages.map((file) => URL.createObjectURL(file))
    setUploadedImageUrls(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [competitorImages])

  const competitorReady = competitorMode === 'asin' ? competitorAsin.trim().length > 0 : competitorImages.length > 0
  const ownReady = !hasOwnProduct || (ownMode === 'asin' ? ownAsin.trim().length > 0 : ownImages.length > 0)
  const canSubmit = useMemo(() => !isAnalyzing && competitorReady && ownReady, [competitorReady, isAnalyzing, ownReady])

  const invalidateResult = () => {
    setResult(null)
    setError('')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    setError('')
    setResult(null)
    setIsAnalyzing(true)
    try {
      const formData = new FormData()
      formData.append('competitorMode', competitorMode)
      formData.append('competitorMarketplace', competitorMarketplace)
      formData.append('competitorAsin', competitorAsin.trim())
      formData.append('ownMode', hasOwnProduct ? ownMode : 'none')
      formData.append('ownMarketplace', ownMarketplace)
      formData.append('ownAsin', ownAsin.trim())
      competitorImages.forEach((image) => formData.append('competitorImages', image))
      if (hasOwnProduct) ownImages.forEach((image) => formData.append('ownImages', image))
      const response = await fetch('/api/competitor-strategy/analyze', { method: 'POST', body: formData })
      const payload = await response.json() as { result?: CompetitorStrategyResult; error?: string }
      if (!response.ok || !payload.result) throw new Error(payload.error || '竞品图片策略分析失败，请稍后重试。')
      setResult(payload.result)
      window.setTimeout(() => document.getElementById('strategy-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '竞品图片策略分析失败，请稍后重试。')
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_48%,#ffffff_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div className="max-w-4xl">
            <h1 className="text-4xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-5xl">看懂竞品图片，<br className="hidden sm:block" /><span className="text-amazon-blue">再做出自己的优势。</span></h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">同时分析销售任务与审美表达。好的版式、配色、构图和文案可以参考，但最终方案要匹配我方商品并形成明确差异。</p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            {[['逐图', '销售任务'], ['视觉', '审美参考'], ['落地', '差异策略']].map(([top, bottom]) => <div key={top} className="rounded-xl bg-slate-50 px-2 py-3 text-center"><div className="text-sm font-semibold text-slate-900">{top}</div><div className="mt-1 text-xs text-slate-500">{bottom}</div></div>)}
          </div>
        </header>

        <div className="mt-10 grid gap-6 xl:grid-cols-[460px_minmax(0,1fr)] xl:items-start">
          <form onSubmit={handleSubmit} className="space-y-4 xl:sticky xl:top-6">
            <ProductImageSourceCard kind="competitor" mode={competitorMode} marketplace={competitorMarketplace} asin={competitorAsin} images={competitorImages} onModeChange={(value) => { setCompetitorMode(value); invalidateResult() }} onMarketplaceChange={(value) => { setCompetitorMarketplace(value); invalidateResult() }} onAsinChange={(value) => { setCompetitorAsin(value); invalidateResult() }} onImagesChange={(value) => { setCompetitorImages(value); invalidateResult() }} />

            {hasOwnProduct ? <ProductImageSourceCard kind="own" mode={ownMode} marketplace={ownMarketplace} asin={ownAsin} images={ownImages} onModeChange={(value) => { setOwnMode(value); invalidateResult() }} onMarketplaceChange={(value) => { setOwnMarketplace(value); invalidateResult() }} onAsinChange={(value) => { setOwnAsin(value); invalidateResult() }} onImagesChange={(value) => { setOwnImages(value); invalidateResult() }} onRemove={() => { setHasOwnProduct(false); invalidateResult() }} /> : <button type="button" onClick={() => { setHasOwnProduct(true); invalidateResult() }} className="group flex w-full cursor-pointer items-center justify-between rounded-3xl border border-dashed border-blue-300 bg-blue-50/60 p-5 text-left transition-colors duration-200 hover:border-amazon-blue hover:bg-blue-50 sm:p-6"><span><span className="block text-sm font-semibold text-slate-900">添加我方商品 <span className="font-normal text-slate-400">（可选）</span></span><span className="mt-1 block text-xs leading-5 text-slate-500">通过站点 + ASIN 或上传图片，与竞品直接对比。</span></span><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xl text-amazon-blue shadow-sm transition-colors group-hover:bg-amazon-blue group-hover:text-white">＋</span></button>}

            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-900">分析包含销售任务、审美评分和视觉参考建议。优秀的版式、配色与文案可以借鉴，系统会同时给出差异化改造方向。</div>
            {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">{error}</div>}
            <button type="submit" disabled={!canSubmit} className="inline-flex w-full cursor-pointer items-center justify-center rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">{isAnalyzing ? '正在分析图片策略与审美...' : '开始竞品图片策略分析'}</button>
          </form>

          <section id="strategy-result" aria-live="polite" className="scroll-mt-6">
            {!result && !isAnalyzing && <div className="panel flex min-h-[620px] flex-col justify-center px-6 py-12 sm:px-10"><div className="mx-auto max-w-xl text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-100 text-cyan-700"><svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m0 14h16M7 15l3-3 3 2 5-6" /></svg></div><h2 className="mt-5 text-xl font-semibold text-slate-900">结果会同时回答策略与审美</h2><p className="mt-2 text-sm leading-6 text-slate-500">看懂它在卖什么，也看清哪些版式、配色、构图和文案值得参考，以及参考后如何做出差异。</p></div><div className="mx-auto mt-8 grid w-full max-w-xl gap-3 sm:grid-cols-3">{['逐图任务', '审美参考', '差异方案'].map((item, index) => <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-center"><span className="text-xs font-semibold text-slate-400">0{index + 1}</span><p className="mt-1 text-sm font-semibold text-slate-700">{item}</p></div>)}</div></div>}
            {isAnalyzing && <div className="panel flex min-h-[620px] flex-col items-center justify-center px-6 py-12 text-center"><div className="relative h-14 w-14"><div className="absolute inset-0 rounded-full border-4 border-slate-200" /><div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-amazon-blue" /></div><h2 className="mt-6 text-xl font-semibold text-slate-900">正在分析销售策略与视觉表达</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">正在逐张识别销售任务，并评价版式、配色、构图、文案和整套一致性。</p><div className="mt-6 flex items-center gap-2 text-xs text-slate-400"><span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />请保持页面打开</div></div>}
            {result && !isAnalyzing && <CompetitorStrategyResults result={result} uploadedImageUrls={uploadedImageUrls} onReset={() => { setResult(null); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />}
          </section>
        </div>
      </div>
    </main>
  )
}
