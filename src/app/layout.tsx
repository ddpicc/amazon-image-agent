import type { Metadata } from 'next'
import '@/styles/globals.css'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AppShell from '@/components/AppShell'

const userNavLinks = [
  { href: '/', label: '首页' },
  { href: '/history', label: '我的历史' },
  { href: '/points', label: '积分中心' },
  { href: '/notifications', label: '通知' },
]

export const metadata: Metadata = {
  title: 'PageMint | Amazon 商品图片工作台',
  description: '用 AI 高效完成 Amazon Listing 与 A+ 商品图片生产。',
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
  const navLinks = isAdmin ? [] : userNavLinks

  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-100">
        <AppShell
          initialBalance={account?.pointsBalance ?? 0}
          isLoggedIn={!!user}
          navLinks={navLinks}
          homeHref={homeHref}
          userEmail={user?.email}
          isAdmin={isAdmin}
        >
          {children}
        </AppShell>
      </body>
    </html>
  )
}
