import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { getLatestAnnouncement, saveAnnouncement } from '@/lib/announcements'

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const announcement = await getLatestAnnouncement()
  return NextResponse.json({ announcement })
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const announcement = await saveAnnouncement({
      title: typeof body.title === 'string' ? body.title : '',
      body: typeof body.body === 'string' ? body.body : '',
      isActive: Boolean(body.isActive),
      startsAt: typeof body.startsAt === 'string' ? body.startsAt : null,
      endsAt: typeof body.endsAt === 'string' ? body.endsAt : null,
      ctaLabel: typeof body.ctaLabel === 'string' ? body.ctaLabel : null,
      ctaHref: typeof body.ctaHref === 'string' ? body.ctaHref : null,
    })

    return NextResponse.json({ announcement })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '保存公告失败' },
      { status: 400 },
    )
  }
}
