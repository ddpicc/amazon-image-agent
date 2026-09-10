import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { deleteAnnouncement } from '@/lib/announcements'

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const deleted = await deleteAnnouncement(params.id)
    if (!deleted) {
      return NextResponse.json({ error: '公告不存在或已被删除' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除公告失败' },
      { status: 400 },
    )
  }
}
