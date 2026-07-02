import { prisma } from '@/lib/prisma'

export interface SaveAnnouncementInput {
  title: string
  body: string
  isActive: boolean
  startsAt?: string | null
  endsAt?: string | null
  ctaLabel?: string | null
  ctaHref?: string | null
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized ? normalized : null
}

function parseOptionalDateTime(value: string | null | undefined, fieldLabel: string) {
  const normalized = normalizeOptionalString(value)
  if (!normalized) {
    return null
  }

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldLabel}不合法`)
  }

  return date
}

function validateAnnouncementHref(value: string | null) {
  if (!value) {
    return
  }

  if (value.startsWith('/')) {
    return
  }

  try {
    new URL(value)
  } catch {
    throw new Error('CTA 链接不合法')
  }
}

export async function getActiveAnnouncement(now = new Date()) {
  return prisma.announcement.findFirst({
    where: {
      isActive: true,
      AND: [
        {
          OR: [
            { startsAt: null },
            { startsAt: { lte: now } },
          ],
        },
        {
          OR: [
            { endsAt: null },
            { endsAt: { gte: now } },
          ],
        },
      ],
    },
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' },
    ],
  })
}

export async function getLatestAnnouncement() {
  return prisma.announcement.findFirst({
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' },
    ],
  })
}

export async function saveAnnouncement(input: SaveAnnouncementInput) {
  const title = input.title.trim()
  const body = input.body.trim()
  const isActive = Boolean(input.isActive)
  const startsAt = parseOptionalDateTime(input.startsAt, '开始时间')
  const endsAt = parseOptionalDateTime(input.endsAt, '结束时间')
  const ctaLabel = normalizeOptionalString(input.ctaLabel)
  const ctaHref = normalizeOptionalString(input.ctaHref)

  if (isActive && !title) {
    throw new Error('启用公告时必须填写标题')
  }

  if (isActive && !body) {
    throw new Error('启用公告时必须填写正文')
  }

  if (startsAt && endsAt && startsAt.getTime() > endsAt.getTime()) {
    throw new Error('开始时间不能晚于结束时间')
  }

  if ((ctaLabel && !ctaHref) || (!ctaLabel && ctaHref)) {
    throw new Error('CTA 文案和链接必须同时填写或同时留空')
  }

  validateAnnouncementHref(ctaHref)

  const [_, announcement] = await prisma.$transaction([
    prisma.announcement.updateMany({ data: { isActive: false } }),
    prisma.announcement.create({
      data: {
        title,
        body,
        isActive,
        startsAt,
        endsAt,
        ctaLabel,
        ctaHref,
      },
    }),
  ])

  return announcement
}
