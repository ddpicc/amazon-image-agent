'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

interface ReferenceImageUploaderProps {
  label: string
  helperText?: string
  maxImages?: number
  emptySummaryText?: string
  filledSummaryText?: string
  value: File[]
  onChange: (files: File[]) => void
}

export default function ReferenceImageUploader({
  label,
  helperText,
  maxImages = 3,
  emptySummaryText,
  filledSummaryText,
  value,
  onChange,
}: ReferenceImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  useEffect(() => {
    const nextPreviewUrls = value.map((file) => URL.createObjectURL(file))
    setPreviewUrls(nextPreviewUrls)

    return () => {
      nextPreviewUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [value])

  const remainingCount = Math.max(0, maxImages - value.length)

  const summaryText = useMemo(() => {
    if (!value.length) {
      return emptySummaryText || `最多上传 ${maxImages} 张参考图，支持 PNG、JPG、WEBP。`
    }

    return filledSummaryText || `已上传 ${value.length} / ${maxImages} 张，建议补充不同角度或细节图，方便后续更稳定地控图。`
  }, [emptySummaryText, filledSummaryText, maxImages, value.length])

  const updateFiles = (files: File[]) => {
    const validFiles = files.filter((file) => file.type.startsWith('image/')).slice(0, maxImages)
    onChange(validFiles)
  }

  const mergeFiles = (incomingFiles: File[]) => {
    const validIncoming = incomingFiles.filter((file) => file.type.startsWith('image/'))
    const merged = [...value, ...validIncoming].slice(0, maxImages)
    onChange(merged)
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    if (value.length === 0) {
      updateFiles(files)
    } else {
      mergeFiles(files)
    }

    event.target.value = ''
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files || [])
    if (!files.length) return

    if (value.length === 0) {
      updateFiles(files)
    } else {
      mergeFiles(files)
    }
  }

  const handleRemoveImage = (index: number) => {
    const nextFiles = value.filter((_, currentIndex) => currentIndex !== index)
    onChange(nextFiles)
    if (fileInputRef.current && nextFiles.length === 0) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-800">{label}</label>
        {helperText && <p className="mt-1 text-sm text-slate-500">{helperText}</p>}
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="group rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 transition hover:border-amazon-orange hover:bg-orange-50/60 cursor-pointer"
      >
        {previewUrls.length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {previewUrls.map((previewUrl, index) => (
                <div key={previewUrl} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <img
                    src={previewUrl}
                    alt={`Reference ${index + 1}`}
                    className="h-32 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleRemoveImage(index)
                    }}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-sm text-white transition hover:bg-black/80"
                  >
                    ×
                  </button>
                </div>
              ))}
              {remainingCount > 0 && (
                <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-center text-sm text-slate-500">
                  <div>
                    <div className="font-medium text-slate-700">继续添加参考图</div>
                    <div className="mt-1 text-xs">还可上传 {remainingCount} 张</div>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500">{summaryText}</p>
          </div>
        ) : (
          <div className="py-8 text-center text-slate-500">
            <svg className="mx-auto mb-3 h-12 w-12 text-slate-300 group-hover:text-amazon-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm font-medium text-slate-700">拖拽图片到这里，或点击上传</p>
            <p className="mt-1 text-xs text-slate-400">{summaryText}</p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleInputChange}
          className="hidden"
        />
      </div>
    </div>
  )
}
