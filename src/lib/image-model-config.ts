import { GenerationBillingScene, toDisplayPoints } from '@/lib/points-config'
import type { ImageModelOption } from '@/lib/image-options'
import { prisma } from '@/lib/prisma'

function getCostForScene(config: { standardCost: number; aplusCost: number }, scene: GenerationBillingScene) {
  return scene === 'aplus' ? config.aplusCost : config.standardCost
}

export async function listEnabledImageModelOptions(): Promise<ImageModelOption[]> {
  const configs = await prisma.imageModelConfig.findMany({
    where: { enabled: true },
    orderBy: [
      { isDefault: 'desc' },
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  })

  return configs.map((config) => ({
    value: config.model,
    label: config.displayName,
    description: config.description || '可用于商品图片生成',
    standardCost: toDisplayPoints(config.standardCost),
    aplusCost: toDisplayPoints(config.aplusCost),
    isDefault: config.isDefault,
  }))
}

export async function resolveImageModelForGeneration(
  requestedModel: string | null | undefined,
  scene: GenerationBillingScene,
) {
  const normalizedRequestedModel = requestedModel?.trim() || null
  const config = normalizedRequestedModel
    ? await prisma.imageModelConfig.findFirst({
        where: { model: normalizedRequestedModel, enabled: true },
      })
    : await prisma.imageModelConfig.findFirst({
        where: { enabled: true },
        orderBy: [
          { isDefault: 'desc' },
          { displayOrder: 'asc' },
          { createdAt: 'asc' },
        ],
      })

  if (!config) {
    throw new Error(normalizedRequestedModel ? '所选生图模型不可用，请重新选择。' : '暂无可用生图模型，请联系管理员。')
  }

  return {
    model: config.model,
    costInternal: getCostForScene(config, scene),
  }
}
