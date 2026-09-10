import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { setUserPointsBalanceByAdmin } from '@/lib/points'
import { toDisplayPoints } from '@/lib/points-config'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireApiUser(request)
  if (!admin || admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const targetUserId = String(params.id || '').trim()
    const targetBalance = Number(body.targetBalance)
    const reason = String(body.reason || '').trim()
    const requestId = String(body.requestId || '').trim()

    if (!targetUserId || !requestId || requestId.length > 100) {
      return NextResponse.json({ error: '请求参数不完整' }, { status: 400 })
    }

    const ledgerEntry = await setUserPointsBalanceByAdmin({
      targetUserId,
      adminUserId: admin.id,
      adminEmail: admin.email,
      targetBalance,
      reason,
      requestId,
    })

    return NextResponse.json({
      success: true,
      pointsBalance: toDisplayPoints(ledgerEntry.balanceAfter),
      pointsDelta: toDisplayPoints(ledgerEntry.pointsDelta),
      ledgerEntryId: ledgerEntry.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '积分调整失败'
    const status = message === '用户不存在' ? 404 : message.includes('transaction') ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
