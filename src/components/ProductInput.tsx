'use client'

import { useState } from 'react'
import ReferenceImageUploader from '@/components/ReferenceImageUploader'

export interface ProductInputInitialSource {
  productName: string
  description?: string
  sourceLabel: string
  selectionToken: string
  referenceImages: Array<{
    sourceIndex: number
    url: string
  }>
}

interface ProductInputProps {
  onAnalyze: (data: {
    productName: string
    description: string
    additionalRequirements: string
    referenceImages: File[]
    source1688Token?: string
    source1688ImageIndexes?: number[]
  }) => void
  isLoading: boolean
  analysisCostText?: string
  initialSource?: ProductInputInitialSource | null
}

export default function ProductInput({ onAnalyze, isLoading, analysisCostText, initialSource }: ProductInputProps) {
  const [productName, setProductName] = useState(initialSource?.productName || '')
  const [description, setDescription] = useState(initialSource?.description || '')
  const [additionalRequirements, setAdditionalRequirements] = useState('')
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [sourceReferenceImages, setSourceReferenceImages] = useState(initialSource?.referenceImages || [])
  const totalReferenceImageCount = sourceReferenceImages.length + referenceImages.length
  const remainingUploadCount = Math.max(0, 5 - sourceReferenceImages.length)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!productName.trim() || !description.trim() || totalReferenceImageCount === 0) return

    onAnalyze({
      productName: productName.trim(),
      description: description.trim(),
      additionalRequirements: additionalRequirements.trim(),
      referenceImages,
      source1688Token: sourceReferenceImages.length ? initialSource?.selectionToken : undefined,
      source1688ImageIndexes: sourceReferenceImages.length ? sourceReferenceImages.map((image) => image.sourceIndex) : undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="panel space-y-6 p-6 sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex rounded-full bg-amazon-orange/10 px-3 py-1 text-xs font-semibold text-amazon-orange">
            亚马逊图片工作流
          </span>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            商品信息填写
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            告诉系统这是什么商品，上传参考图，系统会自动规划整套 Amazon 商品图片。
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5 lg:col-span-2">
          <div>
            <label htmlFor="productName" className="mb-2 block text-sm font-medium text-slate-800">
              商品名称 *
            </label>
            <input
              id="productName"
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="例如：无线蓝牙耳机"
              className="input-field"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="mb-2 block text-sm font-medium text-slate-800">
              商品信息 *
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请简单描述商品功能、材质、核心卖点、适用场景或尺寸信息..."
              rows={5}
              className="input-field min-h-[132px] resize-none"
              required
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="additionalRequirements" className="mb-2 block text-sm font-medium text-slate-800">
            补充要求 <span className="text-slate-400">（选填）</span>
          </label>
          <textarea
            id="additionalRequirements"
            value={additionalRequirements}
            onChange={(e) => setAdditionalRequirements(e.target.value)}
            placeholder="例如：整体偏高级简洁、突出防水、尽量不要人物、增加北美家庭场景..."
            rows={3}
            className="input-field min-h-[88px] resize-none"
            maxLength={2000}
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">
            可以描述想强调的风格、场景或卖点，不能替代商品真实信息。
          </p>
        </div>
      </div>

      {sourceReferenceImages.length > 0 && (
        <div className="space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium text-slate-800">已带入的商品参考图</h3>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{initialSource?.sourceLabel}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">这些图片会用于商品分析和后续图片生成；不需要的可以移除。</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {sourceReferenceImages.map((image, index) => (
              <div key={`${image.sourceIndex}-${image.url}`} className="relative overflow-hidden rounded-2xl border border-violet-200 bg-violet-50/40">
                <img src={image.url} alt={`已带入的商品参考图 ${index + 1}`} referrerPolicy="no-referrer" className="aspect-[4/3] w-full bg-white object-contain p-1" />
                <button type="button" onClick={() => setSourceReferenceImages((current) => current.filter((item) => item.sourceIndex !== image.sourceIndex))} aria-label={`移除第 ${index + 1} 张商品参考图`} className="absolute right-2 top-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/65 text-sm text-white transition-colors hover:bg-black/80">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {remainingUploadCount > 0 && (
        <ReferenceImageUploader
          label={sourceReferenceImages.length ? '继续添加本地参考图（可选）' : '商品参考图'}
          helperText={`当前共 ${totalReferenceImageCount} 张，最多五张。建议包含主视图、不同角度、细节和使用场景图片。`}
          maxImages={remainingUploadCount}
          value={referenceImages}
          onChange={setReferenceImages}
        />
      )}

      <button
        type="submit"
        disabled={isLoading || !productName.trim() || !description.trim() || totalReferenceImageCount === 0}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amazon-orange px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isLoading ? (
          <>
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            分析中...
          </>
        ) : (
          analysisCostText ? `开始分析商品（${analysisCostText} 积分）` : '开始分析商品'
        )}
      </button>
    </form>
  )
}
