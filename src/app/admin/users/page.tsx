import AdminUsersPageClient, { type AdminUsersPageData } from './AdminUsersPageClient'
import { requireAdmin } from '@/lib/auth'
import { toDisplayPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'

const USERS_PAGE_SIZE = 20
const LEDGER_PAGE_SIZE = 20

interface AdminUsersPageProps {
  searchParams?: {
    usersPage?: string
    ledgerPage?: string
  }
}

function normalizePage(value?: string) {
  const parsed = Number.parseInt(value || '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  await requireAdmin()

  const requestedUsersPage = normalizePage(searchParams?.usersPage)
  const requestedLedgerPage = normalizePage(searchParams?.ledgerPage)

  // --- Users section ---
  const usersTotal = await prisma.user.count()
  const usersTotalPages = Math.max(1, Math.ceil(usersTotal / USERS_PAGE_SIZE))
  const currentUsersPage = Math.min(requestedUsersPage, usersTotalPages)
  const usersSkip = (currentUsersPage - 1) * USERS_PAGE_SIZE

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    skip: usersSkip,
    take: USERS_PAGE_SIZE,
    select: {
      id: true,
      email: true,
      role: true,
      pointsBalance: true,
      createdAt: true,
      invitedBy: {
        select: { email: true },
      },
      _count: {
        select: {
          imageGenerationRequests: true,
          analysisRecords: true,
        },
      },
    },
  })

  // Fetch related data for current page users only
  const userIds = users.map((u) => u.id)
  const [userPaymentOrders, userLedgerDebits] = await Promise.all([
    prisma.paymentOrder.findMany({
      where: { userId: { in: userIds }, status: 'PAID' },
      select: {
        userId: true,
        amountCents: true,
        paidAt: true,
        paymentPackage: { select: { points: true } },
      },
    }),
    prisma.pointsLedgerEntry.findMany({
      where: { userId: { in: userIds }, type: 'GENERATION_DEBIT' },
      select: {
        userId: true,
        pointsDelta: true,
        createdAt: true,
      },
    }),
  ])

  // Group related data by userId
  const paymentOrdersByUser = new Map<string, typeof userPaymentOrders>()
  const ledgerDebitsByUser = new Map<string, typeof userLedgerDebits>()

  for (const order of userPaymentOrders) {
    const list = paymentOrdersByUser.get(order.userId) || []
    list.push(order)
    paymentOrdersByUser.set(order.userId, list)
  }

  for (const entry of userLedgerDebits) {
    const list = ledgerDebitsByUser.get(entry.userId) || []
    list.push(entry)
    ledgerDebitsByUser.set(entry.userId, list)
  }

  // --- Ledger entries section ---
  const ledgerTotal = await prisma.pointsLedgerEntry.count()
  const ledgerTotalPages = Math.max(1, Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE))
  const currentLedgerPage = Math.min(requestedLedgerPage, ledgerTotalPages)
  const ledgerSkip = (currentLedgerPage - 1) * LEDGER_PAGE_SIZE

  const ledgerEntries = await prisma.pointsLedgerEntry.findMany({
    orderBy: { createdAt: 'desc' },
    skip: ledgerSkip,
    take: LEDGER_PAGE_SIZE,
    include: {
      user: { select: { email: true } },
    },
  })

  // --- Serialize data for client ---
  type PaymentOrderAgg = (typeof userPaymentOrders)[number]
  type LedgerDebitAgg = (typeof userLedgerDebits)[number]
  type UserItem = (typeof users)[number]
  type LedgerItem = (typeof ledgerEntries)[number]

  const initialData: AdminUsersPageData = {
    users: {
      items: users.map((user: UserItem) => {
        const orders = paymentOrdersByUser.get(user.id) || []
        const debits = ledgerDebitsByUser.get(user.id) || []

        const totalRechargeAmountCents = orders.reduce((sum: number, o: PaymentOrderAgg) => sum + o.amountCents, 0)
        const totalRechargePoints = orders.reduce((sum: number, o: PaymentOrderAgg) => sum + o.paymentPackage.points, 0)
        const totalSpentPoints = Math.abs(debits.reduce((sum: number, e: LedgerDebitAgg) => sum + e.pointsDelta, 0))

        const lastRechargeAt = orders[0]?.paidAt ?? null
        const lastSpendAt = debits[0]?.createdAt ?? null
        const lastActiveAt = [lastRechargeAt, lastSpendAt, user.createdAt]
          .filter((value): value is Date => value instanceof Date)
          .sort((a, b) => b.getTime() - a.getTime())[0]

        return {
          id: user.id,
          email: user.email,
          invitedByEmail: user.invitedBy?.email ?? null,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
          pointsBalance: toDisplayPoints(user.pointsBalance),
          totalRechargeAmountCents,
          totalRechargePoints: toDisplayPoints(totalRechargePoints),
          totalSpentPoints: toDisplayPoints(totalSpentPoints),
          lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
          imageRequestCount: user._count.imageGenerationRequests,
          analysisCount: user._count.analysisRecords,
        }
      }),
      page: currentUsersPage,
      pageSize: USERS_PAGE_SIZE,
      total: usersTotal,
      totalPages: usersTotalPages,
      hasNextPage: currentUsersPage < usersTotalPages,
      hasPreviousPage: currentUsersPage > 1,
    },
    ledgerEntries: {
      items: ledgerEntries.map((entry: LedgerItem) => ({
        id: entry.id,
        userEmail: entry.user.email,
        type: entry.type,
        pointsDelta: toDisplayPoints(entry.pointsDelta),
        balanceAfter: toDisplayPoints(entry.balanceAfter),
        createdAt: entry.createdAt.toISOString(),
      })),
      page: currentLedgerPage,
      pageSize: LEDGER_PAGE_SIZE,
      total: ledgerTotal,
      totalPages: ledgerTotalPages,
      hasNextPage: currentLedgerPage < ledgerTotalPages,
      hasPreviousPage: currentLedgerPage > 1,
    },
  }

  return <AdminUsersPageClient initialData={initialData} />
}
