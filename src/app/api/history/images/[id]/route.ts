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

  const record = await prisma.imageGenerationRequest.findFirst({
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
    return NextResponse.json({ error: '生图记录不存在' }, { status: 404 })
  }

  if (record.status === 'STARTED' || record.status === 'QUEUED' || record.status === 'PROCESSING') {
    return NextResponse.json({ error: '任务仍在执行，暂不支持删除' }, { status: 409 })
  }

  await prisma.imageGenerationRequest.delete({
    where: { id: record.id },
  })

  return NextResponse.json({ ok: true })
}
