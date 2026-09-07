'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { formatDateTimeInBeijing } from '@/lib/date'
import { formatPoints } from '@/lib/points-config'

interface UserRow {
  id: string
  email: string
  invitedByEmail: string | null
  role: string
  createdAt: string
  pointsBalance: number
  totalRechargeAmountCents: number
  totalRechargePoints: number
  totalSpentPoints: number
  lastActiveAt: string | null
  imageRequestCount: number
  analysisCount: number
}

interface LedgerEntryRow {
  id: string
  userEmail: string
  type: string
  pointsDelta: number
  balanceAfter: number
  createdAt: string
}

interface PaginatedSection<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface AdminUsersPageData {
  users: PaginatedSection<UserRow>
  ledgerEntries: PaginatedSection<LedgerEntryRow>
}

type UsersSectionKey = 'users' | 'ledger'

function buildUsersQueryString(searchParams: URLSearchParams, updates: Partial<Record<'usersPage' | 'ledgerPage', number>>) {
  const params = new URLSearchParams(searchParams.toString())

  for (const [key, value] of Object.entries(updates) as Array<[keyof typeof updates, number | undefined]>) {
    if (!value || value <= 1) {
      params.delete(key)
    } else {
      params.set(key, String(value))
    }
  }

  return params.toString()
}

function formatMoney(amountCents: number) {
  return `¥${(amountCents / 100).toFixed(2)}`
}

export default function AdminUsersPageClient({ initialData }: { initialData: AdminUsersPageData }) {
  const [data, setData] = useState<AdminUsersPageData>(initialData)
  const [isNavigatingSection, setIsNavigatingSection] = useState<UsersSectionKey | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function navigateWithPages(section: UsersSectionKey, nextPage: number) {
    setIsNavigatingSection(section)

    const query = buildUsersQueryString(searchParams, section === 'users'
      ? { usersPage: nextPage }
      : { ledgerPage: nextPage })

    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">管理员</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">用户总览</h1>
            <p className="mt-2 text-sm text-slate-500">查看每个用户的余额、充值、消耗与最近活跃情况；充值和消耗积分统一按新积分口径统计。</p>
          </div>
          <Link href="/admin" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
            返回工作台
          </Link>
        </div>

        <section className="panel p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">用户总览</h2>
              <p className="mt-1 text-sm text-slate-500">总充值积分、总消耗积分和当前余额均按新积分口径显示；历史流水保留原始记录。</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              共 {data.users.total} 人
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-3 pr-4">邮箱</th>
                  <th className="pb-3 pr-4">邀请人</th>
                  <th className="pb-3 pr-4">角色</th>
                  <th className="pb-3 pr-4">注册时间</th>
                  <th className="pb-3 pr-4">当前余额</th>
                  <th className="pb-3 pr-4">总充值金额</th>
                  <th className="pb-3 pr-4">总充值积分（新）</th>
                  <th className="pb-3 pr-4">总消耗积分（新）</th>
                  <th className="pb-3 pr-4">最近活跃</th>
                  <th className="pb-3 pr-4">生图次数</th>
                  <th className="pb-3">分析次数</th>
                </tr>
              </thead>
              <tbody>
                {data.users.items.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-slate-500">暂无用户数据。</td>
                  </tr>
                ) : data.users.items.map((user) => (
                  <tr key={user.id} className="border-t border-slate-200 align-top">
                    <td className="py-4 pr-4 text-slate-700">{user.email}</td>
                    <td className="py-4 pr-4 text-slate-700">{user.invitedByEmail ?? '-'}</td>
                    <td className="py-4 pr-4 text-slate-700">{user.role}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatDateTimeInBeijing(user.createdAt)}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatPoints(user.pointsBalance)}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatMoney(user.totalRechargeAmountCents)}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatPoints(user.totalRechargePoints)}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatPoints(user.totalSpentPoints)}</td>
                    <td className="py-4 pr-4 text-slate-700">{user.lastActiveAt ? formatDateTimeInBeijing(user.lastActiveAt) : '-'}</td>
                    <td className="py-4 pr-4 text-slate-700">{user.imageRequestCount}</td>
                    <td className="py-4 text-slate-700">{user.analysisCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.users.total > 0 && (
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                第 {data.users.page} / {data.users.totalPages} 页
                {isNavigatingSection === 'users' && <span className="ml-2 text-slate-400">加载中...</span>}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigateWithPages('users', data.users.page - 1)}
                  disabled={!data.users.hasPreviousPage || isNavigatingSection !== null}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => navigateWithPages('users', data.users.page + 1)}
                  disabled={!data.users.hasNextPage || isNavigatingSection !== null}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="panel p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">积分流水</h2>
              <p className="mt-1 text-sm text-slate-500">近 7 天积分变动记录，包含充值、消耗、兑换、退款等所有类型。</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              共 {data.ledgerEntries.total} 条
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-3 pr-4">用户</th>
                  <th className="pb-3 pr-4">类型</th>
                  <th className="pb-3 pr-4">变动</th>
                  <th className="pb-3 pr-4">余额</th>
                  <th className="pb-3">时间</th>
                </tr>
              </thead>
              <tbody>
                {data.ledgerEntries.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">暂无积分流水。</td>
                  </tr>
                ) : data.ledgerEntries.items.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-200">
                    <td className="py-4 pr-4 text-slate-700">{entry.userEmail}</td>
                    <td className="py-4 pr-4 text-slate-700">{entry.type}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatPoints(entry.pointsDelta)}</td>
                    <td className="py-4 pr-4 text-slate-700">{formatPoints(entry.balanceAfter)}</td>
                    <td className="py-4 text-slate-700">{formatDateTimeInBeijing(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.ledgerEntries.total > 0 && (
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                第 {data.ledgerEntries.page} / {data.ledgerEntries.totalPages} 页
                {isNavigatingSection === 'ledger' && <span className="ml-2 text-slate-400">加载中...</span>}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigateWithPages('ledger', data.ledgerEntries.page - 1)}
                  disabled={!data.ledgerEntries.hasPreviousPage || isNavigatingSection !== null}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => navigateWithPages('ledger', data.ledgerEntries.page + 1)}
                  disabled={!data.ledgerEntries.hasNextPage || isNavigatingSection !== null}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
