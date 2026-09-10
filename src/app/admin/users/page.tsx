import AdminUsersPageClient, { type AdminUsersPageData } from './AdminUsersPageClient'
import { requireAdmin } from '@/lib/auth'
import { toCurrentDisplayPoints, toDisplayPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'

const USERS_PAGE_SIZE = 20

interface AdminUsersPageProps {
  searchParams?: {
    usersPage?: string
  }
}

function normalizePage(value?: string) {
  const parsed = Number.parseInt(value || '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  await requireAdmin()

  const requestedUsersPage = normalizePage(searchParams?.usersPage)

  // --- Users section ---
  const usersTotal = await prisma.user.count()
  const usersTotalPages = Math.max(1, Math.ceil(usersTotal / USERS_PAGE_SIZE))
  const currentUsersPage = Math.min(requestedUsersPage, usersTotalPages)
  const usersSkip = (currentUsersPage - 1) * USERS_PAGE_SIZE
  const activeUserRows = await prisma.$queryRaw<Array<{ id: string; lastActiveAt: Date }>>`
    SELECT
      u.id,
      GREATEST(
        u."createdAt",
        COALESCE(s."lastSessionAt", u."createdAt"),
        COALESCE(po."lastPaidAt", u."createdAt"),
        COALESCE(ple."lastLedgerAt", u."createdAt"),
        COALESCE(igr."lastImageAt", u."createdAt"),
        COALESCE(ar."lastAnalysisAt", u."createdAt")
      ) AS "lastActiveAt"
    FROM "User" u
    LEFT JOIN LATERAL (
      SELECT MAX("updatedAt") AS "lastSessionAt"
      FROM "Session"
      WHERE "userId" = u.id
    ) s ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX("paidAt") AS "lastPaidAt"
      FROM "PaymentOrder"
      WHERE "userId" = u.id
    ) po ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX("createdAt") AS "lastLedgerAt"
      FROM "PointsLedgerEntry"
      WHERE "userId" = u.id
        AND ("referenceType" IS NULL OR "referenceType" <> 'points_conversion')
    ) ple ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX("createdAt") AS "lastImageAt"
      FROM "ImageGenerationRequest"
      WHERE "userId" = u.id
    ) igr ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX("createdAt") AS "lastAnalysisAt"
      FROM "AnalysisRecord"
      WHERE "userId" = u.id
    ) ar ON TRUE
    ORDER BY "lastActiveAt" DESC, u."createdAt" DESC
    LIMIT ${USERS_PAGE_SIZE}
    OFFSET ${usersSkip}
  `
  const activeUserIds = activeUserRows.map((row) => row.id)
  const lastActiveAtByUser = new Map(activeUserRows.map((row) => [row.id, row.lastActiveAt]))

  const users = await prisma.user.findMany({
    where: { id: { in: activeUserIds } },
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
  const userOrder = new Map(activeUserIds.map((id, index) => [id, index]))
  users.sort((a, b) => (userOrder.get(a.id) ?? 0) - (userOrder.get(b.id) ?? 0))

  // Fetch related data for current page users only
  const userIds = users.map((u) => u.id)
  const [userPaymentOrders, userLedgerDebits] = await Promise.all([
    prisma.paymentOrder.findMany({
      where: { userId: { in: userIds }, status: 'PAID' },
      select: {
        userId: true,
        amountCents: true,
        paidAt: true,
      },
      orderBy: [
        { paidAt: 'desc' },
        { createdAt: 'desc' },
      ],
    }),
    prisma.pointsLedgerEntry.findMany({
      where: { userId: { in: userIds }, type: 'GENERATION_DEBIT' },
      select: {
        userId: true,
        pointsDelta: true,
        metadata: true,
        referenceType: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
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

  // --- Serialize data for client ---
  type PaymentOrderAgg = (typeof userPaymentOrders)[number]
  type LedgerDebitAgg = (typeof userLedgerDebits)[number]
  type UserItem = (typeof users)[number]

  const initialData: AdminUsersPageData = {
    users: {
      items: users.map((user: UserItem) => {
        const orders = paymentOrdersByUser.get(user.id) || []
        const debits = ledgerDebitsByUser.get(user.id) || []

        const totalRechargeAmountCents = orders.reduce((sum: number, o: PaymentOrderAgg) => sum + o.amountCents, 0)
        const totalSpentPoints = Math.abs(debits.reduce(
          (sum: number, e: LedgerDebitAgg) => sum + toCurrentDisplayPoints(e.pointsDelta, e.metadata, e.referenceType),
          0,
        ))

        const lastActiveAt = lastActiveAtByUser.get(user.id) ?? user.createdAt

        return {
          id: user.id,
          email: user.email,
          invitedByEmail: user.invitedBy?.email ?? null,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
          pointsBalance: toDisplayPoints(user.pointsBalance),
          totalRechargeAmountCents,
          totalSpentPoints,
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
  }

  return <AdminUsersPageClient initialData={initialData} />
}
