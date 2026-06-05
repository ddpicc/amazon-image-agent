import { PaymentOrderStatus, PointsLedgerType, PointsPackageStatus, RedemptionCodeStatus, Prisma } from '@prisma/client'
import { hashRedemptionCode } from '@/lib/crypto'
import { formatInternalPoints, GenerationBillingScene, getGenerationCostInternal, toDisplayPoints, toInternalPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'
import type { ZPayPayType } from '@/lib/payments/zpay'

export class InsufficientPointsError extends Error {
  constructor(requiredInternalPoints?: number) {
    const message = requiredInternalPoints
      ? `积分不足，当前操作需要 ${formatInternalPoints(requiredInternalPoints)} 积分，请先充值或兑换积分包。`
      : '积分不足，请先充值或兑换积分包。'
    super(message)
    this.name = 'InsufficientPointsError'
  }
}

export const SIGNUP_BONUS_POINTS = toInternalPoints(3)
export const REFERRAL_INVITEE_BONUS_POINTS = toInternalPoints(6)
export const REFERRAL_INVITER_REWARD_POINTS = toInternalPoints(20)

function toNullableJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return Prisma.JsonNull
  }

  return value as Prisma.InputJsonValue
}

export async function getUserPointsBalance(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { pointsBalance: true },
  })

  return toDisplayPoints(user.pointsBalance)
}

export async function grantSignupBonus(userId: string) {
  return prisma.$transaction(async (tx) => {
    const idempotencyKey = `signup:${userId}:bonus`
    const existingEntry = await tx.pointsLedgerEntry.findUnique({
      where: { idempotencyKey },
    })

    if (existingEntry) {
      return existingEntry
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pointsBalance: true },
    })

    const nextBalance = user.pointsBalance + SIGNUP_BONUS_POINTS

    await tx.user.update({
      where: { id: userId },
      data: { pointsBalance: nextBalance },
    })

    return tx.pointsLedgerEntry.create({
      data: {
        userId,
        type: PointsLedgerType.SIGNUP_BONUS,
        pointsDelta: SIGNUP_BONUS_POINTS,
        balanceAfter: nextBalance,
        idempotencyKey,
        referenceType: 'user',
        referenceId: userId,
      },
    })
  })
}

export async function grantRegistrationRewards(params: { userId: string; inviterUserId?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: params.userId },
      select: { pointsBalance: true },
    })

    if (!params.inviterUserId) {
      const idempotencyKey = `signup:${params.userId}:bonus`
      const existingEntry = await tx.pointsLedgerEntry.findUnique({
        where: { idempotencyKey },
      })

      if (existingEntry) {
        return { inviteeEntry: existingEntry, inviterEntry: null }
      }

      const nextBalance = user.pointsBalance + SIGNUP_BONUS_POINTS

      await tx.user.update({
        where: { id: params.userId },
        data: { pointsBalance: nextBalance },
      })

      const inviteeEntry = await tx.pointsLedgerEntry.create({
        data: {
          userId: params.userId,
          type: PointsLedgerType.SIGNUP_BONUS,
          pointsDelta: SIGNUP_BONUS_POINTS,
          balanceAfter: nextBalance,
          idempotencyKey,
          referenceType: 'user',
          referenceId: params.userId,
        },
      })

      return { inviteeEntry, inviterEntry: null }
    }

    const inviteeIdempotencyKey = `signup:${params.userId}:referral-invitee`
    const existingInviteeEntry = await tx.pointsLedgerEntry.findUnique({
      where: { idempotencyKey: inviteeIdempotencyKey },
    })

    if (existingInviteeEntry) {
      return { inviteeEntry: existingInviteeEntry, inviterEntry: null }
    }

    const inviteeNextBalance = user.pointsBalance + REFERRAL_INVITEE_BONUS_POINTS

    await tx.user.update({
      where: { id: params.userId },
      data: { pointsBalance: inviteeNextBalance },
    })

    const inviteeEntry = await tx.pointsLedgerEntry.create({
      data: {
        userId: params.userId,
        type: PointsLedgerType.REFERRAL_INVITEE_BONUS,
        pointsDelta: REFERRAL_INVITEE_BONUS_POINTS,
        balanceAfter: inviteeNextBalance,
        idempotencyKey: inviteeIdempotencyKey,
        referenceType: 'user',
        referenceId: params.inviterUserId,
        metadata: {
          inviterUserId: params.inviterUserId,
        },
      },
    })

    return { inviteeEntry, inviterEntry: null }
  })
}

async function grantReferralInviterRewardOnFirstRecharge(tx: Prisma.TransactionClient, params: {
  inviteeUserId: string
  paymentOrderId: string
  outTradeNo?: string | null
}) {
  const invitee = await tx.user.findUnique({
    where: { id: params.inviteeUserId },
    select: { invitedByUserId: true },
  })

  if (!invitee?.invitedByUserId) {
    return null
  }

  const inviterRewardIdempotencyKey = `referral:first-recharge:${params.inviteeUserId}:inviter:${invitee.invitedByUserId}`
  const existingInviterEntry = await tx.pointsLedgerEntry.findUnique({
    where: { idempotencyKey: inviterRewardIdempotencyKey },
  })

  if (existingInviterEntry) {
    return existingInviterEntry
  }

  const inviter = await tx.user.findUnique({
    where: { id: invitee.invitedByUserId },
    select: { pointsBalance: true },
  })

  if (!inviter) {
    return null
  }

  const inviterNextBalance = inviter.pointsBalance + REFERRAL_INVITER_REWARD_POINTS

  await tx.user.update({
    where: { id: invitee.invitedByUserId },
    data: { pointsBalance: inviterNextBalance },
  })

  return tx.pointsLedgerEntry.create({
    data: {
      userId: invitee.invitedByUserId,
      type: PointsLedgerType.REFERRAL_INVITER_REWARD,
      pointsDelta: REFERRAL_INVITER_REWARD_POINTS,
      balanceAfter: inviterNextBalance,
      idempotencyKey: inviterRewardIdempotencyKey,
      referenceType: 'user',
      referenceId: params.inviteeUserId,
      metadata: {
        invitedUserId: params.inviteeUserId,
        paymentOrderId: params.paymentOrderId,
        outTradeNo: params.outTradeNo,
      },
    },
  })
}

export async function listActivePointsPackages() {
  const packages = await prisma.pointsPackage.findMany({
    where: { status: PointsPackageStatus.ACTIVE },
    orderBy: [
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  })

  return packages.map((item) => ({
    ...item,
    points: toDisplayPoints(item.points),
  }))
}

export async function getPointsSummary(userId: string) {
  const [user, packages, ledgerEntries, paymentOrders] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        referralCode: true,
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
    user: {
      ...user,
      pointsBalance: toDisplayPoints(user.pointsBalance),
    },
    packages,
    ledgerEntries: ledgerEntries.map((entry) => ({
      ...entry,
      pointsDelta: toDisplayPoints(entry.pointsDelta),
      balanceAfter: toDisplayPoints(entry.balanceAfter),
    })),
    paymentOrders: paymentOrders.map((order) => ({
      ...order,
      paymentPackage: {
        ...order.paymentPackage,
        points: toDisplayPoints(order.paymentPackage.points),
      },
    })),
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
        points: toDisplayPoints(pkg.points),
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
        points: toDisplayPoints(pkg.points),
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
          points: toDisplayPoints(order.paymentPackage.points),
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

    await grantReferralInviterRewardOnFirstRecharge(tx, {
      inviteeUserId: order.userId,
      paymentOrderId: order.id,
      outTradeNo: order.outTradeNo,
    })

    return ledgerEntry
  })
}

export async function settlePaymentOrderManually(params: {
  orderId: string
  adminUserId: string
}) {
  const order = await prisma.paymentOrder.findUnique({
    where: { id: params.orderId },
    select: {
      id: true,
      outTradeNo: true,
      amountCents: true,
      status: true,
      providerOrderId: true,
    },
  })

  if (!order) {
    throw new Error('订单不存在')
  }

  if (!order.outTradeNo) {
    throw new Error('订单缺少商户单号，无法入账')
  }

  return applyPaymentOrderSuccess({
    outTradeNo: order.outTradeNo,
    providerOrderId: order.providerOrderId || undefined,
    paidAmountCents: order.amountCents,
    notifyPayload: {
      source: 'admin_manual_settle',
      adminUserId: params.adminUserId,
      previousStatus: order.status,
      settledAt: new Date().toISOString(),
    },
    paidAt: new Date(),
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
      await tx.redemptionCode.update({
        where: { id: redemptionCode.id },
        data: { status: RedemptionCodeStatus.EXPIRED },
      })
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

export async function ensureSufficientPointsForGeneration(userId: string) {
  return ensureSufficientPointsForGenerationByScene(userId, 'amazon')
}

export async function ensureSufficientPointsForGenerationByScene(userId: string, scene: GenerationBillingScene) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { pointsBalance: true },
  })

  const requiredPoints = getGenerationCostInternal(scene)
  if (user.pointsBalance < requiredPoints) {
    throw new InsufficientPointsError(requiredPoints)
  }

  return user.pointsBalance
}

export async function debitPointForGeneration(params: { userId: string; requestId: string; scene: GenerationBillingScene }) {
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

    const debitAmount = getGenerationCostInternal(params.scene)
    if (user.pointsBalance < debitAmount) {
      throw new InsufficientPointsError(debitAmount)
    }

    const nextBalance = user.pointsBalance - debitAmount

    await tx.user.update({
      where: { id: params.userId },
      data: { pointsBalance: nextBalance },
    })

    const ledgerEntry = await tx.pointsLedgerEntry.create({
      data: {
        userId: params.userId,
        type: PointsLedgerType.GENERATION_DEBIT,
        pointsDelta: -debitAmount,
        balanceAfter: nextBalance,
        idempotencyKey,
        referenceType: 'image_generation_request',
        referenceId: params.requestId,
        metadata: {
          scene: params.scene,
          chargedPoints: toDisplayPoints(debitAmount),
        },
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

    const refundAmount = Math.abs(debitEntry.pointsDelta)

    const user = await tx.user.findUniqueOrThrow({
      where: { id: params.userId },
      select: { pointsBalance: true },
    })

    const nextBalance = user.pointsBalance + refundAmount

    await tx.user.update({
      where: { id: params.userId },
      data: { pointsBalance: nextBalance },
    })

    return tx.pointsLedgerEntry.create({
      data: {
        userId: params.userId,
        type: PointsLedgerType.GENERATION_REFUND,
        pointsDelta: refundAmount,
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
      points: toInternalPoints(params.points),
      priceCents: params.priceCents,
      currency: params.currency || 'CNY',
      displayOrder: params.displayOrder || 0,
    },
  })
}

function generateRedemptionCodeValue() {
  return `PKG-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function getDefaultRedemptionCodeExpiryDate() {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)
  return expiresAt
}

export async function createRedemptionCodes(params: {
  points: number
  quantity: number
  createdByUserId: string
  packageId?: string
  batchId?: string
  expiresAt?: Date | null
}) {
  const expiresAt = params.expiresAt ?? getDefaultRedemptionCodeExpiryDate()
  const codes = Array.from({ length: params.quantity }, () => {
    const plainCode = generateRedemptionCodeValue()
    return {
      plainCode,
      codeHash: hashRedemptionCode(plainCode),
    }
  })

  await prisma.redemptionCode.createMany({
    data: codes.map((item) => ({
      plainCode: item.plainCode,
      codeHash: item.codeHash,
      packageId: params.packageId,
      points: toInternalPoints(params.points),
      batchId: params.batchId,
      expiresAt,
      createdByUserId: params.createdByUserId,
    })),
  })

  return codes.map((item) => item.plainCode)
}
