'use client'
import { useEffect, useState } from 'react'
import type { ComplianceScanResult } from '@/lib/compliance-scan-types'
export default function ComplianceFollowUp({ result, onRecheck }: { result: ComplianceScanResult; onRecheck: () => void }) {
  const [baseline, setBaseline] = useState<ComplianceScanResult | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setBaseline(null); setError('')
    if (!result.comparisonId) return
    let active = true
    fetch(`/api/workflow-reports/${encodeURIComponent(result.comparisonId)}`).then(async (response) => {
      const data = await response.json()
      if (!response.ok || data.source !== 'compliance-scan' || !data.result) throw new Error('原报告不可用或已过期，无法对比。')
      if (active) setBaseline(data.result)
    }).catch((failure) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [result.comparisonId])
  const modules = Object.values(result.modules)
  const actions = modules.flatMap((module) => module.items.filter((item) => item.status !== 'pass').map((item) => ({ ...item, module: module.title })))
  return <section className="panel space-y-4 p-6"><h3 className="text-lg font-semibold">整改与复核清单</h3>{actions.length ? <ul className="space-y-3">{actions.map((item, index) => <li key={`${item.module}-${item.key}-${index}`} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-semibold">{item.module} · {item.title}</p><p className="mt-1 text-slate-600">{item.recommendation}</p></li>)}</ul> : <p className="text-sm text-slate-500">当前没有具体整改项；仍需复核未知模块和图片使用权。</p>}{modules.filter((module) => module.status === 'unknown').map((module) => <p key={module.key} className="text-sm text-amber-800">待复核：{module.title} — {module.summary}</p>)}{error && <p role="alert" className="text-sm text-amber-800">{error}</p>}{baseline && <div className="overflow-x-auto"><h4 className="mb-3 font-semibold">整改前后对比</h4>{baseline.platform !== result.platform || baseline.targetMarket !== result.targetMarket ? <p className="text-sm text-amber-800">两次平台或市场不同，不能直接比较。</p> : <><p className="mb-2 text-xs text-slate-500">按模块对比；不同图片、角色或识别波动也会影响结果，不自动认定问题已解决。</p><table className="w-full text-left text-sm"><thead><tr><th className="py-2">模块</th><th>整改前</th><th>本次</th></tr></thead><tbody>{modules.map((module) => <tr key={module.key} className="border-t"><td className="py-2">{module.title}</td><td>{statusLabel(baseline.modules[module.key].status)}</td><td>{statusLabel(module.status)}</td></tr>)}</tbody></table></>}</div>}<button type="button" onClick={onRecheck} className="rounded-xl bg-amazon-blue px-4 py-3 text-sm font-semibold text-white">上传整改后的图片复检</button><p className="text-xs text-slate-500">原报告会保留；请上传同一商品、对应角色的修改后图片。</p></section>
}
function statusLabel(status: string) { return ({ pass: '暂未发现明显问题', warning: '需复核', fail: '较高风险', unknown: '无法判断' } as Record<string, string>)[status] || '未知' }
