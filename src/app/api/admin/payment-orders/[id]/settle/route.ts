import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { settlePaymentOrderManually } from '@/lib/points'

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const user = await requireApiUser(request)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const orderId = String(context.params.id || '').trim()
    if (!orderId) {
      return NextResponse.json({ error: '缺少订单 ID' }, { status: 400 })
    }

    const ledgerEntry = await settlePaymentOrderManually({
      orderId,
      adminUserId: user.id,
    })

    return NextResponse.json({
      success: true,
      ledgerEntryId: ledgerEntry.id,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '手动入账失败' },
      { status: 400 },
    )
  }
}
