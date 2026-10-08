import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { expireStaleReports, REPORT_SOURCES } from '@/lib/workflow-reports'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await expireStaleReports(user.id)
  const requested = Number(request.nextUrl.searchParams.get('page') || 1)
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1
  const where = { userId: user.id, sourcePage: { in: [...REPORT_SOURCES] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
  const [total, items] = await Promise.all([
    prisma.aiOperation.count({ where }),
    prisma.aiOperation.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 10, take: 10, select: { id: true, sourcePage: true, status: true, createdAt: true, errorMessage: true, outputSummaryJson: true } }),
  ])
  return NextResponse.json({ total, page, items })
}
