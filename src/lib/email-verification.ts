import { prisma } from '@/lib/prisma'
import { generateEmailVerificationCode, hashEmailVerificationCode } from '@/lib/crypto'
import { sendRegistrationVerificationEmail } from '@/lib/email'

const REGISTER_CODE_EXPIRES_MINUTES = 5
const REGISTER_RESEND_COOLDOWN_SECONDS = 60

export function getRegisterCodeExpiresMinutes() {
  return REGISTER_CODE_EXPIRES_MINUTES
}

export function getRegisterResendCooldownSeconds() {
  return REGISTER_RESEND_COOLDOWN_SECONDS
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isValidVerificationCode(code: string) {
  return /^\d{6}$/.test(code.trim())
}

export async function sendRegisterVerificationCode(rawEmail: string) {
  const email = normalizeEmail(rawEmail)
  const now = new Date()

  const latestCode = await prisma.emailVerificationCode.findFirst({
    where: { email },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  if (latestCode) {
    const elapsedMs = now.getTime() - latestCode.createdAt.getTime()
    if (elapsedMs < REGISTER_RESEND_COOLDOWN_SECONDS * 1000) {
      const retryAfterSeconds = Math.ceil((REGISTER_RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000)
      return {
        ok: false as const,
        retryAfterSeconds,
      }
    }
  }

  const code = generateEmailVerificationCode()
  const verification = await prisma.$transaction(async (tx) => {
    await tx.emailVerificationCode.deleteMany({
      where: {
        email,
        consumedAt: null,
      },
    })

    return tx.emailVerificationCode.create({
      data: {
        email,
        codeHash: hashEmailVerificationCode(email, code),
        expiresAt: new Date(now.getTime() + REGISTER_CODE_EXPIRES_MINUTES * 60 * 1000),
      },
      select: {
        id: true,
      },
    })
  })

  try {
    await sendRegistrationVerificationEmail({
      email,
      code,
      expiresInMinutes: REGISTER_CODE_EXPIRES_MINUTES,
    })
  } catch (error) {
    await prisma.emailVerificationCode.delete({ where: { id: verification.id } }).catch(() => undefined)
    throw error
  }

  return {
    ok: true as const,
    retryAfterSeconds: REGISTER_RESEND_COOLDOWN_SECONDS,
  }
}

export async function consumeRegisterVerificationCode(rawEmail: string, rawCode: string) {
  const email = normalizeEmail(rawEmail)
  const code = rawCode.trim()
  const now = new Date()

  return prisma.emailVerificationCode.findFirst({
    where: {
      email,
      codeHash: hashEmailVerificationCode(email, code),
      consumedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })
}
