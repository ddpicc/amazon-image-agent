import OpenAI from 'openai'
import { UpstreamApiKind } from '@prisma/client'
import {
  listCandidateTextProviders,
  markTextProviderFailure,
  markTextProviderSuccess,
} from '@/lib/text-providers'
import { completeAiOperationAttempt, startAiOperationAttempt } from '@/lib/ai-operations'

const DEFAULT_TEXT_PROVIDER_TOTAL_TIMEOUT_MS = 5 * 60 * 1000
const TEXT_PROVIDER_MIN_ATTEMPT_TIMEOUT_MS = 15 * 1000

const TEXT_SERVICE_UNAVAILABLE_MESSAGE = '网站暂不可用，请稍后再试。'
let textRequestSequence = 0

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
  phase?: string
  totalTimeoutMs?: number
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
  const requestId = `text_${Date.now()}_${textRequestSequence += 1}`
  const startedAt = Date.now()
  const failures: string[] = []
  const totalTimeoutMs = operationContext?.totalTimeoutMs || DEFAULT_TEXT_PROVIDER_TOTAL_TIMEOUT_MS
  const imagePartCount = content.filter((part) => part.type === 'image_url').length
  const textCharCount = content
    .filter((part): part is OpenAI.Chat.Completions.ChatCompletionContentPartText => part.type === 'text')
    .reduce((total, part) => total + part.text.length, 0)

  console.info('[text-model] request:start', {
    requestId,
    operationId: operationContext?.operationId ?? null,
    sourcePage: operationContext?.sourcePage ?? null,
    entryPoint: operationContext?.entryPoint ?? null,
    phase: operationContext?.phase ?? null,
    providerCount: providers.length,
    maxTokens,
    messagePartCount: content.length,
    imagePartCount,
    textCharCount,
    totalTimeoutMs,
  })

  if (providers.length === 0) {
    console.error('[text-model] request:no-providers', {
      requestId,
      operationId: operationContext?.operationId ?? null,
      totalDurationMs: Date.now() - startedAt,
    })
    throw new TextServiceUnavailableError('没有可用的文本模型 Provider')
  }

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]
    const elapsed = Date.now() - startedAt
    const remaining = totalTimeoutMs - elapsed

    if (remaining <= 0) {
      throw new TextServiceUnavailableError()
    }

    const openai = getOpenAIClient(provider)
    const controller = new AbortController()
    const timeoutMs = remaining <= TEXT_PROVIDER_MIN_ATTEMPT_TIMEOUT_MS
      ? remaining
      : Math.min(remaining, totalTimeoutMs)
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const attemptStartedAt = Date.now()
    const requestSnapshot = {
      sourcePage: operationContext?.sourcePage ?? null,
      entryPoint: operationContext?.entryPoint ?? null,
      phase: operationContext?.phase ?? null,
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

    console.info('[text-model] attempt:start', {
      requestId,
      operationId: operationContext?.operationId ?? null,
      attemptIndex: index + 1,
      phase: operationContext?.phase ?? null,
      provider: provider.name,
      model: provider.model,
      timeoutMs,
      elapsedBeforeAttemptMs: elapsed,
    })

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
      const responseContent = message.choices[0]?.message?.content || ''
      const finishReason = message.choices[0]?.finish_reason ?? null

      if (provider.id) {
        await markTextProviderSuccess(provider.id)
      }

      if (operationAttempt) {
        await completeAiOperationAttempt({
          attemptId: operationAttempt.id,
          status: 'SUCCEEDED',
          responseSnapshot: {
            contentLength: responseContent.length,
            finishReason,
          },
        })
      }

      console.info('[text-model] attempt:success', {
        requestId,
        operationId: operationContext?.operationId ?? null,
        attemptIndex: index + 1,
        phase: operationContext?.phase ?? null,
        provider: provider.name,
        model: provider.model,
        modelDurationMs: Date.now() - attemptStartedAt,
        totalDurationMs: Date.now() - startedAt,
        contentLength: responseContent.length,
        finishReason,
      })

      return responseContent
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${provider.name}: ${message}`)

      console.warn('[text-model] attempt:failed', {
        requestId,
        operationId: operationContext?.operationId ?? null,
        attemptIndex: index + 1,
        phase: operationContext?.phase ?? null,
        provider: provider.name,
        model: provider.model,
        durationMs: Date.now() - attemptStartedAt,
        totalDurationMs: Date.now() - startedAt,
        aborted: isAbortLikeError(error),
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: message,
      })

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
      const totalTimedOut = Date.now() - startedAt >= totalTimeoutMs
      if (isLastProvider || totalTimedOut) {
        console.error('[text-model] request:failed', {
          requestId,
          operationId: operationContext?.operationId ?? null,
          totalDurationMs: Date.now() - startedAt,
          attemptedProviderCount: index + 1,
          failures,
        })
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
