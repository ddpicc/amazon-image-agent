'use client'

import { FormEvent, useMemo, useState } from 'react'
import Link from 'next/link'
import ReferenceImageUploader from '@/components/ReferenceImageUploader'
import type { ComplianceImageRole, CompliancePlatform, ComplianceStatus } from '@/lib/compliance-check'
import type { ComplianceMarket, ComplianceModuleResult, ComplianceRiskLevel, ComplianceScanResult } from '@/lib/compliance-scan-types'
import type { DesignPatentCandidate } from '@/lib/design-patent-search'

const PLATFORM_OPTIONS: Array<{ value: CompliancePlatform; label: string; description: string }> = [
  { value: 'amazon', label: 'Amazon', description: '根据主图或辅图区分规则，检查背景、主体和叠加元素' },
  { value: 'temu', label: 'Temu', description: '根据图片角色检查主体清晰度、真实性、构图和素材风险' },
]

const MARKET_OPTIONS: Array<{ value: ComplianceMarket; label: string; description: string }> = [
  { value: 'US', label: '美国市场', description: '检查美国平台图片场景和美国外观设计候选' },
  { value: 'AU', label: '澳大利亚市场', description: '检查澳大利亚平台图片场景和澳大利亚外观设计候选' },
]

const IMAGE_ROLE_OPTIONS: Array<{ value: ComplianceImageRole; label: string }> = [
  { value: 'main', label: '主图' },
  { value: 'secondary', label: '辅图 / 详情图' },
]

const STATUS_META: Record<ComplianceStatus, { label: string; className: string; icon: string }> = {
  pass: { label: '暂未发现明显问题', className: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: '✓' },
  warning: { label: '需要复核或优化', className: 'border-amber-200 bg-amber-50 text-amber-800', icon: '!' },
  fail: { label: '存在较高风险', className: 'border-rose-200 bg-rose-50 text-rose-800', icon: '×' },
  unknown: { label: '无法完全判断', className: 'border-slate-200 bg-slate-100 text-slate-700', icon: '?' },
}

const RISK_META: Record<ComplianceRiskLevel, { label: string; className: string }> = {
  low: { label: '低风险', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  medium: { label: '中风险', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  high: { label: '高风险', className: 'border-rose-200 bg-rose-50 text-rose-800' },
  unknown: { label: '未知', className: 'border-slate-200 bg-slate-100 text-slate-700' },
}

function StatusBadge({ status }: { status: ComplianceStatus }) {
  const meta = STATUS_META[status]
  return <span className={'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ' + meta.className}><span aria-hidden="true">{meta.icon}</span>{meta.label}</span>
}

function RiskBadge({ riskLevel }: { riskLevel: ComplianceRiskLevel }) {
  const meta = RISK_META[riskLevel]
  return <span className={'inline-flex shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ' + meta.className}>{meta.label}</span>
}

function CandidateCard({ candidate }: { candidate: DesignPatentCandidate }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{candidate.jurisdiction} · {candidate.identifier}</h4>
          <p className="mt-1 text-sm text-slate-700">{candidate.title}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-amber-800">文本 / 分类候选</span>
      </div>
      {candidate.images.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{candidate.images.slice(0, 6).map((url, index) => <img key={url} src={url} alt={'候选专利 ' + candidate.identifier + ' 附图 ' + (index + 1)} loading="lazy" className="h-20 w-20 rounded-lg border border-slate-200 bg-white object-contain p-1" />)}</div>}
      <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-600 sm:grid-cols-3">
        <span>权利人：{candidate.holder || '未知'}</span>
        <span>注册日：{candidate.filingDate || '未知'}</span>
        <span>状态：{candidate.status || '需核验'}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-amazon-blue hover:text-blue-700">查看 WIPO 详情</a>
        <a href={candidate.officialSearchUrl} target="_blank" rel="noreferrer" className="font-medium text-amazon-blue hover:text-blue-700">打开官方检索</a>
      </div>
    </div>
  )
}

function ModuleCard({ module }: { module: ComplianceModuleResult }) {
  return (
    <article className="panel p-6 sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{module.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{module.summary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2"><StatusBadge status={module.status} /><RiskBadge riskLevel={module.riskLevel} /></div>
      </div>

      {module.items.length > 0 && <div className="mt-5 space-y-3">{module.items.map((item) => <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><h4 className="text-sm font-semibold text-slate-900">{item.title}</h4><StatusBadge status={item.status} /></div><p className="mt-3 text-sm leading-6 text-slate-600">{item.evidence}</p><p className="mt-2 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-800">建议：</span>{item.recommendation}</p></div>)}</div>}

      {module.findings.length > 0 && <div className="mt-5 space-y-3">{module.findings.map((finding) => <div key={finding.key} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-slate-900">图片 {finding.imageIndex + 1} · {finding.detectedText || finding.description}</h4><div className="flex gap-2"><RiskBadge riskLevel={finding.riskLevel} /><span className="text-xs text-slate-500">置信度：{finding.confidence}</span></div></div><p className="mt-3 text-sm leading-6 text-slate-600">{finding.evidence}</p><p className="mt-2 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-800">建议：</span>{finding.recommendation}</p></div>)}</div>}

      {module.candidates.length > 0 && <div className="mt-5 space-y-3">{module.candidates.map((candidate) => <CandidateCard key={candidate.jurisdiction + candidate.identifier} candidate={candidate} />)}</div>}

      {module.messages.length > 0 && <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">{module.messages.map((message) => <p key={message}>{message}</p>)}</div>}
      {module.searchLinks.length > 0 && <div className="mt-5 border-t border-slate-200 pt-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">检索入口</div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">{module.searchLinks.map((link) => <a key={link.source} href={link.url} target="_blank" rel="noreferrer" className="text-amazon-blue hover:text-blue-700">{link.label} ↗</a>)}</div></div>}
    </article>
  )
}

export default function CompliancePageClient() {
  const [platform, setPlatform] = useState<CompliancePlatform>('amazon')
  const [targetMarket, setTargetMarket] = useState<ComplianceMarket>('US')
  const [images, setImages] = useState<File[]>([])
  const [imageRoles, setImageRoles] = useState<ComplianceImageRole[]>([])
  const [result, setResult] = useState<ComplianceScanResult | null>(null)
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(false)

  const selectedPlatform = useMemo(() => PLATFORM_OPTIONS.find((option) => option.value === platform) || PLATFORM_OPTIONS[0], [platform])
  const selectedMarket = useMemo(() => MARKET_OPTIONS.find((option) => option.value === targetMarket) || MARKET_OPTIONS[0], [targetMarket])
  const canSubmit = images.length >= 1 && images.length <= 6 && !isChecking

  const handleImagesChange = (nextImages: File[]) => {
    setImages(nextImages)
    setImageRoles(nextImages.map((_, index) => imageRoles[index] || (index === 0 ? 'main' : 'secondary')))
    setResult(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!images.length) {
      setError('请先上传至少一张商品图片')
      return
    }
    setError('')
    setResult(null)
    setIsChecking(true)
    try {
      const formData = new FormData()
      formData.append('platform', platform)
      formData.append('targetMarket', targetMarket)
      images.forEach((image, index) => {
        formData.append('images', image)
        formData.append('imageRoles', imageRoles[index] || (index === 0 ? 'main' : 'secondary'))
      })
      const response = await fetch('/api/compliance/scan', { method: 'POST', body: formData })
      const payload = await response.json() as { result?: ComplianceScanResult; error?: string }
      if (!response.ok || !payload.result) throw new Error(payload.error || '图片体检失败，请稍后重试')
      setResult(payload.result)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '图片体检失败，请稍后重试')
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        <header className="max-w-4xl">
          <Link href="/" className="text-sm font-medium text-amazon-blue transition hover:text-blue-700">← 返回工作流入口</Link>
          <div className="mt-6 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">图片工具 · 四类初筛</div>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">图片合规与 IP 风险体检</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">只上传商品图片，系统自动检查平台图片规范、图片内文字与 Logo、外观设计专利相似性，以及版权和素材风险。</p>
        </header>

        <div className="mt-10 grid gap-6 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
          <form onSubmit={handleSubmit} className="panel space-y-7 p-6 sm:p-8">
            <div><div className="text-sm font-semibold text-slate-900">1. 选择平台</div><div className="mt-3 grid gap-3">{PLATFORM_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => { setPlatform(option.value); setResult(null) }} className={'cursor-pointer rounded-2xl border p-4 text-left transition-colors duration-200 ' + (platform === option.value ? 'border-amazon-orange bg-orange-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300')}><div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-900">{option.label}</span>{platform === option.value && <span className="text-sm font-semibold text-amazon-orange">已选择</span>}</div><p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p></button>)}</div></div>
            <div><div className="text-sm font-semibold text-slate-900">2. 选择目标市场</div><div className="mt-3 grid gap-3">{MARKET_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => { setTargetMarket(option.value); setResult(null) }} className={'cursor-pointer rounded-2xl border p-4 text-left transition-colors duration-200 ' + (targetMarket === option.value ? 'border-amazon-orange bg-orange-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300')}><div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-900">{option.label}</span>{targetMarket === option.value && <span className="text-sm font-semibold text-amazon-orange">已选择</span>}</div><p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p></button>)}</div></div>
            <div><div className="text-sm font-semibold text-slate-900">3. 上传同一商品图片</div><div className="mt-3"><ReferenceImageUploader label="待检查图片" helperText="上传 1–6 张同一商品图片，建议包含正面、背面、侧面或细节图。支持 JPG、PNG、WEBP，单张不超过 10 MB。" accept="image/jpeg,image/png,image/webp" maxImages={6} previewColumns={4} emptySummaryText="上传商品图片，不需要填写任何文字信息。" filledSummaryText="图片已准备好，可以开始四类风险体检。" value={images} onChange={handleImagesChange} /></div></div>
            {images.length > 0 && <div><div className="text-sm font-semibold text-slate-900">4. 标记图片角色</div><div className="mt-3 space-y-2">{images.map((image, index) => <label key={image.name + index} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"><span className="min-w-0 truncate text-slate-700">图片 {index + 1} · {image.name}</span><select aria-label={'图片 ' + (index + 1) + '角色'} value={imageRoles[index] || (index === 0 ? 'main' : 'secondary')} onChange={(event) => { const nextRoles = [...imageRoles]; nextRoles[index] = event.target.value as ComplianceImageRole; setImageRoles(nextRoles); setResult(null) }} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700">{IMAGE_ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>)}</div></div>}
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">当前检查：{selectedPlatform.label} · {selectedMarket.label}。系统只分析图片本身，不会要求输入品牌名、标题、关键词或产品描述。</div>
            {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">{error}</div>}
            <button type="submit" disabled={!canSubmit} className="inline-flex w-full cursor-pointer items-center justify-center rounded-2xl bg-amazon-blue px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400">{isChecking ? '正在分析图片...' : '开始四类体检'}</button>
          </form>

          <section aria-live="polite" className="space-y-6">
            {!result && !isChecking && <div className="panel flex min-h-[520px] flex-col justify-center px-6 py-12 text-center sm:px-10"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-600"><svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg></div><h2 className="mt-5 text-xl font-semibold text-slate-900">四类检查结果会显示在这里</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">上传同一商品的多个角度，可以让外观专利相似性初筛更稳定。</p></div>}
            {isChecking && <div className="panel flex min-h-[520px] flex-col items-center justify-center px-6 py-12 text-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-amazon-orange" aria-hidden="true" /><h2 className="mt-5 text-xl font-semibold text-slate-900">正在检查图片</h2><p className="mt-2 text-sm leading-6 text-slate-500">正在读取图片、识别视觉元素并查询可用的设计专利来源，请稍候。</p></div>}
            {result && !isChecking && <><div className="panel p-6 sm:p-8"><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"><div className="min-w-0"><div className="text-sm font-semibold text-slate-500">{result.platformLabel} · {result.targetMarketLabel} · {result.images.length} 张图片</div><h2 className="mt-2 break-words text-xl font-normal tracking-tight text-slate-700 sm:text-2xl">{result.summary}</h2></div><div className="flex flex-wrap gap-2 lg:max-w-[220px] lg:justify-end"><StatusBadge status={result.overallStatus} /><RiskBadge riskLevel={result.overallRiskLevel} /></div></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">综合置信度</div><div className="mt-1 text-sm font-semibold text-slate-800">{result.confidence}</div></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">检查模块</div><div className="mt-1 text-sm font-semibold text-slate-800">4 类</div></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">图片数量</div><div className="mt-1 text-sm font-semibold text-slate-800">{result.images.length} 张</div></div></div></div><div className="grid gap-6"><ModuleCard module={result.modules.platform} /><ModuleCard module={result.modules.textLogo} /><ModuleCard module={result.modules.designPatent} /><ModuleCard module={result.modules.copyright} /></div><div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-800">免责说明：</span>{result.limitation}</div><button type="button" onClick={() => setResult(null)} className="w-full cursor-pointer rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-950">重新检查</button></>}
          </section>
        </div>
      </div>
    </main>
  )
}
