import bcrypt from 'bcryptjs'
import { PointsPackageStatus, PrismaClient, UserRole } from '@prisma/client'
import { loadEnvFile } from '../scripts/load-env.mjs'

const prisma = new PrismaClient()
loadEnvFile('.env.local')

async function seedPointsPackages() {
  const packages = [
    { name: '新手包', points: 20, priceCents: 500, displayOrder: 10 },
    { name: '进阶包', points: 100, priceCents: 2500, displayOrder: 20 },
    { name: '商家包', points: 500, priceCents: 12500, displayOrder: 30 },
  ]

  for (const item of packages) {
    await prisma.pointsPackage.upsert({
      where: {
        name: item.name,
      },
      update: {
        points: item.points,
        priceCents: item.priceCents,
        displayOrder: item.displayOrder,
        status: PointsPackageStatus.ACTIVE,
      },
      create: {
        name: item.name,
        points: item.points,
        priceCents: item.priceCents,
        displayOrder: item.displayOrder,
        status: PointsPackageStatus.ACTIVE,
      },
    })
  }

  console.log('[seed] upserted default points packages')
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD

  await seedPointsPackages()

  if (!email || !password) {
    console.log('[seed] ADMIN_EMAIL or ADMIN_PASSWORD not provided, skipping admin seed')
    return
  }

  const existingUser = await prisma.user.findUnique({ where: { email } })
  const passwordHash = await bcrypt.hash(password, 10)

  if (existingUser) {
    await prisma.user.update({
      where: { email },
      data: {
        role: UserRole.ADMIN,
        passwordHash,
      },
    })
    console.log(`[seed] updated admin user ${email}`)
    return
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: UserRole.ADMIN,
    },
  })
  console.log(`[seed] created admin user ${email}`)
}

main()
  .catch((error) => {
    console.error('[seed] failed', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
