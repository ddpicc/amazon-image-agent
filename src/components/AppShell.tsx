'use client'

import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'
import { PointsProvider, usePoints } from '@/components/PointsProvider'
import { formatPoints } from '@/lib/points-config'

interface AppShellProps {
  children: React.ReactNode
  initialBalance: number // raw DB internal points
  isLoggedIn: boolean
  navLinks: Array<{ href: string; label: string }>
  homeHref: string
  userEmail?: string
}

function NavbarPointsDisplay() {
  const { pointsBalance } = usePoints()
  return (
    <span className="hidden text-sm text-slate-500 md:inline">
      {formatPoints(pointsBalance)} 积分
    </span>
  )
}

export default function AppShell({
  children,
  initialBalance,
  isLoggedIn,
  navLinks,
  homeHref,
  userEmail,
}: AppShellProps) {
  return (
    <PointsProvider initialBalance={initialBalance}>
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href={homeHref} className="text-sm font-semibold tracking-[0.24em] text-slate-800 uppercase">
            PageMint
          </Link>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <>
                {navLinks.map((item) => (
                  <Link key={item.href} href={item.href} className="text-sm text-slate-600 transition hover:text-slate-900">
                    {item.label}
                  </Link>
                ))}
                <NavbarPointsDisplay />
                <span className="hidden text-sm text-slate-500 sm:inline">{userEmail}</span>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm text-slate-600 transition hover:text-slate-900">
                  登录
                </Link>
                <Link href="/register" className="rounded-full bg-amazon-orange px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600">
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {children}
    </PointsProvider>
  )
}
