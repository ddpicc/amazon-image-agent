import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { getPointsSummary } from '@/lib/points'

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const summary = await getPointsSummary(user.id)
  return NextResponse.json(summary)
}
