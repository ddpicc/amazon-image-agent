import type { Metadata } from 'next'
import '@/styles/globals.css'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'
import { getCurrentUser } from '@/lib/auth'
import { formatPoints, toDisplayPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'

const userNavLinks = [
  { href: '/', label: '首页' },
  { href: '/history', label: '我的历史' },
  { href: '/points', label: '积分中心' },
]

const adminNavLinks = [
  { href: '/admin', label: '工作台' },
  { href: '/admin/users', label: '用户' },
  { href: '/admin/points', label: '积分与充值' },
  { href: '/admin/operations', label: 'AI 操作' },
  { href: '/admin/image-records', label: '生图记录' },
  { href: '/admin/providers', label: 'Provider 管理' },
  { href: '/admin/redemption-codes', label: '兑换码' },
]

export const metadata: Metadata = {
  title: 'PageMint | Amazon Listing & A+ Image Workflow',
  description: 'Generate professional Amazon listing and A+ images using AI',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  const account = user ? await prisma.user.findUnique({
    where: { id: user.id },
    select: { pointsBalance: true },
  }) : null
  const isAdmin = user?.role === 'ADMIN'
  const homeHref = isAdmin ? '/admin' : '/'
  const navLinks = isAdmin ? adminNavLinks : userNavLinks

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-100">
        <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <Link href={homeHref} className="text-sm font-semibold tracking-[0.24em] text-slate-800 uppercase">
              PageMint
            </Link>
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  {navLinks.map((item) => (
                    <Link key={item.href} href={item.href} className="text-sm text-slate-600 transition hover:text-slate-900">
                      {item.label}
                    </Link>
                  ))}
                  <span className="hidden text-sm text-slate-500 md:inline">{formatPoints(toDisplayPoints(account?.pointsBalance ?? 0))} 积分</span>
                  <span className="hidden text-sm text-slate-500 sm:inline">{user.email}</span>
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
      </body>
    </html>
  )
}
