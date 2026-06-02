import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { deleteTextProvider } from '@/lib/text-providers'

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await deleteTextProvider(params.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除 provider 失败' },
      { status: 400 },
    )
  }
}
