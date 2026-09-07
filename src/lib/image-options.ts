export type ImageModel = 'gpt-image-2' | 'agnes-image-2.1-flash'

export const IMAGE_MODEL_OPTIONS: Array<{
  value: ImageModel
  label: string
  description: string
}> = [
  { value: 'gpt-image-2', label: 'GPT Image 2', description: '默认模型，高质量' },
  { value: 'agnes-image-2.1-flash', label: 'Agnes Image 2.1 Flash', description: '免费生成' },
]

export const DEFAULT_IMAGE_MODEL: ImageModel = 'gpt-image-2'
export const PLAYGROUND_REFERENCE_IMAGE_LIMIT = 5

export type RenderSize =
  | '1024x1024'
  | '2048x2048'
  | '1536x1024'
  | '2048x1365'
  | '1024x1536'
  | '1365x2048'
  | '1536x960'

export const HIDDEN_APLUS_RENDER_SIZE = '1536x960' as const
const HIDDEN_APLUS_PROMPT_REQUIREMENT = '补充执行要求：输出为 1536x960 的横版画面，保持 8:5 构图。'

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
    value: '2048x1365',
    label: '2048 × 1365',
    note: 'Higher-resolution landscape output for wider scene testing',
  },
  {
    value: '1024x1536',
    label: '1024 × 1536',
    note: 'Portrait output, useful for tall compositions',
  },
  {
    value: '1365x2048',
    label: '1365 × 2048',
    note: 'Higher-resolution portrait output for tall compositions',
  },
]

export function isRenderSize(value: string | null): value is RenderSize {
  return SIZE_OPTIONS.some((option) => option.value === value)
}

export function appendHiddenAPlusSizeRequirement(prompt: string): string {
  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) return HIDDEN_APLUS_PROMPT_REQUIREMENT
  if (trimmedPrompt.includes(HIDDEN_APLUS_PROMPT_REQUIREMENT)) return trimmedPrompt
  return `${trimmedPrompt}\n\n${HIDDEN_APLUS_PROMPT_REQUIREMENT}`
}

export function stripHiddenAPlusSizeRequirement(prompt: string): string {
  return prompt.replace(`\n\n${HIDDEN_APLUS_PROMPT_REQUIREMENT}`, '').replace(HIDDEN_APLUS_PROMPT_REQUIREMENT, '').trim()
}
