import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createImageProvider } from '@/lib/image-providers'

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const provider = await createImageProvider({
      name: typeof body.name === 'string' ? body.name : '',
      vendor: typeof body.vendor === 'string' ? body.vendor : '',
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : '',
      model: typeof body.model === 'string' ? body.model : '',
      priority: Number(body.priority),
      enabled: Boolean(body.enabled),
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : '',
    })

    return NextResponse.json({
      id: provider.id,
      name: provider.name,
      priority: provider.priority,
      enabled: provider.enabled,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建 provider 失败'
    const status = message.includes('Unique constraint') ? 400 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
