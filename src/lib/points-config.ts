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

export function isCurrentPointsLedgerEntry(metadata: unknown, referenceType?: string | null) {
  if (referenceType === 'points_conversion' || referenceType === 'admin_manual_adjustment') {
    return true
  }

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false
  }

  const record = metadata as Record<string, unknown>
  return record.pointsUnit === 'new'
    || record.billingKind === 'generation'
    || record.billingKind === 'analysis'
    || record.billingKind === 'recharge'
}

export function toCurrentDisplayPoints(
  internalPoints: number,
  metadata?: unknown,
  referenceType?: string | null,
) {
  const normalizedInternalPoints = isCurrentPointsLedgerEntry(metadata, referenceType)
    ? internalPoints
    : internalPoints * 20
  return toDisplayPoints(normalizedInternalPoints)
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
