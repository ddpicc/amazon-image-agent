import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextRequest, NextResponse } from 'next/server'
import { generateOpaqueToken, hashOpaqueToken } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

export const SESSION_COOKIE_NAME = 'amazon_image_agent_session'
const SESSION_TTL_DAYS = 30

export interface AuthUser {
  id: string
  email: string
  role: 'ADMIN' | 'USER'
}

function getDefaultAppPathForRole(role: AuthUser['role']) {
  return role === 'ADMIN' ? '/admin' : '/'
}

export function getDefaultAppPathForUser(user: Pick<AuthUser, 'role'>) {
  return getDefaultAppPathForRole(user.role)
}

function getSessionExpiryDate(): Date {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS)
  return expiresAt
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createSession(userId: string): Promise<string> {
  const token = generateOpaqueToken()
  const tokenHash = hashOpaqueToken(token)
  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: getSessionExpiryDate(),
    },
  })
  return token
}

export async function invalidateSession(token: string): Promise<void> {
  await prisma.session.deleteMany({
    where: {
      tokenHash: hashOpaqueToken(token),
    },
  })
}

async function getCurrentUserFromSessionToken(token?: string | null): Promise<AuthUser | null> {
  if (!token) return null

  let session
  try {
    session = await prisma.session.findUnique({
      where: {
        tokenHash: hashOpaqueToken(token),
      },
      include: {
        user: true,
      },
    })
  } catch (error) {
    console.error('[auth] failed to load session', {
      error: error instanceof Error ? error.message : error,
    })
    return null
  }

  if (!session) return null
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }

  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value
  return getCurrentUserFromSessionToken(token)
}

async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }
  return user
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser()
  if (user.role !== 'ADMIN') {
    redirect('/')
  }
  return user
}

export async function requireNonAdminUser(): Promise<AuthUser> {
  const user = await requireUser()
  if (user.role === 'ADMIN') {
    redirect('/admin')
  }
  return user
}

export async function requireApiUser(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  return getCurrentUserFromSessionToken(token)
}

export function applySessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: getSessionExpiryDate(),
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  })
}
