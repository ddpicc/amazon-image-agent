import OpenAI from 'openai'
import { requestTextJsonCompletion } from '@/lib/text-model'

export interface ReversePromptInput {
  image: {
    data: string
    mediaType: string
  }
  operationId?: string
}

export interface ReversePromptOutput {
  prompt: string
  summary: string
}

function buildFallbackPrompt() {
  return '一张写实商务人物棚拍肖像，主体居中，背景干净简洁，人物形象专业自然。整体光线柔和均匀，画面清晰利落，具有职业形象照与商务宣传感。'
}

export async function analyzeImageToPrompt(input: ReversePromptInput): Promise<ReversePromptOutput> {
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: `你是一名擅长把参考图拆解成“可继续生图”的中文提示词的视觉提示词专家。

请仔细分析这张图片，并输出一段适合再次生图的中文提示词。不要写得像分析报告，也不要写成长段落；目标是产出 1 到 2 句、信息密度适中的提示词，让图像生成模型既能理解核心画面，又不会被过细细节锁死。

请重点保留这些信息：
1. 主体是谁/是什么，以及最重要的外观或身份特征。
2. 画面构图、主体位置、视角和背景类型。
3. 服装或造型中真正影响整体气质的关键元素。
4. 整体光线、质感、清晰度和风格。
5. 这张图的用途或氛围，例如职业形象照、商务海报、电商棚拍、生活方式场景等。
6. 如果图片里有文字、Logo、水印、价格标签或疑似 AI 乱码，不要要求精确复现，只保留必要的版式或风格倾向。

请严格输出 JSON：
- summary: 直接输出 1 到 2 句中文提示词，长度尽量控制在 45-90 个字之间，风格参考：“一张商务男士棚拍肖像，主体居中，灰色纯背景，人物穿深色西装双臂交叉，表情自信自然。整体光线柔和均匀，写实高清，具有职业形象照和商务海报感。”
- prompt: 与 summary 含义一致，可以略微展开，但不要比 summary 详细太多。

要求：
- 语气自然，像人写的中文生图提示词。
- 保留主体、构图、背景、关键造型、光线和气质。
- 不要堆砌过细五官、材质纹理、镜头参数、装饰性细节。
- 如果信息不够确定，就用稳妥、泛化的表达。`,
    },
    {
      type: 'image_url',
      image_url: {
        url: `data:${input.image.mediaType};base64,${input.image.data}`,
      },
    },
  ]

  const responseText = await requestTextJsonCompletion(content, 900, {
    operationId: input.operationId,
    sourcePage: 'reverse-prompt',
    entryPoint: '/api/reverse-prompt',
  })

  try {
    const parsed = JSON.parse(responseText)
    return {
      prompt: typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : typeof parsed.prompt === 'string' && parsed.prompt.trim()
          ? parsed.prompt.trim()
          : buildFallbackPrompt(),
      summary: typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : typeof parsed.prompt === 'string' && parsed.prompt.trim()
          ? parsed.prompt.trim()
          : '已根据上传图片提炼出一段简洁的生图提示词。',
    }
  } catch {
    return {
      prompt: buildFallbackPrompt(),
      summary: buildFallbackPrompt(),
    }
  }
}
