import { NextRequest, NextResponse } from 'next/server'
import { AnalysisStatus } from '@prisma/client'
import { requireApiUser } from '@/lib/auth'
import { analyzeProduct } from '@/lib/anthropic'
import { prisma } from '@/lib/prisma'
import { createReferenceImagePayloadsFromFiles, uploadReferenceImagesForAnalysis } from '@/lib/reference-images'

export async function POST(request: NextRequest) {
  let analysisRecordId: string | null = null

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

    if (!productName || !description) {
      return NextResponse.json(
        { error: 'Product name and description are required' },
        { status: 400 }
      )
    }

    const analysisRecord = await prisma.analysisRecord.create({
      data: {
        userId: user.id,
        productName,
        description,
        category: category || 'General',
        targetAudience: targetAudience || 'General consumers',
        referenceImageCount: referenceImages.length,
        status: AnalysisStatus.STARTED,
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
      referenceImages: imagePayloads
    })

    await prisma.analysisRecord.update({
      where: { id: analysisRecord.id },
      data: {
        status: AnalysisStatus.SUCCEEDED,
        productSummary: result.productSummary,
        analysisJson: result as any,
      },
    })

    return NextResponse.json({
      ...result,
      analysisRecordId: analysisRecord.id,
    })
  } catch (error) {
    if (analysisRecordId) {
      await prisma.analysisRecord.update({
        where: { id: analysisRecordId },
        data: {
          status: AnalysisStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Failed to analyze product',
        },
      }).catch(() => undefined)
    }
    console.error('Analyze error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze product' },
      { status: 500 }
    )
  }
}
