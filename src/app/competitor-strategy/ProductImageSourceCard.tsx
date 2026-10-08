'use client'

import { useRef, useState } from 'react'
import ReferenceImageUploader from '@/components/ReferenceImageUploader'
import type { AmazonMarketplace, ProductImageSourceMode } from '@/lib/competitor-strategy-types'
import { MARKETPLACE_LABELS } from '@/lib/competitor-strategy-types'

const MARKETPLACES = (Object.entries(MARKETPLACE_LABELS) as Array<[AmazonMarketplace, string]>).map(([value, label]) => ({ value, label }))

export interface StrategyProductPreview {
  asin: string
  marketplace: AmazonMarketplace
  title: string
  images: string[]
  selectionToken: string
  indexes: number[]
  confirmed: boolean
}
interface ProductImageSourceCardProps {
  preview: StrategyProductPreview | null
  onPreviewChange: (preview: StrategyProductPreview | null) => void
  kind: 'competitor' | 'own'
  mode: ProductImageSourceMode
  marketplace: AmazonMarketplace
  asin: string
  images: File[]
  onModeChange: (mode: ProductImageSourceMode) => void
  onMarketplaceChange: (marketplace: AmazonMarketplace) => void
  onAsinChange: (asin: string) => void
  onImagesChange: (images: File[]) => void
  onRemove?: () => void
}

export default function ProductImageSourceCard({ kind, mode, marketplace, asin, images, onModeChange, onMarketplaceChange, onAsinChange, onImagesChange, onRemove, preview, onPreviewChange }: ProductImageSourceCardProps) {
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState('')
  const requestVersion = useRef(0)
  const currentSource = useRef('')
  currentSource.current = `${marketplace}:${asin}`
  const fetchPreview = async () => {
    const version = ++requestVersion.current
    const source = currentSource.current
    setFetching(true); setError('')
    try {
      const response = await fetch('/api/competitor-strategy/product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asin, marketplace }) })
      const data = await response.json()
      if (version !== requestVersion.current || source !== currentSource.current) return
      if (!response.ok || !data.product) throw new Error(data.error || '获取图片失败')
      onPreviewChange({ ...data.product, indexes: data.product.images.map((_: string, i: number) => i), confirmed: false })
    } catch (failure) { if (version === requestVersion.current && source === currentSource.current) setError(failure instanceof Error ? failure.message : '获取失败') }
    finally { if (version === requestVersion.current) setFetching(false) }
  }
  const move = (position: number, direction: number) => {
    if (!preview) return
    const indexes = [...preview.indexes]
    ;[indexes[position], indexes[position + direction]] = [indexes[position + direction], indexes[position]]
    onPreviewChange({ ...preview, indexes, confirmed: false })
  }
  const isCompetitor = kind === 'competitor'
  const title = isCompetitor ? '竞品' : '我方商品'
  const tone = isCompetitor ? 'bg-slate-950 text-white' : 'bg-amazon-blue text-white'

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d={isCompetitor ? 'M3 3v18h18M7 16l3-4 3 2 5-7' : 'M15 19.128a9.38 9.38 0 0 0 2.625.372A9.337 9.337 0 0 0 21 18.872M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M8.625 18.75a5.25 5.25 0 1 0 0-10.5 5.25 5.25 0 0 0 0 10.5Z'} /></svg>
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold text-slate-950">{title}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isCompetitor ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}`}>{isCompetitor ? '必填' : '用于差距对比'}</span></div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{isCompetitor ? '选择一种方式提供完整竞品图序。' : '选择一种方式提供我方当前图片。'}</p>
          </div>
        </div>
        {onRemove && <button type="button" onClick={onRemove} className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">移除</button>}
      </div>

      <div className="relative mt-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1" role="tablist" aria-label={`${title}图片来源，二选一`}>
        <button type="button" role="tab" aria-selected={mode === 'asin'} onClick={() => onModeChange('asin')} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 pr-6 text-sm font-semibold transition-colors duration-200 ${mode === 'asin' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75 19.5 19.5m-1.5-8.25A6.75 6.75 0 1 1 4.5 11.25a6.75 6.75 0 0 1 13.5 0ZM9 11.25h4.5" /></svg>
          <span>站点 + ASIN</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === 'upload'} onClick={() => onModeChange('upload')} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 pl-6 text-sm font-semibold transition-colors duration-200 ${mode === 'upload' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 8.25 12 3.75m0 0 4.5 4.5M12 3.75V15" /></svg>
          <span>上传图片</span>
        </button>
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-slate-500 shadow-sm" aria-hidden="true">或</span>
      </div>

      {mode === 'asin' ? <div className="mt-5 space-y-4">
        <label className="block"><span className="text-xs font-semibold text-slate-700">Amazon 站点</span><select value={marketplace} onChange={(event) => onMarketplaceChange(event.target.value as AmazonMarketplace)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition focus:border-amazon-blue focus:ring-4 focus:ring-blue-100">{MARKETPLACES.map((item) => <option key={item.value} value={item.value}>{item.label}站 · {item.value}</option>)}</select></label>
        <label className="block"><span className="text-xs font-semibold text-slate-700">{title} ASIN</span><input value={asin} onChange={(event) => onAsinChange(event.target.value)} placeholder="10 位 ASIN，或粘贴 Amazon 商品链接" autoCapitalize="characters" spellCheck={false} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm uppercase text-slate-900 outline-none transition placeholder:normal-case placeholder:text-slate-400 focus:border-amazon-blue focus:ring-4 focus:ring-blue-100" /></label>
        <button type="button" disabled={fetching || !asin.trim()} onClick={fetchPreview} className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{fetching ? '正在获取商品图片…' : preview ? '重新获取图片' : '获取图片并确认图序'}</button>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        {preview && <div className="space-y-3"><p className="text-sm font-semibold">{preview.title}</p><p className="text-xs text-slate-500">按下方顺序分析，可调整或移除图片。原图编号保持不变。</p><div className="grid grid-cols-2 gap-2">{preview.indexes.map((originalIndex, position) => <div key={originalIndex} className="rounded-xl border border-slate-200 p-2"><img src={preview.images[originalIndex]} alt={`原图 ${originalIndex + 1}`} className="aspect-square w-full object-contain" /><p className="my-2 text-xs">第 {position + 1} 位 · 原图 {originalIndex + 1}</p><div className="flex justify-between text-xs"><button type="button" aria-label={`原图 ${originalIndex + 1} 前移`} disabled={position === 0} onClick={() => move(position, -1)} className="disabled:opacity-30">前移</button><button type="button" aria-label={`原图 ${originalIndex + 1} 后移`} disabled={position === preview.indexes.length - 1} onClick={() => move(position, 1)} className="disabled:opacity-30">后移</button><button type="button" onClick={() => onPreviewChange({ ...preview, indexes: preview.indexes.filter((i) => i !== originalIndex), confirmed: false })}>移除</button></div></div>)}</div>{preview.images.map((_, i) => !preview.indexes.includes(i) && <button type="button" key={i} onClick={() => onPreviewChange({ ...preview, indexes: [...preview.indexes, i], confirmed: false })} className="mr-2 rounded-lg border px-2 py-1 text-xs">加回原图 {i + 1}</button>)}<label className="flex gap-2 text-sm"><input type="checkbox" checked={preview.confirmed} disabled={!preview.indexes.length} onChange={(event) => onPreviewChange({ ...preview, confirmed: event.target.checked })} />已确认选图和分析顺序</label></div>}
      </div> : <div className="mt-5"><ReferenceImageUploader label={`${title}图片`} helperText="按商品页顺序上传 1–9 张 JPG、PNG 或 WEBP，第一张视为图 1。" accept="image/jpeg,image/png,image/webp" maxImages={9} previewColumns={4} emptySummaryText="顺序很重要：主图在前，其余图片按商品页顺序添加。" filledSummaryText={`已准备 ${images.length} 张图片，分析时会保留当前顺序。`} value={images} onChange={onImagesChange} /><div className="mt-3 space-y-2">{images.map((file, i) => <div key={`${file.name}-${i}`} className="flex items-center gap-3 text-xs"><span className="min-w-0 flex-1 truncate">{i + 1}. {file.name}</span>{[-1, 1].map((direction) => <button type="button" key={direction} disabled={i + direction < 0 || i + direction >= images.length} onClick={() => { const next = [...images]; [next[i], next[i + direction]] = [next[i + direction], next[i]]; onImagesChange(next) }} className="disabled:opacity-30">{direction === -1 ? '前移' : '后移'}</button>)}</div>)}</div></div>}
    </section>
  )
}
