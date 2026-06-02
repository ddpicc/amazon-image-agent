import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { updateTextProviderPriority } from '@/lib/text-providers'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const provider = await updateTextProviderPriority(params.id, Number(body.priority))
    return NextResponse.json({
      id: provider.id,
      priority: provider.priority,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新优先级失败' },
      { status: 400 },
    )
  }
}
