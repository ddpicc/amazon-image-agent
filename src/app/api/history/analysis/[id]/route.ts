import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface RouteContext {
  params: {
    id: string
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await requireApiUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const record = await prisma.analysisRecord.findFirst({
    where: {
      id: context.params.id,
      userId: user.id,
    },
    select: {
      id: true,
      status: true,
    },
  })

  if (!record) {
    return NextResponse.json({ error: '分析记录不存在' }, { status: 404 })
  }

  if (record.status === 'STARTED') {
    return NextResponse.json({ error: '进行中的分析暂不支持删除' }, { status: 409 })
  }

  await prisma.analysisRecord.delete({
    where: { id: record.id },
  })

  return NextResponse.json({ ok: true })
}
