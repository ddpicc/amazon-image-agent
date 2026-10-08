// Validate model output before normalization. Missing evidence is never a passing result.
type Row = Record<string, unknown>
function record(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('结果必须是对象')
  return value as Row
}
function text(value: unknown) { return typeof value === 'string' && value.trim().length > 0 }
function requireFields(row: Row, fields: string[]) {
  if (fields.some((key) => !text(row[key]))) throw new Error('结果缺少必要文字')
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('结果缺少必要列表')
  return value
}
function strings(value: unknown) { if (array(value).some((item) => !text(item))) throw new Error('文字列表无效') }
function enumValue(value: unknown, allowed: string[]) {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new Error('结果状态无效')
}
function score(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) throw new Error('评分缺失或无效')
}
function indexes(value: unknown, count: number) {
  const items = array(value)
  if (items.some((i) => !Number.isInteger(i) || Number(i) < 0 || Number(i) >= count) || new Set(items).size !== items.length) throw new Error('图片编号无效')
}

export function validateComplianceResult(value: unknown, imageCount: number): Row {
  try {
    const row = record(value)
    requireFields(row, ['summary'])
    const items = array(row.platformItems)
    if (!items.length) throw new Error('平台检查缺失')
    for (const item of items) {
      const check = record(item)
      requireFields(check, ['key', 'title', 'evidence', 'recommendation'])
      enumValue(check.status, ['pass', 'warning', 'fail', 'unknown'])
    }
    for (const item of array(row.visualFindings)) {
      const finding = record(item)
      requireFields(finding, ['key', 'description', 'evidence', 'recommendation'])
      indexes([finding.imageIndex], imageCount)
      enumValue(finding.category, ['text', 'logo', 'watermark', 'character', 'artwork', 'celebrity', 'sports', 'stock', 'other'])
      enumValue(finding.riskLevel, ['low', 'medium', 'high', 'unknown'])
      enumValue(finding.confidence, ['low', 'medium', 'high', 'unknown'])
    }
    if (!('patentSearchProfile' in row)) throw new Error('检索画像缺失')
    if (row.patentSearchProfile !== null) {
      const profile = record(row.patentSearchProfile)
      requireFields(profile, ['productType', 'designSummary'])
      for (const key of ['dominantFeatures', 'searchTerms', 'classificationHints']) strings(profile[key])
      enumValue(profile.imageQuality, ['good', 'limited', 'unknown'])
    }
    return row
  } catch {
    throw new Error('AI 体检结果不完整或证据字段无效，本次未形成完整结论，请重试。')
  }
}

const roles = ['main-visual', 'size', 'pain-point', 'comparison', 'scene', 'detail', 'trust-proof', 'other']
export function validateStrategyResult(value: unknown, imageCount: number): Row {
  try {
    const row = record(value)
    requireFields(row, ['executiveSummary', 'coreSalesStory'])
    const aesthetic = record(row.aestheticAnalysis)
    score(aesthetic.overallScore)
    requireFields(aesthetic, ['summary'])
    const dimensions = array(aesthetic.dimensions).map(record)
    const names = ['layout', 'color', 'copy', 'visual-impact', 'consistency']
    if (dimensions.length !== 5 || new Set(dimensions.map((d) => d.dimension)).size !== 5) throw new Error('评分维度缺失')
    dimensions.forEach((d) => { enumValue(d.dimension, names); score(d.score); requireFields(d, ['strengths', 'weaknesses', 'referenceSuggestion', 'differentiation']) })
    for (const item of array(aesthetic.referenceableElements).map(record)) {
      enumValue(item.elementType, ['layout', 'color', 'copy', 'composition', 'visual-style'])
      indexes(item.sourceImageIndexes, imageCount)
      requireFields(item, ['whyItWorks', 'referenceMethod', 'differentiationMove'])
    }
    const sequence = record(row.sequenceAnalysis)
    requireFields(sequence, ['summary', 'openingTask', 'middleTask', 'closingTask', 'densityAssessment'])
    enumValue(sequence.flowStrength, ['strong', 'mixed', 'weak'])
    strings(sequence.missedOpportunities)
    const images = array(row.imageAnalyses).map(record)
    indexes(images.map((i) => i.imageIndex), imageCount)
    if (images.length !== imageCount) throw new Error('逐图分析缺失')
    for (const i of images) {
      enumValue(i.primaryRole, roles)
      array(i.secondaryRoles).forEach((r) => enumValue(r, roles))
      requireFields(i, ['salesTask', 'sequencePurpose'])
      strings(i.visibleEvidence); strings(i.keyClaims)
      enumValue(i.informationDensity, ['low', 'medium', 'high'])
      enumValue(i.confidence, ['low', 'medium', 'high'])
    }
    for (const item of array(row.repeatedSellingPoints).map(record)) {
      indexes(item.imageIndexes, imageCount)
      requireFields(item, ['claim', 'evidence'])
    }
    for (const item of array(row.ownEvidenceGaps).map(record)) {
      requireFields(item, ['proofNeeded', 'competitorEvidence', 'ownGap', 'recommendedImage'])
      enumValue(item.priority, ['high', 'medium', 'low'])
    }
    const strategy = record(row.differentiatedStrategy)
    requireFields(strategy, ['positioning'])
    strings(strategy.principles); strings(strategy.referenceBoundaries)
    const plan = array(strategy.imagePlan).map(record)
    if (!plan.length || plan.length > 9 || new Set(plan.map((p) => p.position)).size !== plan.length) throw new Error('图片方案缺失或重复')
    for (const item of plan) {
      if (!Number.isInteger(item.position) || Number(item.position) < 1 || Number(item.position) > 9) throw new Error('方案编号无效')
      requireFields(item, ['title', 'salesTask', 'proofToShow', 'differentiation'])
      enumValue(item.role, roles)
    }
    strings(row.limitations)
    return row
  } catch {
    throw new Error('AI 策略结果不完整，评分、逐图分析或制作方案缺失，本次未完成，请重试。')
  }
}
