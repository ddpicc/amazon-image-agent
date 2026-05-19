import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createRedemptionCodes } from '@/lib/points'

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const points = Number(body.points)
    const quantity = Number(body.quantity)
    const packageId = typeof body.packageId === 'string' && body.packageId ? body.packageId : undefined
    const batchId = typeof body.batchId === 'string' && body.batchId ? body.batchId : undefined
    const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt ? new Date(body.expiresAt) : null

    if (!Number.isFinite(points) || points <= 0 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 500) {
      return NextResponse.json({ error: '参数不合法' }, { status: 400 })
    }

    const codes = await createRedemptionCodes({
      points,
      quantity,
      packageId,
      batchId,
      expiresAt,
      createdByUserId: user.id,
    })

    return NextResponse.json({ codes })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成兑换码失败' },
      { status: 400 },
    )
  }
}
