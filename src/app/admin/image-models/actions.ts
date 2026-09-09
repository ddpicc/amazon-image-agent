'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { listRemoteImageModels } from '@/lib/image-worker-client'
import { toInternalPoints } from '@/lib/points-config'
import { prisma } from '@/lib/prisma'

function readText(formData: FormData, name: string) {
  return String(formData.get(name) || '').trim()
}

function readPoints(formData: FormData, name: string) {
  const value = Number(readText(formData, name))
  if (!Number.isFinite(value) || value < 0 || value > 100000) {
    throw new Error(`${name} 必须是 0 到 100000 之间的数字`)
  }
  return toInternalPoints(value)
}

export async function syncImageModelsAction() {
  await requireAdmin()
  const models = await listRemoteImageModels()
  const lastConfig = await prisma.imageModelConfig.findFirst({
    orderBy: { displayOrder: 'desc' },
    select: { displayOrder: true },
  })
  let nextOrder = (lastConfig?.displayOrder || 0) + 10

  for (const model of models) {
    await prisma.imageModelConfig.upsert({
      where: { model },
      update: {},
      create: {
        model,
        displayName: model,
        description: '由远端 image-worker 提供，配置展示信息和积分后即可开放。',
        enabled: false,
        isDefault: false,
        displayOrder: nextOrder,
        standardCost: toInternalPoints(10),
        aplusCost: toInternalPoints(10),
      },
    })
    nextOrder += 10
  }

  revalidatePath('/admin/image-models')
}

export async function updateImageModelAction(formData: FormData) {
  await requireAdmin()
  const id = readText(formData, 'id')
  const displayName = readText(formData, 'displayName')
  const description = readText(formData, 'description')
  const displayOrder = Number(readText(formData, 'displayOrder'))
  const enabled = formData.get('enabled') === 'on'
  const requestedDefault = formData.get('isDefault') === 'on'

  if (!id || !displayName) {
    throw new Error('模型和显示名称不能为空')
  }
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 100000) {
    throw new Error('排序必须是 0 到 100000 之间的整数')
  }

  await prisma.$transaction(async (tx) => {
    if (enabled && requestedDefault) {
      await tx.imageModelConfig.updateMany({
        where: { id: { not: id } },
        data: { isDefault: false },
      })
    }

    await tx.imageModelConfig.update({
      where: { id },
      data: {
        displayName,
        description: description || null,
        displayOrder,
        standardCost: readPoints(formData, 'standardCost'),
        aplusCost: readPoints(formData, 'aplusCost'),
        enabled,
        isDefault: enabled && requestedDefault,
      },
    })

    const defaultModel = await tx.imageModelConfig.findFirst({
      where: { enabled: true, isDefault: true },
    })
    if (!defaultModel) {
      const firstEnabled = await tx.imageModelConfig.findFirst({
        where: { enabled: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      })
      if (firstEnabled) {
        await tx.imageModelConfig.update({
          where: { id: firstEnabled.id },
          data: { isDefault: true },
        })
      }
    }
  })

  revalidatePath('/admin/image-models')
  revalidatePath('/amazon')
  revalidatePath('/playground')
  revalidatePath('/points')
}
