'use client'

import ReferenceImageUploader from '@/components/ReferenceImageUploader'
import type { AmazonMarketplace, ProductImageSourceMode } from '@/lib/competitor-strategy-types'
import { MARKETPLACE_LABELS } from '@/lib/competitor-strategy-types'

const MARKETPLACES = (Object.entries(MARKETPLACE_LABELS) as Array<[AmazonMarketplace, string]>).map(([value, label]) => ({ value, label }))

interface ProductImageSourceCardProps {
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

export default function ProductImageSourceCard({ kind, mode, marketplace, asin, images, onModeChange, onMarketplaceChange, onAsinChange, onImagesChange, onRemove }: ProductImageSourceCardProps) {
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
      </div> : <div className="mt-5"><ReferenceImageUploader label={`${title}图片`} helperText="按商品页顺序上传 1–9 张 JPG、PNG 或 WEBP，第一张视为图 1。" accept="image/jpeg,image/png,image/webp" maxImages={9} previewColumns={4} emptySummaryText="顺序很重要：主图在前，其余图片按商品页顺序添加。" filledSummaryText={`已准备 ${images.length} 张图片，分析时会保留当前顺序。`} value={images} onChange={onImagesChange} /></div>}
    </section>
  )
}
