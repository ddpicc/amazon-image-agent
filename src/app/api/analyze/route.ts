import { NextRequest, NextResponse } from 'next/server'
import { startAiOperation, completeAiOperation, getAiOperationExpiryDate } from '@/lib/ai-operations'
import { requireApiUser } from '@/lib/auth'
import { analyzeProduct } from '@/lib/anthropic'
import { prisma } from '@/lib/prisma'
import { createReferenceImagePayloadsFromFiles, uploadReferenceImagesForAnalysis } from '@/lib/reference-images'

export async function POST(request: NextRequest) {
  let analysisRecordId: string | null = null
  let operationId: string | null = null

  try {
    const user = await requireApiUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()

    const productName = formData.get('productName') as string
    const description = formData.get('description') as string
    const category = formData.get('category') as string
    const targetAudience = formData.get('targetAudience') as string
    const referenceImages = [
      ...formData.getAll('referenceImages'),
      ...(!formData.get('referenceImage') ? [] : [formData.get('referenceImage')]),
    ].filter((item): item is File => item instanceof File)

    operationId = (await startAiOperation({
      userId: user.id,
      kind: 'ANALYSIS',
      sourcePage: 'amazon',
      entryPoint: '/api/analyze',
      inputSummary: {
        productName,
        category: category || 'General',
        targetAudience: targetAudience || 'General consumers',
        referenceImageCount: referenceImages.length,
      },
      requestSnapshot: {
        productName,
        description,
        category: category || 'General',
        targetAudience: targetAudience || 'General consumers',
        referenceImages: referenceImages.map((image, index) => ({
          index,
          name: image.name,
          mimeType: image.type || 'image/jpeg',
          sizeBytes: image.size,
        })),
      },
      expiresAt: getAiOperationExpiryDate(),
    })).id

    if (!productName || !description) {
      return NextResponse.json(
        { error: 'Product name and description are required' },
        { status: 400 }
      )
    }

    const analysisRecord = await prisma.analysisRecord.create({
      data: {
        userId: user.id,
        operationId,
        productName,
        description,
        category: category || 'General',
        targetAudience: targetAudience || 'General consumers',
        referenceImageCount: referenceImages.length,
        status: 'STARTED',
        requestSnapshotJson: {
          productName,
          description,
          category: category || 'General',
          targetAudience: targetAudience || 'General consumers',
        },
      },
    })
    analysisRecordId = analysisRecord.id

    const storedReferenceImages = await uploadReferenceImagesForAnalysis({
      recordId: analysisRecord.id,
      files: referenceImages,
    })
    await prisma.analysisRecord.update({
      where: { id: analysisRecord.id },
      data: {
        referenceImagesJson: storedReferenceImages as any,
      },
    })
    const imagePayloads = await createReferenceImagePayloadsFromFiles(referenceImages)

    const result = await analyzeProduct({
      productName,
      description,
      category: category || 'General',
      targetAudience: targetAudience || 'General consumers',
      referenceImages: imagePayloads,
      operationId: operationId ?? undefined,
    })

    await prisma.analysisRecord.update({
      where: { id: analysisRecord.id },
      data: {
        status: 'SUCCEEDED',
        productSummary: result.productSummary,
        analysisJson: result as any,
        responseSnapshotJson: result as any,
        completedAt: new Date(),
        durationMs: Date.now() - analysisRecord.createdAt.getTime(),
      },
    })

    if (operationId) {
      await completeAiOperation({
        operationId,
        status: 'SUCCEEDED',
        outputSummary: {
          productSummary: result.productSummary,
          sellingPointsCount: result.sellingPoints.length,
          canGeneratePrompts: result.canGeneratePrompts,
        },
        responseSnapshot: result,
      }).catch(() => undefined)
    }

    return NextResponse.json({
      ...result,
      analysisRecordId: analysisRecord.id,
    })
  } catch (error) {
    if (analysisRecordId) {
      const errorMessage = error instanceof Error && error.message === '网站暂不可用，请稍后再试。'
        ? '网站暂不可用，请稍后再试。'
        : error instanceof Error
          ? error.message
          : 'Failed to analyze product'
      await prisma.analysisRecord.update({
        where: { id: analysisRecordId },
        data: {
          status: 'FAILED',
          errorMessage,
          completedAt: new Date(),
        },
      }).catch(() => undefined)
    }
    if (operationId) {
      await completeAiOperation({
        operationId,
        status: 'FAILED',
        errorMessage: error instanceof Error && error.message === '网站暂不可用，请稍后再试。'
          ? '网站暂不可用，请稍后再试。'
          : error instanceof Error
            ? error.message
            : 'Failed to analyze product',
        responseSnapshot: {
          errorMessage: error instanceof Error ? error.message : 'Failed to analyze product',
        },
      }).catch(() => undefined)
    }
    console.error('Analyze error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error && error.message === '网站暂不可用，请稍后再试。'
          ? '网站暂不可用，请稍后再试。'
          : 'Failed to analyze product',
      },
      { status: 500 }
    )
  }
}
