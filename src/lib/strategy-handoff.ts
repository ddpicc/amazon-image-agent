import type { CompetitorStrategyResult } from '@/lib/competitor-strategy-types'
export function buildStrategyRequirements(result: CompetitorStrategyResult) {
  return [
    '以下为待确认的竞品参考策略，仅参考信息组织和表达。不得将竞品的性能、认证或配件当作我方商品事实。',
    `我方定位建议：${result.differentiatedStrategy.positioning}`,
    ...result.differentiatedStrategy.principles.map((item) => `原则：${item}`),
    ...result.differentiatedStrategy.imagePlan.map((item) => `第 ${item.position} 张：${item.title}\n销售任务：${item.salesTask}\n需要我方确认的证据：${item.proofToShow}\n差异表达：${item.differentiation}`),
    ...result.differentiatedStrategy.referenceBoundaries.map((item) => `参考边界：${item}`),
    '缺乏我方真实证据的内容必须省略或向用户确认，不得编造。',
  ].join('\n\n')
}
