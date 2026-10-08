'use client'
import Link from 'next/link'
const labels: Record<string, string> = { summary: '总结', executiveSummary: '策略总结', coreSalesStory: '销售叙事', modules: '检查模块', platform: '平台', textLogo: '文字与 Logo', designPatent: '专利候选检索', copyright: '版权素材', items: '检查项', findings: '识别证据', recommendation: '建议', evidence: '证据', status: '状态', riskLevel: '风险级别', title: '标题', aestheticAnalysis: '视觉分析', imageAnalyses: '逐图分析', differentiatedStrategy: '差异化策略', imagePlan: '图片方案', proofToShow: '需要的真实证据', salesTask: '销售任务', differentiation: '差异表达', ownEvidenceGaps: '我方证据缺口', limitations: '判断边界', limitation: '判断边界', overallScore: '综合评分', sequenceAnalysis: '图序分析', repeatedSellingPoints: '重复卖点' }
function markdown(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map((item, i) => `${'  '.repeat(depth)}- ${typeof item === 'object' ? `第 ${i + 1} 项\n${markdown(item, depth + 1)}` : String(item)}`).join('\n')
  if (typeof value === 'object') return Object.entries(value).filter(([key]) => !['imageUrls', 'images', 'region'].includes(key)).map(([key, item]) => `${'  '.repeat(depth)}- **${labels[key] || key}**：${typeof item === 'object' && item !== null ? `\n${markdown(item, depth + 1)}` : String(item ?? '未知')}`).join('\n')
  return String(value)
}
export default function ReportActions({ title, result, operationId, strategy = false }: { title: string; result: unknown; operationId: string | null; strategy?: boolean }) {
  const download = (format: 'md' | 'json') => {
    const body = format === 'json' ? JSON.stringify(result, null, 2) : `# ${title}\n\n${markdown(result)}\n`
    const url = URL.createObjectURL(new Blob([body], { type: format === 'json' ? 'application/json' : 'text/markdown;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${title}-${operationId || 'report'}.${format}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className="mb-5 flex flex-wrap gap-3 text-sm"><button type="button" onClick={() => download('md')} className="rounded-xl border bg-white px-4 py-2">导出报告 Markdown</button><button type="button" onClick={() => download('json')} className="rounded-xl border bg-white px-4 py-2">导出 JSON</button><Link href="/history" className="rounded-xl border bg-white px-4 py-2">我的历史</Link>{strategy && operationId && <Link href={`/amazon?strategyReport=${encodeURIComponent(operationId)}`} className="rounded-xl bg-amazon-blue px-4 py-2 font-semibold text-white">编辑方案并开始制作 →</Link>}</div>
}
