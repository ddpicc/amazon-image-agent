import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { moveTextProvider } from '@/lib/text-providers'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const direction = body.direction === 'down' ? 'down' : body.direction === 'up' ? 'up' : null
    if (!direction) {
      return NextResponse.json({ error: 'direction is invalid' }, { status: 400 })
    }

    const provider = await moveTextProvider(params.id, direction)
    return NextResponse.json(provider)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '移动 provider 失败' },
      { status: 400 },
    )
  }
}
