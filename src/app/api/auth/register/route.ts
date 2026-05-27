import { NextRequest, NextResponse } from 'next/server'
import { applySessionCookie, createSession, hashPassword } from '@/lib/auth'
import { generateReferralCode } from '@/lib/crypto'
import { grantRegistrationRewards } from '@/lib/points'
import { prisma } from '@/lib/prisma'

async function createUniqueReferralCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referralCode = generateReferralCode()
    const existingUser = await prisma.user.findUnique({
      where: { referralCode },
      select: { id: true },
    })

    if (!existingUser) {
      return referralCode
    }
  }

  throw new Error('Failed to generate referral code')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const referralCode = String(body.referralCode || body.aff || '').trim().toLowerCase()

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

    const inviter = referralCode
      ? await prisma.user.findUnique({
        where: { referralCode },
        select: { id: true },
      })
      : null

    if (referralCode && !inviter) {
      return NextResponse.json({ error: '邀请码无效' }, { status: 400 })
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        referralCode: await createUniqueReferralCode(),
        invitedByUserId: inviter?.id ?? null,
      },
    })

    const token = await createSession(user.id)
    await grantRegistrationRewards({ userId: user.id, inviterUserId: inviter?.id })
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
