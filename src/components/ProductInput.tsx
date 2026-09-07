'use client'

import { useState } from 'react'
import ReferenceImageUploader from '@/components/ReferenceImageUploader'

interface ProductInputProps {
  onAnalyze: (data: {
    productName: string
    description: string
    additionalRequirements: string
    referenceImages: File[]
  }) => void
  isLoading: boolean
  analysisCostText?: string
}

export default function ProductInput({ onAnalyze, isLoading, analysisCostText }: ProductInputProps) {
  const [productName, setProductName] = useState('')
  const [description, setDescription] = useState('')
  const [additionalRequirements, setAdditionalRequirements] = useState('')
  const [referenceImages, setReferenceImages] = useState<File[]>([])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!productName.trim() || !description.trim() || referenceImages.length === 0) return

    onAnalyze({
      productName: productName.trim(),
      description: description.trim(),
      additionalRequirements: additionalRequirements.trim(),
      referenceImages,
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

      <ReferenceImageUploader
        label="商品参考图"
        helperText="至少上传一张，最多五张。建议包含主视图、不同角度、细节和使用场景图片。"
        maxImages={5}
        value={referenceImages}
        onChange={setReferenceImages}
      />

      <button
        type="submit"
        disabled={isLoading || !productName.trim() || !description.trim() || referenceImages.length === 0}
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
