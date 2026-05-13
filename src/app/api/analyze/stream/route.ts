import { NextRequest } from 'next/server'
import {
  analyzeProduct,
  buildAnalysisSummaryForPromptGeneration,
  generatePromptsWithProgress,
  RecommendedImagePlanItem,
} from '@/lib/anthropic'

export const dynamic = 'force-dynamic'

type StreamEvent =
  | { type: 'stage'; stage: 'preparing' | 'analyzing' | 'prompting' | 'completed'; label: string; progress: number }
  | { type: 'partial-analysis'; data: Awaited<ReturnType<typeof analyzeProduct>> }
  | { type: 'prompt-progress'; completed: number; total: number; current: string }
  | { type: 'prompt-item'; key: string; plan: RecommendedImagePlanItem; prompt: string }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'done' }

function formatEvent(event: StreamEvent) {
  return `${JSON.stringify(event)}\n`
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const push = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(formatEvent(event)))
      }

      try {
        push({
          type: 'stage',
          stage: 'preparing',
          label: '正在读取商品信息与参考图',
          progress: 10,
        })

        const formData = await request.formData()

        const productName = formData.get('productName') as string
        const description = formData.get('description') as string
        const category = formData.get('category') as string
        const targetAudience = formData.get('targetAudience') as string
        const referenceImages = [
          ...formData.getAll('referenceImages'),
          ...(!formData.get('referenceImage') ? [] : [formData.get('referenceImage')]),
        ].filter((item): item is File => item instanceof File)

        if (!productName || !description) {
          push({
            type: 'error',
            message: 'Product name and description are required',
            recoverable: false,
          })
          controller.close()
          return
        }

        const imagePayloads = await Promise.all(
          referenceImages.slice(0, 3).map(async (image) => {
            const arrayBuffer = await image.arrayBuffer()
            return {
              data: Buffer.from(arrayBuffer).toString('base64'),
              mediaType: image.type || 'image/jpeg',
            }
          }),
        )

        push({
          type: 'stage',
          stage: 'analyzing',
          label: '正在分析商品卖点、参考图和 Amazon 规范',
          progress: 45,
        })

        const basicResult = await analyzeProduct({
          productName,
          description,
          category: category || 'General',
          targetAudience: targetAudience || 'General consumers',
          referenceImages: imagePayloads,
        })

        push({
          type: 'partial-analysis',
          data: basicResult,
        })

        push({
          type: 'stage',
          stage: 'prompting',
          label: '正在生成完整 Prompt 套餐（0/7）',
          progress: 45,
        })

        await generatePromptsWithProgress(
          productName,
          description,
          category || 'General',
          targetAudience || 'General consumers',
          imagePayloads,
          buildAnalysisSummaryForPromptGeneration(basicResult),
          async ({ key, plan, prompt, completed, total, usedFallback }) => {
            if (usedFallback) {
              push({
                type: 'warning',
                message: `${plan.title} 生成失败，已回退到默认 Prompt。`,
              })
            }

            push({
              type: 'prompt-item',
              key,
              plan,
              prompt,
            })

            push({
              type: 'prompt-progress',
              completed,
              total,
              current: plan.title,
            })

            push({
              type: 'stage',
              stage: 'prompting',
              label: `正在生成 Prompt（${completed}/${total}）：${plan.title}`,
              progress: 45 + Math.round((completed / total) * 45),
            })
          },
        )

        push({
          type: 'stage',
          stage: 'completed',
          label: '分析完成，可以进入图片生成',
          progress: 100,
        })
        push({ type: 'done' })
        controller.close()
      } catch (error) {
        console.error('Analyze stream error:', error)
        push({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to analyze product',
          recoverable: false,
        })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
