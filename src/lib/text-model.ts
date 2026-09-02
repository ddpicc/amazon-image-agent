import OpenAI from 'openai'
import { UpstreamApiKind } from '@prisma/client'
import {
  listCandidateTextProviders,
  markTextProviderFailure,
  markTextProviderSuccess,
} from '@/lib/text-providers'
import { completeAiOperationAttempt, startAiOperationAttempt } from '@/lib/ai-operations'

const TEXT_PROVIDER_TOTAL_TIMEOUT_MS = 5 * 60 * 1000
const TEXT_PROVIDER_MIN_ATTEMPT_TIMEOUT_MS = 15 * 1000

const TEXT_SERVICE_UNAVAILABLE_MESSAGE = '网站暂不可用，请稍后再试。'

interface TextProviderConfig {
  id?: string
  apiKey: string
  baseURL: string
  model: string
  name: string
}

interface TextOperationContext {
  operationId?: string
  sourcePage?: string
  entryPoint?: string
}

class TextServiceUnavailableError extends Error {
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
  operationContext?: TextOperationContext,
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
    const requestSnapshot = {
      sourcePage: operationContext?.sourcePage ?? null,
      entryPoint: operationContext?.entryPoint ?? null,
      maxTokens,
      messagePartCount: content.length,
      textPreview: content
        .filter((part): part is OpenAI.Chat.Completions.ChatCompletionContentPartText => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
        .slice(0, 2000),
    }
    const operationAttempt = operationContext?.operationId
      ? await startAiOperationAttempt({
          operationId: operationContext.operationId,
          providerType: 'TEXT',
          providerId: provider.id,
          providerName: provider.name,
          baseUrl: provider.baseURL,
          model: provider.model,
          attemptIndex: index + 1,
          upstreamApiKind: UpstreamApiKind.UNKNOWN,
          requestSnapshot,
        })
      : null

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

      if (operationAttempt) {
        await completeAiOperationAttempt({
          attemptId: operationAttempt.id,
          status: 'SUCCEEDED',
          responseSnapshot: {
            contentLength: message.choices[0]?.message?.content?.length ?? 0,
            finishReason: message.choices[0]?.finish_reason ?? null,
          },
        })
      }

      return message.choices[0]?.message?.content || ''
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${provider.name}: ${message}`)

      if (provider.id) {
        await markTextProviderFailure(provider.id).catch(() => undefined)
      }

      if (operationAttempt) {
        await completeAiOperationAttempt({
          attemptId: operationAttempt.id,
          status: 'FAILED',
          errorMessage: message,
          responseSnapshot: {
            aborted: isAbortLikeError(error),
            errorMessage: message,
          },
        }).catch(() => undefined)
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
