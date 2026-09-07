import type { BackgroundRemovalPipeline, RawImage } from '@huggingface/transformers'

let removerPromise: Promise<BackgroundRemovalPipeline> | null = null

export async function loadBackgroundRemover(onProgress?: (progress: number) => void) {
  if (!removerPromise) {
    removerPromise = import('@huggingface/transformers').then(({ pipeline }) => pipeline('background-removal', 'Xenova/modnet', {
      dtype: 'fp32',
      progress_callback: (event) => {
        if (typeof event === 'object' && event !== null && 'progress' in event && typeof event.progress === 'number') {
          onProgress?.(event.progress)
        }
      },
    }))
  }

  return removerPromise
}

export async function removeBackground(file: File, onProgress?: (progress: number) => void) {
  const remover = await loadBackgroundRemover(onProgress)
  const image: RawImage = await import('@huggingface/transformers').then(({ RawImage }) => RawImage.fromBlob(file))
  const result = await remover(image)
  const blob = await result.toBlob('image/png') as Blob
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
  return new File([blob], `${baseName}-no-background.png`, { type: 'image/png' })
}
