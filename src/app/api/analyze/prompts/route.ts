import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import {
  buildAPlusAnalysisSummary,
  buildAnalysisSummaryForPromptGeneration,
  generateAllPrompts,
  generateAPlusPrompt,
} from '@/lib/anthropic'
import { AmazonBranch, BasicAnalysisResult, PromptResults, StoredReferenceImage, normalizePromptResults } from '@/lib/amazon-workflow'
import { prisma } from '@/lib/prisma'
import { createReferenceImagePayloadsFromUrls } from '@/lib/reference-images'

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
        productName: true,
        description: true,
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
      })
    }

    const basicAnalysisResult = record.analysisJson as BasicAnalysisResult
    const storedReferenceImages = ((record.referenceImagesJson as StoredReferenceImage[] | null) || [])
      .filter((item) => typeof item?.url === 'string' && item.url.length > 0)
    const imagePayloads = await createReferenceImagePayloadsFromUrls(
      storedReferenceImages.slice(0, 3).map((item) => item.url),
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
        )),
      }

    const nextPromptResults = mergePromptResults(promptResults, branch, result)

    await prisma.analysisRecord.update({
      where: { id: record.id },
      data: {
        promptPlanJson: nextPromptResults as any,
      },
    })

    return NextResponse.json({
      branch,
      result,
    })
  } catch (error) {
    console.error('Generate prompts error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate prompts' },
      { status: 500 },
    )
  }
}
