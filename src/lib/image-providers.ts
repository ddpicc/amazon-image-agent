import { prisma } from '@/lib/prisma'

const PROVIDER_COOLDOWN_MINUTES = 5

function getCooldownUntil() {
  const date = new Date()
  date.setMinutes(date.getMinutes() + PROVIDER_COOLDOWN_MINUTES)
  return date
}

export async function listCandidateImageProviders() {
  const providers = await prisma.imageProvider.findMany({
    where: { enabled: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })

  const now = Date.now()
  const ready = providers.filter((provider) => !provider.cooldownUntil || provider.cooldownUntil.getTime() <= now)
  return ready.length > 0 ? ready : providers
}

export async function markProviderSuccess(providerId: string) {
  await prisma.imageProvider.update({
    where: { id: providerId },
    data: {
      failureCount: 0,
      cooldownUntil: null,
      lastSuccessAt: new Date(),
    },
  })
}

export async function markProviderFailure(providerId: string) {
  await prisma.imageProvider.update({
    where: { id: providerId },
    data: {
      failureCount: { increment: 1 },
      lastFailureAt: new Date(),
      cooldownUntil: getCooldownUntil(),
    },
  })
}
