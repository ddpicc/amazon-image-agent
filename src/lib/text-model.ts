import OpenAI from 'openai'
import {
  listCandidateTextProviders,
  markTextProviderFailure,
  markTextProviderSuccess,
} from '@/lib/text-providers'

const TEXT_PROVIDER_TOTAL_TIMEOUT_MS = 5 * 60 * 1000
const TEXT_PROVIDER_MIN_ATTEMPT_TIMEOUT_MS = 15 * 1000

export const TEXT_SERVICE_UNAVAILABLE_MESSAGE = '网站暂不可用，请稍后再试。'

interface TextProviderConfig {
  id?: string
  apiKey: string
  baseURL: string
  model: string
  name: string
}

export class TextServiceUnavailableError extends Error {
  constructor(message = TEXT_SERVICE_UNAVAILABLE_MESSAGE) {
    super(message)
    this.name = 'TextServiceUnavailableError'
  }
}

function getOpenAIClient(provider: TextProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
  })
}

function isAbortLikeError(error: unknown) {
  return Boolean(
    error
      && typeof error === 'object'
      && ('name' in error || 'message' in error)
      && (
        (error as { name?: string }).name === 'AbortError'
        || (error as { message?: string }).message?.includes('aborted')
      ),
  )
}

export async function requestTextJsonCompletion(
  content: OpenAI.Chat.Completions.ChatCompletionContentPart[],
  maxTokens: number,
): Promise<string> {
  const providers = await listCandidateTextProviders()
  const startedAt = Date.now()
  const failures: string[] = []

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]
    const elapsed = Date.now() - startedAt
    const remaining = TEXT_PROVIDER_TOTAL_TIMEOUT_MS - elapsed

    if (remaining <= 0) {
      throw new TextServiceUnavailableError()
    }

    const openai = getOpenAIClient(provider)
    const controller = new AbortController()
    const timeoutMs = remaining <= TEXT_PROVIDER_MIN_ATTEMPT_TIMEOUT_MS
      ? remaining
      : Math.min(remaining, TEXT_PROVIDER_TOTAL_TIMEOUT_MS)
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const message = await openai.chat.completions.create({
        model: provider.model,
        messages: [
          {
            role: 'user',
            content,
          },
        ],
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }, {
        signal: controller.signal,
      })

      if (provider.id) {
        await markTextProviderSuccess(provider.id)
      }

      return message.choices[0]?.message?.content || ''
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${provider.name}: ${message}`)

      if (provider.id) {
        await markTextProviderFailure(provider.id).catch(() => undefined)
      }

      const isLastProvider = index === providers.length - 1
      const totalTimedOut = Date.now() - startedAt >= TEXT_PROVIDER_TOTAL_TIMEOUT_MS
      if (isLastProvider || totalTimedOut) {
        console.error('Text providers failed:', failures.join(' | '))
        throw new TextServiceUnavailableError()
      }

      if (isAbortLikeError(error)) {
        continue
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new TextServiceUnavailableError()
}
