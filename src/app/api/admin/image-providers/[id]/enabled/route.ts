import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { updateImageProviderEnabled } from '@/lib/image-providers'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const provider = await updateImageProviderEnabled(params.id, Boolean(body.enabled))
    return NextResponse.json({
      id: provider.id,
      enabled: provider.enabled,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新状态失败' },
      { status: 400 },
    )
  }
}
