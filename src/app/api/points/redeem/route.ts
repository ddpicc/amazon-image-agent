import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { toDisplayPoints } from '@/lib/points-config'
import { redeemCode } from '@/lib/points'

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const code = typeof body.code === 'string' ? body.code.trim() : ''

    if (!code) {
      return NextResponse.json({ error: '请输入兑换码' }, { status: 400 })
    }

    const result = await redeemCode({
      userId: user.id,
      code,
    })

    return NextResponse.json({
      pointsBalance: toDisplayPoints(result.pointsBalance),
      ledgerEntry: {
        ...result.ledgerEntry,
        pointsDelta: toDisplayPoints(result.ledgerEntry.pointsDelta),
        balanceAfter: toDisplayPoints(result.ledgerEntry.balanceAfter),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '兑换失败' },
      { status: 400 },
    )
  }
}
