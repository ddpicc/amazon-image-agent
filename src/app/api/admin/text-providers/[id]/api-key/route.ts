import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { rotateTextProviderApiKey } from '@/lib/text-providers'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    await rotateTextProviderApiKey(params.id, typeof body.apiKey === 'string' ? body.apiKey : '')
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新 API key 失败' },
      { status: 400 },
    )
  }
}
