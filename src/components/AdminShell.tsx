'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'

type AdminNavIconName = 'overview' | 'users' | 'points' | 'codes' | 'models' | 'providers' | 'announcement' | 'operations' | 'images' | 'ledger'

interface AdminNavItem {
  href: string
  label: string
  icon: AdminNavIconName
}

const adminNavGroups: Array<{ label: string; items: AdminNavItem[] }> = [
  {
    label: '工作台',
    items: [
      { href: '/admin', label: '运营总览', icon: 'overview' },
    ],
  },
  {
    label: '用户与资金',
    items: [
      { href: '/admin/users', label: '用户管理', icon: 'users' },
      { href: '/admin/points', label: '积分与充值', icon: 'points' },
      { href: '/admin/redemption-codes', label: '兑换码', icon: 'codes' },
    ],
  },
  {
    label: 'AI 配置',
    items: [
      { href: '/admin/image-models', label: '生图模型', icon: 'models' },
      { href: '/admin/providers', label: 'Provider 管理', icon: 'providers' },
    ],
  },
  {
    label: '内容与记录',
    items: [
      { href: '/admin/points-ledger', label: '积分流水', icon: 'ledger' },
      { href: '/admin/announcement', label: '登录公告', icon: 'announcement' },
      { href: '/admin/operations', label: 'AI 操作记录', icon: 'operations' },
      { href: '/admin/image-records', label: '生图记录', icon: 'images' },
    ],
  },
]

function isNavItemActive(pathname: string, href: string) {
  return href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

function getCurrentPageLabel(pathname: string) {
  return adminNavGroups
    .flatMap((group) => group.items)
    .find((item) => isNavItemActive(pathname, item.href))?.label || '管理后台'
}

function AdminNavIcon({ name }: { name: AdminNavIconName }) {
  const paths: Record<AdminNavIconName, React.ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    points: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M16 12h4M2 10h20" /></>,
    codes: <><path d="M20 12a2 2 0 0 0 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 0-2 2Z" /><path d="M13 5v2M13 11v2M13 17v2" /></>,
    models: <><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" /><path d="m4 12 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5" /></>,
    providers: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-1.5-1H2v-4h.1A1.7 1.7 0 0 0 3.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
    announcement: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    operations: <><path d="M3 3v18h18" /><path d="m7 16 4-5 3 3 5-7" /></>,
    images: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    ledger: <><path d="M4 4h16v16H4z" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      {paths[name]}
    </svg>
  )
}

function AdminNavigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="管理员主菜单" className="space-y-6">
      {adminNavGroups.map((group) => (
        <div key={group.label}>
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {group.label}
          </div>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = isNavItemActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                    active
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <AdminNavIcon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

export default function AdminShell({ children, userEmail }: { children: React.ReactNode; userEmail?: string }) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const currentPageLabel = getCurrentPageLabel(pathname)

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  return (
    <div className="admin-shell min-h-screen bg-slate-50 lg:flex">
      <a href="#admin-main-content" className="sr-only z-[100] rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        跳到主要内容
      </a>

      <aside className="hidden h-screen w-64 shrink-0 flex-col bg-slate-950 px-4 py-5 lg:sticky lg:top-0 lg:flex">
        <Link href="/admin" className="mb-8 block rounded-xl px-3 py-2">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-white">PageMint</div>
          <div className="mt-1 text-xs text-slate-400">管理后台</div>
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <AdminNavigation pathname={pathname} />
        </div>
        <div className="mt-5 border-t border-slate-800 px-3 pt-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">当前管理员</div>
          <div className="mt-1 truncate text-sm text-slate-300" title={userEmail}>{userEmail || '管理员'}</div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                aria-expanded={mobileMenuOpen}
                aria-controls="admin-mobile-menu"
                aria-label={mobileMenuOpen ? '收起管理员菜单' : '展开管理员菜单'}
                className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-50 lg:hidden"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                  {mobileMenuOpen ? <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></> : <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>}
                </svg>
              </button>
              <Link href="/admin" className="shrink-0 text-sm font-semibold uppercase tracking-[0.2em] text-slate-950 lg:hidden">PageMint</Link>
              <div className="hidden h-5 w-px bg-slate-200 sm:block lg:hidden" />
              <div className="hidden truncate text-sm font-medium text-slate-700 sm:block">{currentPageLabel}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden max-w-56 truncate text-sm text-slate-500 md:inline" title={userEmail}>{userEmail}</span>
              <LogoutButton />
            </div>
          </div>

          {mobileMenuOpen && (
            <div id="admin-mobile-menu" className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-slate-200 bg-slate-950 px-4 py-5 lg:hidden">
              <AdminNavigation pathname={pathname} onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          )}
        </header>

        <div id="admin-main-content" tabIndex={-1} className="min-w-0 outline-none">
          {children}
        </div>
      </div>
    </div>
  )
}
