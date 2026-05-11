'use client'

import { useState } from 'react'

export interface GeneratedImage {
  id: string
  imageUrl: string
  prompt: string
  style: string
}

interface ImageGridProps {
  images: GeneratedImage[]
  onRegenerate: (index: number, style: string) => void
  isGenerating: boolean
}

export default function ImageGrid({ images, onRegenerate, isGenerating }: ImageGridProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopyPrompt = async (image: GeneratedImage) => {
    try {
      await navigator.clipboard.writeText(image.prompt)
      setCopiedId(image.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleDownload = async (image: GeneratedImage) => {
    try {
      const response = await fetch(image.imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `amazon-product-${image.id}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download:', err)
    }
  }

  if (images.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-12 text-center">
        <div className="text-gray-400 mb-4">
          <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-gray-500 text-lg">No images generated yet</p>
        <p className="text-gray-400 text-sm mt-2">Enter your product information to generate images</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">Generated Images</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {images.map((image, index) => (
          <div key={image.id} className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="relative aspect-square">
              <img
                src={image.imageUrl}
                alt={`Generated product image ${index + 1}`}
                className="w-full h-full object-cover"
              />
              {isGenerating && (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                  <svg className="animate-spin h-8 w-8 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-500 mb-2">Style: {image.style}</p>
              <p className="text-sm text-gray-600 line-clamp-2 mb-4">{image.prompt}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopyPrompt(image)}
                  className="flex-1 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                >
                  {copiedId === image.id ? 'Copied!' : 'Copy Prompt'}
                </button>
                <button
                  onClick={() => handleDownload(image)}
                  className="flex-1 px-3 py-2 text-sm bg-amazon-blue hover:bg-blue-600 text-white rounded-md transition-colors"
                >
                  Download
                </button>
              </div>
              <button
                onClick={() => onRegenerate(index, image.style)}
                disabled={isGenerating}
                className="w-full mt-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors disabled:opacity-50"
              >
                Regenerate
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
