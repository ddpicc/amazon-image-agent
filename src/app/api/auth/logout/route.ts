import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie, invalidateSession, SESSION_COOKIE_NAME } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
    if (token) {
      await invalidateSession(token)
    }

    const response = NextResponse.json({ ok: true })
    clearSessionCookie(response)
    return response
  } catch (error) {
    console.error('[auth/logout] failed', error)
    return NextResponse.json({ error: 'Failed to logout' }, { status: 500 })
  }
}
