export const POINTS_SCALE = 10

export type GenerationBillingScene = 'amazon' | 'aplus' | 'playground'
export type AnalysisBillingScene = 'amazon-analysis' | 'aplus-analysis'

const GENERATION_COSTS: Record<GenerationBillingScene, number> = {
  amazon: 100,
  aplus: 150,
  playground: 100,
}

const ANALYSIS_COSTS: Record<AnalysisBillingScene, number> = {
  'amazon-analysis': 50,
  'aplus-analysis': 50,
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

export function getAnalysisCostInternal(scene: AnalysisBillingScene) {
  return ANALYSIS_COSTS[scene]
}

export function getAnalysisCostDisplay(scene: AnalysisBillingScene) {
  return toDisplayPoints(getAnalysisCostInternal(scene))
}
