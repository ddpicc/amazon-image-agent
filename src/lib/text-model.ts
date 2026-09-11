import OpenAI from 'openai'
import { TextProviderRoutingRole, UpstreamApiKind } from '@prisma/client'
import {
  listCandidateTextProviders,
  markTextProviderFailure,
  markTextProviderSuccess,
  getEffectiveTextProviderRoutingRole,
} from '@/lib/text-providers'
import { completeAiOperationAttempt, startAiOperationAttempt } from '@/lib/ai-operations'

const DEFAULT_TEXT_PROVIDER_TOTAL_TIMEOUT_MS = 5 * 60 * 1000
const TEXT_PROVIDER_ROUTE_STRATEGY = 'primary-budget-then-glm-fallback'

const TEXT_SERVICE_UNAVAILABLE_MESSAGE = '网站暂不可用，请稍后再试。'
let textRequestSequence = 0

interface TextProviderConfig {
  id?: string
  apiKey: string
  baseURL: string
  model: string
  name: string
}

type TextProviderRoutePhase = 'primary' | 'fallback'

export type TextModelStatusEvent =
  | {
      type: 'attempt-started'
      providerName: string
      model: string
      routePhase: TextProviderRoutePhase
      attemptIndex: number
      providerCount: number
    }
  | {
      type: 'provider-switch'
      fromProviderName: string
      fromModel: string
      toProviderName: string
      toModel: string
      reason: 'failed'
    }
  | {
      type: 'fallback-switch'
      fromProviderName: string | null
      fromModel: string | null
      toProviderName: string
      toModel: string
      reason: 'primary-timeout' | 'primary-providers-failed'
    }

export interface TextOperationContext {
  operationId?: string
  sourcePage?: string
  entryPoint?: string
  phase?: string
  totalTimeoutMs?: number
  onStatus?: (event: TextModelStatusEvent) => void
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

function emitStatus(context: TextOperationContext | undefined, event: TextModelStatusEvent) {
  try {
    context?.onStatus?.(event)
  } catch (error) {
    console.warn('[text-model] status callback failed', {
      eventType: event.type,
      errorMessage: error instanceof Error ? error.message : String(error),
    })
  }
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
  const providersWithEffectiveRoles = providers.map((provider) => ({
    ...provider,
    routingRole: getEffectiveTextProviderRoutingRole(provider),
  }))
  const forcedFallbackProviders = providersWithEffectiveRoles.filter((provider) => provider.routingRole === TextProviderRoutingRole.FORCED_FALLBACK)
  const fallbackProvider = forcedFallbackProviders[0]
  const primaryProviders = providersWithEffectiveRoles.filter((provider) => provider.routingRole !== TextProviderRoutingRole.FORCED_FALLBACK)
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
    routeStrategy: TEXT_PROVIDER_ROUTE_STRATEGY,
    primaryProviderCount: primaryProviders.length,
    fallbackProvider: fallbackProvider?.name ?? null,
    fallbackModel: fallbackProvider?.model ?? null,
  })

  if (providers.length === 0) {
    console.error('[text-model] request:no-providers', {
      requestId,
      operationId: operationContext?.operationId ?? null,
      totalDurationMs: Date.now() - startedAt,
    })
    throw new TextServiceUnavailableError('没有可用的文本模型 Provider')
  }

  let attemptIndex = 0

  const runProviderPhase = async (
    phaseProviders: TextProviderConfig[],
    routePhase: TextProviderRoutePhase,
  ): Promise<{
    response: string | null
    lastProvider: TextProviderConfig | null
    timedOut: boolean
  }> => {
    const phaseStartedAt = Date.now()
    let lastProvider: TextProviderConfig | null = null
    let timedOut = false

    for (let index = 0; index < phaseProviders.length; index += 1) {
      const provider = phaseProviders[index]
      lastProvider = provider

      const elapsedInPhase = Date.now() - phaseStartedAt
      const remainingPhaseBudgetMs = totalTimeoutMs - elapsedInPhase
      if (remainingPhaseBudgetMs <= 0) {
        timedOut = true
        break
      }

      attemptIndex += 1
      const openai = getOpenAIClient(provider)
      const controller = new AbortController()
      // This is the remaining budget for the whole route phase, not a per-provider timeout.
      const timeoutMs = remainingPhaseBudgetMs
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      const attemptStartedAt = Date.now()
      const routingSnapshot = {
        strategy: TEXT_PROVIDER_ROUTE_STRATEGY,
        reasoningMode: 'not-explicitly-configured',
        routePhase,
        attemptIndex,
        phaseAttemptIndex: index + 1,
        candidateProviderCount: providers.length,
        primaryProviderCount: primaryProviders.length,
        candidateProviders: providers.map((candidate) => ({
          providerName: candidate.name,
          model: candidate.model,
          role: candidate.routingRole === TextProviderRoutingRole.FORCED_FALLBACK ? 'forced-fallback' : candidate.routingRole === TextProviderRoutingRole.FALLBACK ? 'fallback' : 'auto',
        })),
        phaseBudgetMs: totalTimeoutMs,
        remainingPhaseBudgetMs,
        timeoutScope: `${routePhase}-phase-total`,
        fallbackProviderName: fallbackProvider?.name ?? null,
        fallbackModel: fallbackProvider?.model ?? null,
      }
      const requestSnapshot = {
        sourcePage: operationContext?.sourcePage ?? null,
        entryPoint: operationContext?.entryPoint ?? null,
        phase: operationContext?.phase ?? null,
        maxTokens,
        messagePartCount: content.length,
        routing: routingSnapshot,
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
            attemptIndex,
            upstreamApiKind: UpstreamApiKind.UNKNOWN,
            requestSnapshot,
          })
        : null

      emitStatus(operationContext, {
        type: 'attempt-started',
        providerName: provider.name,
        model: provider.model,
        routePhase,
        attemptIndex,
        providerCount: providers.length,
      })

      console.info('[text-model] attempt:start', {
        requestId,
        operationId: operationContext?.operationId ?? null,
        attemptIndex,
        phase: operationContext?.phase ?? null,
        routePhase,
        provider: provider.name,
        model: provider.model,
        timeoutMs,
        elapsedBeforeAttemptMs: Date.now() - startedAt,
        elapsedInPhaseMs: elapsedInPhase,
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
              routing: {
                ...routingSnapshot,
                outcome: 'succeeded',
                nextAction: 'complete',
              },
            },
          })
        }

        console.info('[text-model] attempt:success', {
          requestId,
          operationId: operationContext?.operationId ?? null,
          attemptIndex,
          phase: operationContext?.phase ?? null,
          routePhase,
          provider: provider.name,
          model: provider.model,
          modelDurationMs: Date.now() - attemptStartedAt,
          totalDurationMs: Date.now() - startedAt,
          contentLength: responseContent.length,
          finishReason,
        })

        return { response: responseContent, lastProvider, timedOut: false }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const aborted = isAbortLikeError(error)
        failures.push(`${provider.name}: ${message}`)

        if (provider.id) {
          await markTextProviderFailure(provider.id).catch(() => undefined)
        }

        const phaseTimedOut = Date.now() - phaseStartedAt >= totalTimeoutMs
        const nextProvider = phaseTimedOut ? null : phaseProviders[index + 1] ?? null
        const willSwitchToFallback = routePhase === 'primary'
          && Boolean(fallbackProvider)
          && !nextProvider
        const nextAction = nextProvider
          ? 'try-next-primary-provider'
          : willSwitchToFallback
            ? 'switch-to-glm-fallback'
            : 'fail-request'

        console.warn('[text-model] attempt:failed', {
          requestId,
          operationId: operationContext?.operationId ?? null,
          attemptIndex,
          phase: operationContext?.phase ?? null,
          routePhase,
          provider: provider.name,
          model: provider.model,
          durationMs: Date.now() - attemptStartedAt,
          totalDurationMs: Date.now() - startedAt,
          phaseTimedOut,
          aborted,
          nextAction,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: message,
        })

        if (operationAttempt) {
          await completeAiOperationAttempt({
            attemptId: operationAttempt.id,
            status: 'FAILED',
            errorMessage: message,
            responseSnapshot: {
              aborted,
              errorMessage: message,
              routing: {
                ...routingSnapshot,
                outcome: 'failed',
                phaseTimedOut,
                nextAction,
              },
            },
          }).catch(() => undefined)
        }

        if (phaseTimedOut) timedOut = true

        if (nextProvider) {
          emitStatus(operationContext, {
            type: 'provider-switch',
            fromProviderName: provider.name,
            fromModel: provider.model,
            toProviderName: nextProvider.name,
            toModel: nextProvider.model,
            reason: 'failed',
          })
          continue
        }

        break
      } finally {
        clearTimeout(timeout)
      }
    }

    return { response: null, lastProvider, timedOut }
  }

  let primaryResult: Awaited<ReturnType<typeof runProviderPhase>> | null = null
  if (primaryProviders.length > 0) {
    primaryResult = await runProviderPhase(primaryProviders, 'primary')
    if (primaryResult.response !== null) return primaryResult.response
  }

  if (fallbackProvider) {
    if (primaryResult) {
      emitStatus(operationContext, {
        type: 'fallback-switch',
        fromProviderName: primaryResult.lastProvider?.name ?? null,
        fromModel: primaryResult.lastProvider?.model ?? null,
        toProviderName: fallbackProvider.name,
        toModel: fallbackProvider.model,
        reason: primaryResult.timedOut ? 'primary-timeout' : 'primary-providers-failed',
      })
    }

    const fallbackResult = await runProviderPhase(forcedFallbackProviders, 'fallback')
    if (fallbackResult.response !== null) return fallbackResult.response
  }

  console.error('[text-model] request:failed', {
    requestId,
    operationId: operationContext?.operationId ?? null,
    totalDurationMs: Date.now() - startedAt,
    attemptedProviderCount: attemptIndex,
    providerCount: providers.length,
    fallbackConfigured: Boolean(fallbackProvider),
    failures,
  })
  throw new TextServiceUnavailableError()
}
