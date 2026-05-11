'use client'

import { useState } from 'react'
import ReferenceImageUploader from '@/components/ReferenceImageUploader'

interface ProductInputProps {
  onAnalyze: (data: {
    productName: string
    description: string
    category: string
    targetAudience: string
    referenceImages: File[]
  }) => void
  isLoading: boolean
}

const categories = [
  '消费电子',
  '家居厨房',
  '服饰鞋包',
  '美妆个护',
  '运动户外',
  '玩具游戏',
  '图书影音',
  '健康护理',
  '汽车用品',
  '通用',
]

const audiences = [
  '18-25 岁年轻人',
  '25-45 岁职场人群',
  '有孩子的家庭',
  '65+ 长者人群',
  '科技爱好者',
  '价格敏感型用户',
  '高端消费人群',
  '大众消费者',
]

export default function ProductInput({ onAnalyze, isLoading }: ProductInputProps) {
  const [productName, setProductName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('通用')
  const [targetAudience, setTargetAudience] = useState('大众消费者')
  const [referenceImages, setReferenceImages] = useState<File[]>([])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!productName.trim() || !description.trim()) return

    onAnalyze({
      productName: productName.trim(),
      description: description.trim(),
      category,
      targetAudience,
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
            告诉系统这是什么商品、面向谁，并上传参考图，方便后续分析和图片生成更贴近你的商品语境。
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
              商品描述与关键词 *
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请描述商品功能、材质、核心卖点、适用场景，也可以补充想强调的关键词..."
              rows={5}
              className="input-field min-h-[132px] resize-none"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="category" className="mb-2 block text-sm font-medium text-slate-800">
            商品类目 <span className="text-slate-400">（选填，建议填写）</span>
          </label>
          <p className="mb-2 text-xs leading-5 text-slate-500">
            主要帮助系统判断商品属于哪一类，从而更准确地规划卖点图、场景图和风格方向。
          </p>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-field bg-white"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audience" className="mb-2 block text-sm font-medium text-slate-800">
            目标人群 <span className="text-slate-400">（选填，建议填写）</span>
          </label>
          <p className="mb-2 text-xs leading-5 text-slate-500">
            主要帮助系统判断图片语境、生活方式场景和视觉表达，更适合礼品感、高端感或特定人群定位的商品。
          </p>
          <select
            id="audience"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            className="input-field bg-white"
          >
            {audiences.map((aud) => (
              <option key={aud} value={aud}>{aud}</option>
            ))}
          </select>
        </div>
      </div>

      <ReferenceImageUploader
        label="商品参考图"
        helperText="最多上传三张。通常建议包含正面图、斜侧角度图和细节图，这样更容易得到稳定的亚马逊图片结果。"
        value={referenceImages}
        onChange={setReferenceImages}
      />

      <button
        type="submit"
        disabled={isLoading || !productName.trim() || !description.trim()}
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
          '开始分析商品'
        )}
      </button>
    </form>
  )
}
