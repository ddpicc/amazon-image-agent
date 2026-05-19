import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { loadEnvFile } from './load-env.mjs'

loadEnvFile('.env.local')

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

function readProviders() {
  const filePath = path.resolve(process.cwd(), '.key.json')
  const raw = fs.readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(raw)

  if (!Array.isArray(parsed)) {
    throw new Error('.key.json must contain a JSON array')
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Provider at index ${index} must be an object`)
    }

    const provider = item
    const name = String(provider.name || '').trim()
    const vendor = String(provider.vendor || '').trim()
    const baseUrl = String(provider.baseUrl || '').trim()
    const model = String(provider.model || '').trim()
    const apiKey = String(provider.apiKey || '').trim()
    const priority = Number(provider.priority ?? 100)
    const enabled = Boolean(provider.enabled)

    if (!name || !vendor || !baseUrl || !model || !apiKey || !Number.isFinite(priority)) {
      throw new Error(`Provider at index ${index} is missing required fields`)
    }

    return {
      name,
      vendor,
      baseUrl,
      model,
      apiKey,
      priority,
      enabled,
    }
  })
}

async function main() {
  const providers = readProviders()

  for (const provider of providers) {
    await prisma.imageProvider.upsert({
      where: { name: provider.name },
      update: {
        vendor: provider.vendor,
        baseUrl: provider.baseUrl,
        model: provider.model,
        priority: provider.priority,
        enabled: provider.enabled,
        apiKeyCiphertext: encryptSecret(provider.apiKey),
      },
      create: {
        name: provider.name,
        vendor: provider.vendor,
        baseUrl: provider.baseUrl,
        model: provider.model,
        priority: provider.priority,
        enabled: provider.enabled,
        apiKeyCiphertext: encryptSecret(provider.apiKey),
      },
    })

    console.log(`[provider:import] ${provider.name} saved`)
  }

  console.log(`[provider:import] imported ${providers.length} providers from .key.json`)
}

main()
  .catch((error) => {
    console.error('[provider:import] failed', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
