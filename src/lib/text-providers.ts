import { TextProviderRoutingRole } from '@prisma/client'
import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

const PROVIDER_COOLDOWN_MINUTES = 5
const PROVIDER_NAME_MAX_LENGTH = 64
const PROVIDER_VENDOR_MAX_LENGTH = 64
const PROVIDER_MODEL_MAX_LENGTH = 128
const PROVIDER_PRIORITY_MAX = 100000
const PROVIDER_API_KEY_MAX_LENGTH = 4096
const FORCED_FALLBACK_MODEL = 'glm-5.3-flash'

export interface TextProviderClientConfig {
  id?: string
  name: string
  vendor: string
  baseURL: string
  model: string
  apiKey: string
  routingRole: TextProviderRoutingRole
}

export function isForcedTextFallbackModel(model: string) {
  return model.trim().toLowerCase() === FORCED_FALLBACK_MODEL
}

function normalizeRoutingRole(value: unknown, model: string): TextProviderRoutingRole {
  const normalizedValue = typeof value === 'string' ? value.trim().toUpperCase() : ''
  const role = normalizedValue === ''
    ? TextProviderRoutingRole.AUTO
    : Object.values(TextProviderRoutingRole).includes(normalizedValue as TextProviderRoutingRole)
      ? normalizedValue as TextProviderRoutingRole
      : null

  if (!role) {
    throw new Error('routingRole is invalid')
  }

  if (role === TextProviderRoutingRole.FORCED_FALLBACK && !isForcedTextFallbackModel(model)) {
    throw new Error('只有 glm-5.3-flash 可以设置为强制备用 Provider')
  }

  return isForcedTextFallbackModel(model) ? TextProviderRoutingRole.FORCED_FALLBACK : role
}

export function getEffectiveTextProviderRoutingRole(provider: {
  model: string
  routingRole: TextProviderRoutingRole
}) {
  return isForcedTextFallbackModel(provider.model)
    ? TextProviderRoutingRole.FORCED_FALLBACK
    : provider.routingRole
}

function getCooldownUntil() {
  const date = new Date()
  date.setMinutes(date.getMinutes() + PROVIDER_COOLDOWN_MINUTES)
  return date
}

function normalizeText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${field} is required`)
  }
  if (normalized.length > maxLength) {
    throw new Error(`${field} is too long`)
  }
  return normalized
}

function normalizePriority(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > PROVIDER_PRIORITY_MAX) {
    throw new Error('priority is invalid')
  }
  return value
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('baseUrl is required')
  }

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error('baseUrl is invalid')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('baseUrl must use http or https')
  }

  if (parsed.username || parsed.password) {
    throw new Error('baseUrl must not contain credentials')
  }

  return parsed.toString().replace(/\/$/, '')
}

function normalizeApiKey(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('apiKey is required')
  }
  if (normalized.length > PROVIDER_API_KEY_MAX_LENGTH) {
    throw new Error('apiKey is too long')
  }
  return normalized
}

async function ensureCanReduceEnabledProviders(providerId?: string) {
  const enabledCount = await prisma.textProvider.count({
    where: providerId
      ? { enabled: true, NOT: { id: providerId } }
      : { enabled: true },
  })

  if (enabledCount === 0) {
    throw new Error('At least one enabled provider must remain')
  }
}

export async function listCandidateTextProviders(): Promise<TextProviderClientConfig[]> {
  const providers = await prisma.textProvider.findMany({
    where: { enabled: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })

  if (providers.length === 0) {
    throw new Error('No valid text provider is configured')
  }

  const now = Date.now()
  const ready = providers.filter((provider) => !provider.cooldownUntil || provider.cooldownUntil.getTime() <= now)
  const coolingDown = providers.filter((provider) => provider.cooldownUntil && provider.cooldownUntil.getTime() > now)

  return [...ready, ...coolingDown].map((provider) => ({
    id: provider.id,
    name: provider.name,
    vendor: provider.vendor,
    baseURL: provider.baseUrl,
    model: provider.model,
    apiKey: decryptSecret(provider.apiKeyCiphertext),
    routingRole: getEffectiveTextProviderRoutingRole(provider),
  }))
}

export async function createTextProvider(input: {
  name: string
  vendor: string
  baseUrl: string
  model: string
  priority: number
  enabled?: boolean
  routingRole?: TextProviderRoutingRole | string
  apiKey: string
}) {
  const name = normalizeText(input.name, 'name', PROVIDER_NAME_MAX_LENGTH)
  const vendor = normalizeText(input.vendor, 'vendor', PROVIDER_VENDOR_MAX_LENGTH)
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const model = normalizeText(input.model, 'model', PROVIDER_MODEL_MAX_LENGTH)
  const priority = normalizePriority(input.priority)
  const routingRole = normalizeRoutingRole(input.routingRole, model)
  const apiKeyCiphertext = encryptSecret(normalizeApiKey(input.apiKey))
  const enabled = Boolean(input.enabled)

  return prisma.textProvider.create({
    data: {
      name,
      vendor,
      baseUrl,
      model,
      priority,
      enabled,
      routingRole,
      apiKeyCiphertext,
    },
  })
}

export async function updateTextProviderRoutingRole(providerId: string, routingRoleValue: unknown) {
  const provider = await prisma.textProvider.findUnique({
    where: { id: providerId },
    select: { id: true, model: true },
  })

  if (!provider) {
    throw new Error('Provider not found')
  }

  const routingRole = normalizeRoutingRole(routingRoleValue, provider.model)
  const updated = await prisma.textProvider.update({
    where: { id: providerId },
    data: { routingRole },
  })

  return {
    id: updated.id,
    routingRole: getEffectiveTextProviderRoutingRole(updated),
  }
}

export async function updateTextProviderPriority(providerId: string, priorityValue: number) {
  const priority = normalizePriority(priorityValue)
  return prisma.textProvider.update({
    where: { id: providerId },
    data: { priority },
  })
}

export async function moveTextProvider(providerId: string, direction: 'up' | 'down') {
  const providers = await prisma.textProvider.findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, priority: true },
  })

  const currentIndex = providers.findIndex((provider) => provider.id === providerId)
  if (currentIndex === -1) {
    throw new Error('Provider not found')
  }

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
  if (targetIndex < 0 || targetIndex >= providers.length) {
    return providers[currentIndex]
  }

  const current = providers[currentIndex]
  const target = providers[targetIndex]

  if (!current || !target) {
    throw new Error('Provider move target not found')
  }

  await prisma.$transaction([
    prisma.textProvider.update({
      where: { id: current.id },
      data: { priority: target.priority },
    }),
    prisma.textProvider.update({
      where: { id: target.id },
      data: { priority: current.priority },
    }),
  ])

  return prisma.textProvider.findUnique({
    where: { id: current.id },
    select: { id: true, priority: true },
  })
}

export async function updateTextProviderEnabled(providerId: string, enabled: boolean) {
  const provider = await prisma.textProvider.findUnique({
    where: { id: providerId },
    select: { id: true, enabled: true },
  })

  if (!provider) {
    throw new Error('Provider not found')
  }

  if (provider.enabled && !enabled) {
    await ensureCanReduceEnabledProviders(providerId)
  }

  return prisma.textProvider.update({
    where: { id: providerId },
    data: { enabled },
  })
}

export async function rotateTextProviderApiKey(providerId: string, apiKey: string) {
  return prisma.textProvider.update({
    where: { id: providerId },
    data: {
      apiKeyCiphertext: encryptSecret(normalizeApiKey(apiKey)),
    },
  })
}

export async function deleteTextProvider(providerId: string) {
  const provider = await prisma.textProvider.findUnique({
    where: { id: providerId },
    select: { id: true, enabled: true },
  })

  if (!provider) {
    throw new Error('Provider not found')
  }

  if (provider.enabled) {
    throw new Error('Disable provider before deleting it')
  }

  return prisma.textProvider.delete({
    where: { id: providerId },
  })
}

export async function markTextProviderSuccess(providerId: string) {
  await prisma.textProvider.update({
    where: { id: providerId },
    data: {
      failureCount: 0,
      cooldownUntil: null,
      lastSuccessAt: new Date(),
    },
  })
}

export async function markTextProviderFailure(providerId: string) {
  await prisma.textProvider.update({
    where: { id: providerId },
    data: {
      failureCount: { increment: 1 },
      lastFailureAt: new Date(),
      cooldownUntil: getCooldownUntil(),
    },
  })
}
