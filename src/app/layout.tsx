import type { Metadata } from 'next'
import '@/styles/globals.css'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'
import { getCurrentUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Amazon Image Agent - AI Product Image Generator',
  description: 'Generate professional Amazon product images using AI',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-100">
        <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <Link href="/" className="text-sm font-semibold tracking-[0.24em] text-slate-800 uppercase">
              Amazon Image Agent
            </Link>
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <Link href="/history" className="text-sm text-slate-600 transition hover:text-slate-900">
                    我的历史
                  </Link>
                  {user.role === 'ADMIN' && (
                    <Link href="/admin/image-records" className="text-sm text-slate-600 transition hover:text-slate-900">
                      管理记录
                    </Link>
                  )}
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
