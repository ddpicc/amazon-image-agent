import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { fetch1688Product } from '@/lib/1688-product'

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json() as { url?: unknown }
    if (typeof body.url !== 'string' || !body.url.trim()) {
      return NextResponse.json({ error: '请输入 1688 商品链接' }, { status: 400 })
    }

    const result = await fetch1688Product(body.url)
    return NextResponse.json({ result })
  } catch (error) {
    const message = error instanceof Error ? error.message : '1688 商品信息获取失败，请稍后重试'
    const status = message.includes('environment variable') ? 503 : 502
    console.error('[api/1688/product] lookup failed', {
      userId: user.id,
      message,
    })
    return NextResponse.json({ error: message }, { status })
  }
}
