import { NextRequest, NextResponse } from 'next/server'
import { startAiOperation, completeAiOperation, getAiOperationExpiryDate } from '@/lib/ai-operations'
import { requireApiUser } from '@/lib/auth'
import {
  buildAPlusAnalysisSummary,
  buildAnalysisSummaryForPromptGeneration,
  generateAllPrompts,
  generateAPlusPrompt,
} from '@/lib/anthropic'
import {
  AmazonBranch,
  AMAZON_REFERENCE_IMAGE_LIMIT,
  PromptResults,
  normalizePromptResults,
  isBasicAnalysisResult,
  isPromptGenerationComplete,
  parseStoredReferenceImages,
} from '@/lib/amazon-workflow'
import { ensureSufficientPointsForAnalysisByScene, saveSuccessfulAnalysisWithCharge } from '@/lib/points'
import { prisma } from '@/lib/prisma'
import { createReferenceImagePayloadsFromUrls, areReferenceImagesExpired } from '@/lib/reference-images'

const PROMPT_GENERATION_CLAIM_WINDOW_MS = 12 * 60 * 1000

function getPromptGenerationAnalysisId(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  return typeof record.analysisId === 'string' ? record.analysisId : null
}

function mergePromptResults(
  previous: PromptResults,
  branch: AmazonBranch,
  nextResult: PromptResults['amazonSet'] | PromptResults['aplus'],
): PromptResults {
  if (branch === 'amazon-set') {
    return {
      ...previous,
      amazonSet: nextResult as PromptResults['amazonSet'],
    }
  }

  return {
    ...previous,
    aplus: nextResult as PromptResults['aplus'],
  }
}

export async function POST(request: NextRequest) {
  let operationId: string | null = null

  try {
    const user = await requireApiUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const analysisId = typeof body.analysisId === 'string' ? body.analysisId : ''
    const branch = body.branch === 'amazon-set' || body.branch === 'aplus' ? body.branch as AmazonBranch : null

    if (!analysisId || !branch) {
      return NextResponse.json({ error: 'analysisId and branch are required' }, { status: 400 })
    }

    const record = await prisma.analysisRecord.findFirst({
      where: {
        id: analysisId,
        userId: user.id,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        productName: true,
        description: true,
        additionalRequirements: true,
        category: true,
        targetAudience: true,
        analysisJson: true,
        referenceImagesJson: true,
        promptPlanJson: true,
      },
    })

    if (!record) {
      return NextResponse.json({ error: '分析记录不存在' }, { status: 404 })
    }

    if (record.status !== 'SUCCEEDED' || !record.analysisJson) {
      return NextResponse.json({ error: '基础分析尚未完成' }, { status: 400 })
    }

    const promptResults = normalizePromptResults(record.promptPlanJson)
    const existingResult = branch === 'amazon-set' ? promptResults.amazonSet : promptResults.aplus
    // A fallback plan is structurally complete, but it is only a degraded
    // template. Let an explicit retry regenerate it instead of returning it
    // immediately forever.
    if (existingResult && isPromptGenerationComplete(existingResult) && !existingResult.generatedByFallback) {
      return NextResponse.json({
        branch,
        result: existingResult,
        charged: false,
      })
    }

    await ensureSufficientPointsForAnalysisByScene(
      user.id,
      branch === 'aplus' ? 'aplus-analysis' : 'amazon-analysis',
    )

    if (!isBasicAnalysisResult(record.analysisJson)) {
      return NextResponse.json({ error: '分析结果格式无效，请重新分析' }, { status: 400 })
    }

    const basicAnalysisResult = record.analysisJson
    const storedReferenceImages = parseStoredReferenceImages(record.referenceImagesJson)
      .filter((item) => item.url.length > 0)

    if (storedReferenceImages.length > 0 && areReferenceImagesExpired(record.createdAt)) {
      return NextResponse.json({
        error: '这条记录的参考图已按 30 天保存策略自动清理，无法带原图重新生成。请重新上传参考图，或直接新建分析。',
      }, { status: 410 })
    }

    // Create the diagnostic operation only after the cheap cached-result and
    // validation checks. Returning a cached plan should not leave a STARTED
    // operation behind, and it should not participate in the in-flight claim.
    operationId = (await startAiOperation({
      userId: user.id,
      kind: 'ANALYSIS',
      sourcePage: 'amazon',
      entryPoint: '/api/analyze/prompts',
      inputSummary: {
        analysisId,
        branch,
      },
      requestSnapshot: {
        analysisId,
        branch,
      },
      expiresAt: getAiOperationExpiryDate(),
    })).id

    // Opening the same record in several tabs (or retrying while a request is
    // still running) used to start several prompt generations for the same
    // analysis. The last one to finish could then overwrite a better result.
    // The earliest active operation owns the generation; later ones back off.
    const activePromptOperations = await prisma.aiOperation.findMany({
      where: {
        userId: user.id,
        entryPoint: '/api/analyze/prompts',
        status: 'STARTED',
        startedAt: { gte: new Date(Date.now() - PROMPT_GENERATION_CLAIM_WINDOW_MS) },
      },
      orderBy: [
        { startedAt: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        inputSummaryJson: true,
      },
    })
    const firstActiveOperation = activePromptOperations.find((operation) => {
      // Serialise all prompt work for one analysis, including the A+ branch,
      // because both branches merge into the same promptPlanJson field.
      return getPromptGenerationAnalysisId(operation.inputSummaryJson) === analysisId
    })

    if (firstActiveOperation && firstActiveOperation.id !== operationId) {
      await completeAiOperation({
        operationId,
        status: 'FAILED',
        errorMessage: '这个分析已有 Prompt 生成任务在执行',
        responseSnapshot: {
          skipped: true,
          activeOperationId: firstActiveOperation.id,
        },
      }).catch(() => undefined)
      return NextResponse.json(
        { error: '这个分析正在生成 Prompt，请稍后刷新页面查看结果。' },
        { status: 409 },
      )
    }

    const imagePayloads = await createReferenceImagePayloadsFromUrls(
      storedReferenceImages.map((item) => item.url),
      AMAZON_REFERENCE_IMAGE_LIMIT,
    )
    const analysisSummary = branch === 'amazon-set'
      ? buildAnalysisSummaryForPromptGeneration(basicAnalysisResult)
      : buildAPlusAnalysisSummary(basicAnalysisResult)

    const result = branch === 'amazon-set'
      ? {
        status: 'completed' as const,
        ...(await generateAllPrompts(
          record.productName,
          record.description,
          record.category,
          record.targetAudience,
          imagePayloads,
          analysisSummary,
          operationId ?? undefined,
          record.additionalRequirements ?? '',
        )),
      }
      : {
        status: 'completed' as const,
        ...(await generateAPlusPrompt(
          record.productName,
          record.description,
          record.category,
          record.targetAudience,
          imagePayloads,
          analysisSummary,
          operationId ?? undefined,
          promptResults.amazonSet,
        )),
      }

    // Another request may have finished while this one was generating. Keep a
    // complete, model-generated plan instead of letting a slower fallback or a
    // duplicate request overwrite it.
    const latestRecord = await prisma.analysisRecord.findUnique({
      where: { id: record.id },
      select: { promptPlanJson: true },
    })
    const latestPromptResults = normalizePromptResults(latestRecord?.promptPlanJson)
    const latestResult = branch === 'amazon-set' ? latestPromptResults.amazonSet : latestPromptResults.aplus

    if (latestResult && isPromptGenerationComplete(latestResult) && !latestResult.generatedByFallback) {
      if (operationId) {
        await completeAiOperation({
          operationId,
          status: 'SUCCEEDED',
          outputSummary: {
            branch,
            promptCount: Object.keys(latestResult.suggestedPrompts).length,
            reusedExistingResult: true,
          },
          responseSnapshot: latestResult,
        }).catch(() => undefined)
      }
      return NextResponse.json({
        branch,
        result: latestResult,
        charged: false,
      })
    }

    const nextPromptResults = mergePromptResults(latestPromptResults, branch, result)

    await saveSuccessfulAnalysisWithCharge({
      userId: user.id,
      analysisId: record.id,
      scene: branch === 'aplus' ? 'aplus-analysis' : 'amazon-analysis',
      data: {
        promptPlanJson: nextPromptResults as any,
      },
    })

    if (operationId) {
      await completeAiOperation({
        operationId,
        status: 'SUCCEEDED',
        outputSummary: {
          branch,
          promptCount: Object.keys(result.suggestedPrompts).length,
          generatedByFallback: result.generatedByFallback === true,
        },
        responseSnapshot: result,
      }).catch(() => undefined)
    }

    return NextResponse.json({
      branch,
      result,
      charged: true,
    })
  } catch (error) {
    if (operationId) {
      await completeAiOperation({
        operationId,
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Failed to generate prompts',
        responseSnapshot: {
          errorMessage: error instanceof Error ? error.message : 'Failed to generate prompts',
        },
      }).catch(() => undefined)
    }
    console.error('Generate prompts error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate prompts' },
      { status: 500 },
    )
  }
}
