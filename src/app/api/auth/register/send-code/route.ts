import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeEmail, sendRegisterVerificationCode } from '@/lib/email-verification'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = normalizeEmail(String(body.email || ''))

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })

    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const result = await sendRegisterVerificationCode(email)
    if (!result.ok) {
      return NextResponse.json(
        {
          error: `发送过于频繁，请在 ${result.retryAfterSeconds} 秒后重试`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(result.retryAfterSeconds),
          },
        },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[auth/register/send-code] failed', error)
    return NextResponse.json({ error: 'Failed to send verification code' }, { status: 500 })
  }
}
