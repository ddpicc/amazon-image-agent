'use client'

import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'
import { PointsProvider, usePoints } from '@/components/PointsProvider'
import SiteFooter from '@/components/SiteFooter'
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
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href={homeHref} className="shrink-0 text-sm font-semibold tracking-[0.24em] text-slate-900 uppercase">
            PageMint
          </Link>
          <div className="flex items-center justify-end gap-3 sm:gap-4">
            {isLoggedIn ? (
              <>
                {navLinks.map((item) => (
                  <Link key={item.href} href={item.href} className="hidden text-sm text-slate-600 transition-colors hover:text-slate-950 md:inline">
                    {item.label}
                  </Link>
                ))}
                <NavbarPointsDisplay />
                <span className="hidden text-sm text-slate-500 sm:inline">{userEmail}</span>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm text-slate-600 transition-colors hover:text-slate-950">
                  登录
                </Link>
                <Link href="/register" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700">
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {children}
      <SiteFooter />
    </PointsProvider>
  )
}
