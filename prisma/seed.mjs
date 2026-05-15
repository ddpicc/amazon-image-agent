import bcrypt from 'bcryptjs'
import { PrismaClient, UserRole } from '@prisma/client'
import { loadEnvFile } from '../scripts/load-env.mjs'

const prisma = new PrismaClient()
loadEnvFile('.env.local')

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD

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
