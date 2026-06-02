'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { formatDateTimeInBeijing } from '@/lib/date'
import { formatPoints, getGenerationCostDisplay } from '@/lib/points-config'

interface PointsUser {
  id: string
  email: string
  referralCode: string
  pointsBalance: number
}

interface PointsPackageItem {
  id: string
  name: string
  points: number
  priceCents: number
  currency: string
  displayOrder: number
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
  updatedAt: string
}

interface PointsLedgerEntryItem {
  id: string
  type: 'REDEEM_CODE' | 'PAYMENT_RECHARGE' | 'GENERATION_DEBIT' | 'GENERATION_REFUND' | 'SIGNUP_BONUS' | 'REFERRAL_INVITEE_BONUS' | 'REFERRAL_INVITER_REWARD' | 'ADMIN_ADJUSTMENT'
  pointsDelta: number
  balanceAfter: number
  referenceType: string | null
  referenceId: string | null
  metadata?: unknown
  createdAt: string
}

interface PaymentPackageItem {
  id: string
  name: string
  points: number
  priceCents: number
  currency: string
  displayOrder: number
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
  updatedAt: string
}

interface PaymentOrderItem {
  id: string
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED'
  amountCents: number
  currency: string
  createdAt: string
  updatedAt: string
  paymentPackage: PaymentPackageItem
}

export interface PointsPageData {
  user: PointsUser
  packages: PointsPackageItem[]
  ledgerEntries: PointsLedgerEntryItem[]
  paymentOrders: PaymentOrderItem[]
}

function formatMoney(amountCents: number, currency: string) {
  if (currency === 'CNY') {
    return `¥${(amountCents / 100).toFixed(2)}`
  }

  return `${currency} ${(amountCents / 100).toFixed(2)}`
}

function formatLedgerType(entry: PointsLedgerEntryItem) {
  const { type } = entry
  const metadata = (entry.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata))
    ? entry.metadata as Record<string, unknown>
    : null
  const scene = metadata?.scene
  if (type === 'REDEEM_CODE') return '兑换码到账'
  if (type === 'PAYMENT_RECHARGE') return '支付充值'
  if (type === 'GENERATION_DEBIT') {
    if (scene === 'amazon') return 'Amazon 生图扣减'
    if (scene === 'aplus') return 'A+ 生图扣减'
    if (scene === 'reverse-prompt') return '同款生成扣减'
    if (scene === 'playground') return '自由生成扣减'
    return '生图扣减'
  }
  if (type === 'GENERATION_REFUND') return '失败退款'
  if (type === 'SIGNUP_BONUS') return '注册赠送'
  if (type === 'REFERRAL_INVITEE_BONUS') return '受邀注册赠送'
  if (type === 'REFERRAL_INVITER_REWARD') return '邀请好友奖励'
  return '后台调整'
}

export default function PointsPageClient({ initialData }: { initialData: PointsPageData }) {
  const [data, setData] = useState(initialData)
  const [code, setCode] = useState('')
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copiedInviteLink, setCopiedInviteLink] = useState(false)

  const sortedPackages = useMemo(
    () => [...data.packages].sort((a, b) => a.displayOrder - b.displayOrder),
    [data.packages],
  )
  const generationPricing = useMemo(() => ([
    { label: 'Amazon 图组', cost: getGenerationCostDisplay('amazon') },
    { label: 'A+ 图片', cost: getGenerationCostDisplay('aplus') },
    { label: '同款生成 / 以图生图', cost: getGenerationCostDisplay('reverse-prompt') },
    { label: '自由生成', cost: getGenerationCostDisplay('playground') },
  ]), [])
  const inviteLink = `https://amazon-image.zeabur.app/register?aff=${data.user.referralCode}`

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopiedInviteLink(true)
      window.setTimeout(() => setCopiedInviteLink(false), 1500)
    } catch {
      setError('复制邀请链接失败，请手动复制。')
    }
  }

  const handleRedeem = async () => {
    if (!code.trim()) return

    setIsRedeeming(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch('/api/points/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: code.trim() }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '兑换失败')
      }

      setData((prev) => ({
        ...prev,
        user: {
          ...prev.user,
          pointsBalance: payload.pointsBalance,
        },
        ledgerEntries: [
          {
            ...payload.ledgerEntry,
            createdAt: payload.ledgerEntry.createdAt,
          },
          ...prev.ledgerEntries,
        ].slice(0, 20),
      }))
      setCode('')
      setMessage('兑换成功，积分已到账。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '兑换失败')
    } finally {
      setIsRedeeming(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="space-y-6">
        <div className="panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-slate-500">当前账户</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">{formatPoints(data.user.pointsBalance)} 积分</div>
              <p className="mt-2 text-sm text-slate-500">账号：{data.user.email}</p>
              <p className="mt-1 text-sm text-slate-500">邀请码：{data.user.referralCode}</p>
            </div>
            <Link href="/points/recharge" className="rounded-full bg-amazon-orange px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600">
              直接充值
            </Link>
          </div>
        </div>

        <div className="panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">积分包</h2>
              <p className="mt-1 text-sm text-slate-500">选择套餐后可直接进入 ZPAY 支付入口，支付成功后系统自动入账积分。</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedPackages.length === 0 ? (
              <p className="text-sm text-slate-500">暂时还没有上架积分包。</p>
            ) : sortedPackages.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm text-slate-500">{item.name}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{formatPoints(item.points)} 积分</div>
                <div className="mt-1 text-sm text-slate-500">{formatMoney(item.priceCents, item.currency)}</div>
                <Link href={`/points/recharge?packageId=${item.id}`} className="mt-4 inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900">
                  去充值
                </Link>
              </article>
            ))}
          </div>
        </div>

        <div className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-950">最近积分流水</h2>
          <div className="mt-4 space-y-3">
            {data.ledgerEntries.length === 0 ? (
              <p className="text-sm text-slate-500">还没有积分流水。</p>
            ) : data.ledgerEntries.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">{formatLedgerType(entry)}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatDateTimeInBeijing(entry.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${entry.pointsDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {entry.pointsDelta >= 0 ? '+' : ''}{formatPoints(entry.pointsDelta)} 积分
                  </div>
                  <div className="mt-1 text-xs text-slate-500">余额 {formatPoints(entry.balanceAfter)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-950">生图扣费说明</h2>
          <p className="mt-1 text-sm text-slate-500">这里显示当前线上生效的单张扣费标准，页面文案和实际扣费共用同一套配置。</p>
          <div className="mt-4 space-y-3">
            {generationPricing.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm font-medium text-slate-900">{item.label}</div>
                <div className="mt-1 text-sm text-slate-500">每张扣 {formatPoints(item.cost)} 积分</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-950">邀请奖励</h2>
          <p className="mt-1 text-sm text-slate-500">被邀请用户注册可得 6 积分，邀请人可得 20 积分；未填写邀请码的新用户注册赠送 3 积分。</p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">邀请链接</div>
            <div className="mt-2 break-all text-sm text-slate-700">{inviteLink}</div>
            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="mt-4 inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              {copiedInviteLink ? '已复制' : '复制链接'}
            </button>
          </div>
        </div>

        <div className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-950">兑换码兑换</h2>
          <div className="mt-4 space-y-3">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="input-field"
              placeholder="请输入兑换码"
            />
            <button
              type="button"
              onClick={handleRedeem}
              disabled={isRedeeming || !code.trim()}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-amazon-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isRedeeming ? '兑换中...' : '立即兑换'}
            </button>
            {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
            {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          </div>
        </div>

        <div className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-950">最近充值订单</h2>
          <div className="mt-4 space-y-3">
            {data.paymentOrders.length === 0 ? (
              <p className="text-sm text-slate-500">还没有充值订单。</p>
            ) : data.paymentOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{order.paymentPackage.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatDateTimeInBeijing(order.createdAt)}</div>
                  </div>
                  <div className="text-right text-sm text-slate-700">
                    <div>{formatMoney(order.amountCents, order.currency)}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {order.status}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
