export const POINTS_SCALE = 10

export type GenerationBillingScene = 'amazon' | 'aplus' | 'reverse-prompt' | 'playground'

const GENERATION_COSTS: Record<GenerationBillingScene, number> = {
  amazon: 10,
  aplus: 16,
  'reverse-prompt': 10,
  playground: 8,
}

export function toInternalPoints(displayPoints: number) {
  return Math.round(displayPoints * POINTS_SCALE)
}

export function toDisplayPoints(internalPoints: number) {
  return internalPoints / POINTS_SCALE
}

export function formatPoints(points: number) {
  const display = Number.isInteger(points) ? points : Number(points.toFixed(1))
  return Number.isInteger(display) ? String(display) : display.toFixed(1)
}

export function formatInternalPoints(internalPoints: number) {
  return formatPoints(toDisplayPoints(internalPoints))
}

export function getGenerationCostInternal(scene: GenerationBillingScene) {
  return GENERATION_COSTS[scene]
}

export function getGenerationCostDisplay(scene: GenerationBillingScene) {
  return toDisplayPoints(getGenerationCostInternal(scene))
}
