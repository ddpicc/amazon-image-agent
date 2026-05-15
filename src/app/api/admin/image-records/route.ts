import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const records = await prisma.imageGenerationRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: true,
      assets: true,
      attempts: {
        orderBy: { attemptIndex: 'asc' },
      },
    },
  })

  return NextResponse.json({ records })
}
