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
  parseStoredReferenceImages,
} from '@/lib/amazon-workflow'
import { ensureSufficientPointsForAnalysisByScene, saveSuccessfulAnalysisWithCharge } from '@/lib/points'
import { prisma } from '@/lib/prisma'
import { createReferenceImagePayloadsFromUrls, areReferenceImagesExpired } from '@/lib/reference-images'

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
    if (existingResult) {
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

    const nextPromptResults = mergePromptResults(promptResults, branch, result)

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
