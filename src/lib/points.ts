import { PaymentOrderStatus, PointsLedgerType, PointsPackageStatus, RedemptionCodeStatus, Prisma } from '@prisma/client'
import { hashRedemptionCode } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'
import type { ZPayPayType } from '@/lib/payments/zpay'

export class InsufficientPointsError extends Error {
  constructor() {
    super('积分不足，请先充值或兑换积分包。')
    this.name = 'InsufficientPointsError'
  }
}

function toNullableJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return Prisma.JsonNull
  }

  return value as Prisma.InputJsonValue
}

export async function listActivePointsPackages() {
  return prisma.pointsPackage.findMany({
    where: { status: PointsPackageStatus.ACTIVE },
    orderBy: [
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  })
}

export async function getPointsSummary(userId: string) {
  const [user, packages, ledgerEntries, paymentOrders] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        pointsBalance: true,
      },
    }),
    listActivePointsPackages(),
    prisma.pointsLedgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.paymentOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        amountCents: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
        paymentPackage: true,
      },
    }),
  ])

  return {
    user,
    packages,
    ledgerEntries,
    paymentOrders,
  }
}

export async function createPaymentOrder(params: { userId: string; packageId: string }) {
  const pkg = await prisma.pointsPackage.findFirst({
    where: {
      id: params.packageId,
      status: PointsPackageStatus.ACTIVE,
    },
  })

  if (!pkg) {
    throw new Error('积分包不存在或已下架')
  }

  return prisma.paymentOrder.create({
    data: {
      userId: params.userId,
      packageId: pkg.id,
      amountCents: pkg.priceCents,
      currency: pkg.currency,
      status: PaymentOrderStatus.PENDING,
      metadata: {
        packageName: pkg.name,
        points: pkg.points,
      },
    },
    include: {
      paymentPackage: true,
    },
  })
}

export async function createPendingPaymentOrder(params: {
  userId: string
  packageId: string
  outTradeNo: string
  payType: ZPayPayType
  provider: string
}) {
  const pkg = await prisma.pointsPackage.findFirst({
    where: {
      id: params.packageId,
      status: PointsPackageStatus.ACTIVE,
    },
  })

  if (!pkg) {
    throw new Error('积分包不存在或已下架')
  }

  return prisma.paymentOrder.create({
    data: {
      userId: params.userId,
      packageId: pkg.id,
      outTradeNo: params.outTradeNo,
      payType: params.payType,
      provider: params.provider,
      amountCents: pkg.priceCents,
      currency: pkg.currency,
      status: PaymentOrderStatus.PENDING,
      metadata: {
        packageName: pkg.name,
        points: pkg.points,
      },
    },
    include: {
      paymentPackage: true,
    },
  })
}

export async function updatePaymentOrderAfterCreate(params: {
  outTradeNo: string
  status: PaymentOrderStatus
  providerOrderId?: string | null
  payUrl?: string
  payUrl2?: string
  qrcodeUrl?: string
  qrcodeImg?: string
  metadata?: unknown
}) {
  return prisma.paymentOrder.update({
    where: { outTradeNo: params.outTradeNo },
    data: {
      status: params.status,
      providerOrderId: params.providerOrderId ?? null,
      payUrl: params.payUrl ?? '',
      payUrl2: params.payUrl2 ?? '',
      qrcodeUrl: params.qrcodeUrl ?? '',
      qrcodeImg: params.qrcodeImg ?? '',
      metadata: toNullableJsonValue(params.metadata),
    },
    include: {
      paymentPackage: true,
    },
  })
}

export async function getPaymentOrderForUser(params: { userId: string; outTradeNo: string }) {
  return prisma.paymentOrder.findFirst({
    where: {
      userId: params.userId,
      outTradeNo: params.outTradeNo,
    },
    include: {
      paymentPackage: true,
    },
  })
}

export async function getPaymentOrderByOutTradeNo(outTradeNo: string) {
  return prisma.paymentOrder.findUnique({
    where: { outTradeNo },
    include: {
      paymentPackage: true,
    },
  })
}

export async function applyPaymentOrderSuccess(params: {
  outTradeNo: string
  providerOrderId?: string | null
  paidAmountCents: number
  notifyPayload?: unknown
  paidAt?: Date
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.paymentOrder.findUnique({
      where: { outTradeNo: params.outTradeNo },
      include: {
        paymentPackage: true,
      },
    })

    if (!order) {
      throw new Error('订单不存在')
    }

    if (order.amountCents !== params.paidAmountCents) {
      throw new Error('支付金额与订单金额不一致')
    }

    const idempotencyKey = `payment:${order.id}`
    const existingEntry = await tx.pointsLedgerEntry.findUnique({
      where: { idempotencyKey },
    })

    const effectivePaidAt = params.paidAt ?? new Date()

    if (existingEntry) {
      if (order.status !== PaymentOrderStatus.PAID) {
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: {
            status: PaymentOrderStatus.PAID,
            providerOrderId: params.providerOrderId ?? order.providerOrderId,
            notifyPayload: toNullableJsonValue(
              params.notifyPayload === undefined ? order.notifyPayload : params.notifyPayload,
            ),
            paidAt: order.paidAt ?? effectivePaidAt,
          },
        })
      }

      return existingEntry
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: order.userId },
      select: { pointsBalance: true },
    })

    const nextBalance = user.pointsBalance + order.paymentPackage.points

    const ledgerEntry = await tx.pointsLedgerEntry.create({
      data: {
        userId: order.userId,
        type: PointsLedgerType.PAYMENT_RECHARGE,
        pointsDelta: order.paymentPackage.points,
        balanceAfter: nextBalance,
        idempotencyKey,
        referenceType: 'payment_order',
        referenceId: order.id,
        metadata: {
          outTradeNo: order.outTradeNo,
          packageId: order.packageId,
          packageName: order.paymentPackage.name,
          amountCents: order.amountCents,
        },
      },
    })

    await tx.user.update({
      where: { id: order.userId },
      data: { pointsBalance: nextBalance },
    })

    await tx.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: PaymentOrderStatus.PAID,
        providerOrderId: params.providerOrderId ?? order.providerOrderId,
        notifyPayload: toNullableJsonValue(
          params.notifyPayload === undefined ? order.notifyPayload : params.notifyPayload,
        ),
        paidAt: effectivePaidAt,
      },
    })

    return ledgerEntry
  })
}

export async function redeemCode(params: { userId: string; code: string }) {
  const codeHash = hashRedemptionCode(params.code)
  const now = new Date()

  return prisma.$transaction(async (tx) => {
    const redemptionCode = await tx.redemptionCode.findUnique({
      where: { codeHash },
    })

    if (!redemptionCode) {
      throw new Error('兑换码无效')
    }

    if (redemptionCode.status !== RedemptionCodeStatus.ACTIVE) {
      throw new Error('兑换码不可用')
    }

    if (redemptionCode.expiresAt && redemptionCode.expiresAt.getTime() <= now.getTime()) {
      throw new Error('兑换码已过期')
    }

    const idempotencyKey = `redeem:${redemptionCode.id}`
    const existingEntry = await tx.pointsLedgerEntry.findUnique({
      where: { idempotencyKey },
    })

    if (existingEntry) {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: params.userId },
        select: { pointsBalance: true },
      })

      return {
        ledgerEntry: existingEntry,
        pointsBalance: user.pointsBalance,
      }
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: params.userId },
      select: { pointsBalance: true },
    })

    const nextBalance = user.pointsBalance + redemptionCode.points

    const ledgerEntry = await tx.pointsLedgerEntry.create({
      data: {
        userId: params.userId,
        type: PointsLedgerType.REDEEM_CODE,
        pointsDelta: redemptionCode.points,
        balanceAfter: nextBalance,
        idempotencyKey,
        referenceType: 'redemption_code',
        referenceId: redemptionCode.id,
        metadata: {
          batchId: redemptionCode.batchId,
          packageId: redemptionCode.packageId,
        },
      },
    })

    await tx.user.update({
      where: { id: params.userId },
      data: { pointsBalance: nextBalance },
    })

    await tx.redemptionCode.update({
      where: { id: redemptionCode.id },
      data: {
        status: RedemptionCodeStatus.REDEEMED,
        redeemedAt: now,
        redeemedByUserId: params.userId,
      },
    })

    return {
      ledgerEntry,
      pointsBalance: nextBalance,
    }
  })
}

export async function debitPointForGeneration(params: { userId: string; requestId: string }) {
  return prisma.$transaction(async (tx) => {
    const idempotencyKey = `generation:${params.requestId}:debit`
    const existingEntry = await tx.pointsLedgerEntry.findUnique({
      where: { idempotencyKey },
    })

    if (existingEntry) {
      return existingEntry
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: params.userId },
      select: { pointsBalance: true },
    })

    if (user.pointsBalance < 1) {
      throw new InsufficientPointsError()
    }

    const nextBalance = user.pointsBalance - 1

    await tx.user.update({
      where: { id: params.userId },
      data: { pointsBalance: nextBalance },
    })

    const ledgerEntry = await tx.pointsLedgerEntry.create({
      data: {
        userId: params.userId,
        type: PointsLedgerType.GENERATION_DEBIT,
        pointsDelta: -1,
        balanceAfter: nextBalance,
        idempotencyKey,
        referenceType: 'image_generation_request',
        referenceId: params.requestId,
      },
    })

    await tx.imageGenerationRequest.update({
      where: { id: params.requestId },
      data: { pointsLedgerEntryId: ledgerEntry.id },
    })

    return ledgerEntry
  })
}

export async function refundPointForFailedGeneration(params: { userId: string; requestId: string }) {
  return prisma.$transaction(async (tx) => {
    const refundKey = `generation:${params.requestId}:refund`
    const existingRefund = await tx.pointsLedgerEntry.findUnique({
      where: { idempotencyKey: refundKey },
    })

    if (existingRefund) {
      return existingRefund
    }

    const debitEntry = await tx.pointsLedgerEntry.findUnique({
      where: { idempotencyKey: `generation:${params.requestId}:debit` },
    })

    if (!debitEntry) {
      throw new Error('未找到可退款的扣点记录')
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: params.userId },
      select: { pointsBalance: true },
    })

    const nextBalance = user.pointsBalance + 1

    await tx.user.update({
      where: { id: params.userId },
      data: { pointsBalance: nextBalance },
    })

    return tx.pointsLedgerEntry.create({
      data: {
        userId: params.userId,
        type: PointsLedgerType.GENERATION_REFUND,
        pointsDelta: 1,
        balanceAfter: nextBalance,
        idempotencyKey: refundKey,
        referenceType: 'image_generation_request',
        referenceId: params.requestId,
      },
    })
  })
}

export async function createPointsPackage(params: {
  name: string
  points: number
  priceCents: number
  currency?: string
  displayOrder?: number
}) {
  return prisma.pointsPackage.create({
    data: {
      name: params.name,
      points: params.points,
      priceCents: params.priceCents,
      currency: params.currency || 'CNY',
      displayOrder: params.displayOrder || 0,
    },
  })
}

function generateRedemptionCodeValue() {
  return `PKG-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

export async function createRedemptionCodes(params: {
  points: number
  quantity: number
  createdByUserId: string
  packageId?: string
  batchId?: string
  expiresAt?: Date | null
}) {
  const codes = Array.from({ length: params.quantity }, () => {
    const plainCode = generateRedemptionCodeValue()
    return {
      plainCode,
      codeHash: hashRedemptionCode(plainCode),
    }
  })

  await prisma.redemptionCode.createMany({
    data: codes.map((item) => ({
      codeHash: item.codeHash,
      packageId: params.packageId,
      points: params.points,
      batchId: params.batchId,
      expiresAt: params.expiresAt || null,
      createdByUserId: params.createdByUserId,
    })),
  })

  return codes.map((item) => item.plainCode)
}
