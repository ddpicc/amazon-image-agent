export type ImageModel = string

export interface ImageModelOption {
  value: ImageModel
  label: string
  description: string
  standardCost: number
  aplusCost: number
  isDefault: boolean
}

export function getImageModelCost(option: ImageModelOption | null | undefined, scene: 'standard' | 'aplus') {
  if (!option) return 0
  return scene === 'aplus' ? option.aplusCost : option.standardCost
}
export const PLAYGROUND_REFERENCE_IMAGE_LIMIT = 5
export const AMAZON_DEFAULT_RENDER_SIZE = '1600x1600' as const

export type RenderSize =
  | '1024x1024'
  | '1600x1600'
  | '2048x2048'
  | '1536x1024'
  | '2048x1360'
  | '1024x1536'
  | '1360x2048'
  | '1536x960'

export interface SizeOption {
  value: RenderSize
  label: string
  note: string
}

export const SIZE_OPTIONS: SizeOption[] = [
  {
    value: '1024x1024',
    label: '1024 × 1024',
    note: 'Square output, good for listing and generic tests',
  },
  {
    value: '1600x1600',
    label: '1600 × 1600',
    note: 'Amazon listing square output',
  },
  {
    value: '2048x2048',
    label: '2048 × 2048',
    note: 'High-resolution square output for sharper export tests',
  },
  {
    value: '1536x1024',
    label: '1536 × 1024',
    note: 'Landscape output, suitable for wider scenes and A+ style layouts',
  },
  {
    value: '2048x1360',
    label: '2048 × 1360',
    note: 'Higher-resolution landscape output for wider scene testing',
  },
  {
    value: '1024x1536',
    label: '1024 × 1536',
    note: 'Portrait output, useful for tall compositions',
  },
  {
    value: '1360x2048',
    label: '1360 × 2048',
    note: 'Higher-resolution portrait output for tall compositions',
  },
]

export function isRenderSize(value: string | null): value is RenderSize {
  return SIZE_OPTIONS.some((option) => option.value === value)
}
