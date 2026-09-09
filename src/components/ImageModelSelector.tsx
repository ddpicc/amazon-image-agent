'use client'

import { formatPoints } from '@/lib/points-config'
import { getImageModelCost, type ImageModelOption } from '@/lib/image-options'

export default function ImageModelSelector({
  models,
  value,
  onChange,
  scene,
  disabled = false,
}: {
  models: ImageModelOption[]
  value: string
  onChange: (model: string) => void
  scene: 'standard' | 'aplus'
  disabled?: boolean
}) {
  if (models.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        暂无可用生图模型，请联系管理员。
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {models.map((option) => {
        const selected = value === option.value
        const cost = getImageModelCost(option, scene)
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            aria-pressed={selected}
            className={`min-h-[88px] rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              selected
                ? 'border-amazon-orange bg-orange-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{option.label}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{option.description}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${selected ? 'bg-amazon-orange text-white' : 'bg-slate-100 text-slate-600'}`}>
                {formatPoints(cost)} 积分/张
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
