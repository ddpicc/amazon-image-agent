import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} environment variable is required`)
  }
  return value
}

function deriveKey(secret) {
  return crypto.createHash('sha256').update(secret).digest()
}

function encryptSecret(plaintext) {
  const key = deriveKey(requireEnv('PROVIDER_KEY_ENCRYPTION_KEY'))
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.')
}

async function main() {
  const name = requireEnv('PROVIDER_NAME')
  const vendor = process.env.PROVIDER_VENDOR || 'openai-compatible'
  const baseUrl = requireEnv('PROVIDER_BASE_URL')
  const model = requireEnv('PROVIDER_MODEL')
  const apiKey = requireEnv('PROVIDER_API_KEY')
  const priority = Number(process.env.PROVIDER_PRIORITY || '100')
  const enabled = (process.env.PROVIDER_ENABLED || 'true') === 'true'
  const configuredRoutingRole = process.env.PROVIDER_ROUTING_ROLE
  const allowedRoutingRoles = new Set(['AUTO', 'FALLBACK'])
  if (configuredRoutingRole && !allowedRoutingRoles.has(configuredRoutingRole)) {
    throw new Error('PROVIDER_ROUTING_ROLE must be AUTO or FALLBACK')
  }
  const routingRole = configuredRoutingRole || null

  const provider = await prisma.textProvider.upsert({
    where: { name },
    update: {
      vendor,
      baseUrl,
      model,
      priority,
      enabled,
      apiKeyCiphertext: encryptSecret(apiKey),
      ...(routingRole ? { routingRole } : {}),
    },
    create: {
      name,
      vendor,
      baseUrl,
      model,
      priority,
      enabled,
      apiKeyCiphertext: encryptSecret(apiKey),
      routingRole: routingRole || 'AUTO',
    },
  })

  console.log(`[text-provider:upsert] ${provider.name} saved`)
}

main()
  .catch((error) => {
    console.error('[text-provider:upsert] failed', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
