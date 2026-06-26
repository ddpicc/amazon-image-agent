import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

function normalizePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const page = normalizePositiveInt(request.nextUrl.searchParams.get('page'), 1)
  const requestedPageSize = normalizePositiveInt(request.nextUrl.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE)
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE)
  const total = await prisma.imageGenerationRequest.count()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)

  const records = await prisma.imageGenerationRequest.findMany({
    orderBy: { createdAt: 'desc' },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    include: {
      user: true,
    },
  })

  return NextResponse.json({
    records,
    pagination: {
      page: currentPage,
      pageSize,
      total,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPreviousPage: currentPage > 1,
    },
  })
}
