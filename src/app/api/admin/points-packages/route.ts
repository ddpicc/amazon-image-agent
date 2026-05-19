import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createPointsPackage } from '@/lib/points'

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const points = Number(body.points)
    const priceCents = Number(body.priceCents)
    const displayOrder = Number(body.displayOrder || 0)

    if (!name || !Number.isFinite(points) || points <= 0 || !Number.isFinite(priceCents) || priceCents < 0) {
      return NextResponse.json({ error: '参数不合法' }, { status: 400 })
    }

    const pkg = await createPointsPackage({
      name,
      points,
      priceCents,
      displayOrder,
    })

    return NextResponse.json(pkg)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建积分包失败' },
      { status: 400 },
    )
  }
}
