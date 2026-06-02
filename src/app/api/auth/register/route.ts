import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { applySessionCookie, createSession, hashPassword } from '@/lib/auth'
import { generateReferralCode, hashEmailVerificationCode } from '@/lib/crypto'
import { isValidVerificationCode, normalizeEmail } from '@/lib/email-verification'
import { grantRegistrationRewards } from '@/lib/points'
import { prisma } from '@/lib/prisma'

async function createUniqueReferralCode(tx: Prisma.TransactionClient) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referralCode = generateReferralCode()
    const existingUser = await tx.user.findUnique({
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
    const email = normalizeEmail(String(body.email || ''))
    const password = String(body.password || '')
    const verificationCode = String(body.verificationCode || '').trim()
    const referralCode = String(body.referralCode || body.aff || '').trim().toLowerCase()

    if (!email || !password || !verificationCode) {
      return NextResponse.json({ error: 'Email, password and verification code are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    if (!isValidVerificationCode(verificationCode)) {
      return NextResponse.json({ error: '验证码必须为 6 位数字' }, { status: 400 })
    }

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const verification = await prisma.emailVerificationCode.findFirst({
      where: {
        email,
        codeHash: hashEmailVerificationCode(email, verificationCode),
        consumedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
      },
    })

    if (!verification) {
      return NextResponse.json({ error: '验证码错误或已过期' }, { status: 400 })
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

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          passwordHash: await hashPassword(password),
          referralCode: await createUniqueReferralCode(tx),
          invitedByUserId: inviter?.id ?? null,
        },
      })

      await tx.emailVerificationCode.update({
        where: { id: verification.id },
        data: { consumedAt: new Date() },
      })

      return createdUser
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
