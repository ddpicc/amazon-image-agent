import { NextRequest, NextResponse } from 'next/server'
import { applySessionCookie, createSession, hashPassword } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
      },
    })

    const token = await createSession(user.id)
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    })
    applySessionCookie(response, token)
    return response
  } catch (error) {
    console.error('[auth/register] failed', error)
    return NextResponse.json({ error: 'Failed to register' }, { status: 500 })
  }
}
