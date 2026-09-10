'use client'

import type { CompetitorImageRole, CompetitorStrategyResult, StrategyPriority } from '@/lib/competitor-strategy-types'
import { IMAGE_ROLE_LABELS, MARKETPLACE_LABELS } from '@/lib/competitor-strategy-types'

const ROLE_TONES: Record<CompetitorImageRole, string> = {
  'main-visual': 'border-orange-200 bg-orange-50 text-orange-700',
  size: 'border-blue-200 bg-blue-50 text-blue-700',
  'pain-point': 'border-rose-200 bg-rose-50 text-rose-700',
  comparison: 'border-violet-200 bg-violet-50 text-violet-700',
  scene: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  detail: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  'trust-proof': 'border-amber-200 bg-amber-50 text-amber-700',
  other: 'border-slate-200 bg-slate-100 text-slate-700',
}

const PRIORITY_META: Record<StrategyPriority, { label: string; className: string }> = {
  high: { label: '优先补齐', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  medium: { label: '建议补齐', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  low: { label: '可选补充', className: 'border-slate-200 bg-slate-100 text-slate-600' },
}

const AESTHETIC_LABELS = {
  layout: '版式',
  color: '配色',
  copy: '文案',
  'visual-impact': '视觉冲击',
  consistency: '整套一致性',
}

const REFERENCE_LABELS = {
  layout: '版式',
  color: '配色',
  copy: '文案',
  composition: '构图',
  'visual-style': '视觉风格',
}

function RoleBadge({ role }: { role: CompetitorImageRole }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${ROLE_TONES[role]}`}>{IMAGE_ROLE_LABELS[role]}</span>
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amazon-blue">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
    </div>
  )
}

export default function CompetitorStrategyResults({
  result,
  uploadedImageUrls,
  onReset,
}: {
  result: CompetitorStrategyResult
  uploadedImageUrls: string[]
  onReset: () => void
}) {
  const competitorSource = result.source.competitor
  const imageUrls = competitorSource.mode === 'asin' ? competitorSource.imageUrls : uploadedImageUrls
  const maxFrequency = Math.max(1, ...result.repeatedSellingPoints.map((item) => item.frequency))

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
        <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:px-10 lg:py-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
              <span>{competitorSource.mode === 'asin' ? `ASIN ${competitorSource.asin}` : '上传图片分析'}</span>
              {competitorSource.mode === 'asin' && <><span className="h-1 w-1 rounded-full bg-slate-600" /><span>{MARKETPLACE_LABELS[competitorSource.marketplace]}站</span></>}
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span>{competitorSource.imageCount} 张竞品图</span>
            </div>
            {competitorSource.productTitle && <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-400">{competitorSource.productTitle}</p>}
            <h1 className="mt-5 text-2xl font-semibold leading-9 tracking-tight sm:text-3xl">{result.executiveSummary}</h1>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">它真正卖的是</p>
              <p className="mt-2 text-base leading-7 text-white">{result.coreSalesStory}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4"><p className="text-xs text-cyan-200">审美综合分</p><p className="mt-1 text-2xl font-semibold text-cyan-50">{result.aestheticAnalysis.overallScore}<span className="ml-1 text-xs font-normal text-cyan-200">/ 100</span></p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">可参考元素</p><p className="mt-1 text-2xl font-semibold">{result.aestheticAnalysis.referenceableElements.length}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">反复卖点</p><p className="mt-1 text-2xl font-semibold">{result.repeatedSellingPoints.length}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">差异化图组</p><p className="mt-1 text-2xl font-semibold">{result.differentiatedStrategy.imagePlan.length} 张</p></div>
          </div>
        </div>
      </section>

      <section className="panel p-6 sm:p-8">
        <SectionHeading eyebrow="01 · 审美与参考" title="哪里做得好，值得怎样参考" description={result.aestheticAnalysis.summary} />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {result.aestheticAnalysis.dimensions.map((item) => <article key={item.dimension} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-end justify-between gap-2"><h3 className="text-sm font-semibold text-slate-900">{AESTHETIC_LABELS[item.dimension]}</h3><span className="text-xl font-semibold text-amazon-blue">{item.score}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-amazon-blue" style={{ width: `${item.score}%` }} /></div><p className="mt-3 text-xs leading-5 text-slate-600">{item.strengths}</p><p className="mt-2 text-xs leading-5 text-slate-400">不足：{item.weaknesses}</p></article>)}
        </div>
        {result.aestheticAnalysis.referenceableElements.length > 0 && <div className="mt-6 space-y-3">{result.aestheticAnalysis.referenceableElements.map((item, index) => <article key={`${item.elementType}-${index}`} className="grid gap-4 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-5 lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]"><div><span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-cyan-800">{REFERENCE_LABELS[item.elementType]}</span><p className="mt-2 text-xs text-slate-500">图片 {item.sourceImageIndexes.map((imageIndex) => imageIndex + 1).join('、') || '整套'}</p></div><div><p className="text-xs font-semibold text-slate-400">为什么有效</p><p className="mt-1 text-sm leading-6 text-slate-700">{item.whyItWorks}</p><p className="mt-3 text-xs font-semibold text-slate-400">参考方式</p><p className="mt-1 text-sm leading-6 text-slate-700">{item.referenceMethod}</p></div><div className="rounded-xl bg-white p-4"><p className="text-xs font-semibold text-cyan-700">必须体现的差异</p><p className="mt-1 text-sm leading-6 text-cyan-900">{item.differentiationMove}</p></div></article>)}</div>}
      </section>

      <section className="panel p-6 sm:p-8">
        <SectionHeading eyebrow="02 · 图序逻辑" title="这套图如何推进购买决策" description="看每个阶段在回答什么，以及视觉表达如何配合销售任务。" />
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {[
            ['前段', result.sequenceAnalysis.openingTask],
            ['中段', result.sequenceAnalysis.middleTask],
            ['后段', result.sequenceAnalysis.closingTask],
          ].map(([label, text], index) => (
            <div key={label} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{index + 1}</span><span className="text-sm font-semibold text-slate-900">{label}</span></div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <p className="text-sm leading-6 text-blue-900">{result.sequenceAnalysis.summary}</p>
          <div className="border-t border-blue-200 pt-4 text-sm leading-6 text-blue-800 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><span className="font-semibold">信息密度：</span>{result.sequenceAnalysis.densityAssessment}</div>
        </div>
      </section>

      <section>
        <SectionHeading eyebrow="03 · 逐图拆解" title="每张图承担了什么销售任务" description="角色标签只是分类；销售任务和可见证据才说明它为什么存在。" />
        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {result.imageAnalyses.map((item) => (
            <article key={item.imageIndex} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <div className="relative aspect-square bg-slate-100">
                {imageUrls[item.imageIndex]
                  ? <img src={imageUrls[item.imageIndex]} alt={`竞品图片 ${item.imageIndex + 1}`} className="h-full w-full object-contain" />
                  : <div className="flex h-full items-center justify-center text-sm text-slate-400">图片预览不可用</div>}
                <span className="absolute left-3 top-3 flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-950/90 px-2 text-xs font-semibold text-white">{item.imageIndex + 1}</span>
                <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur">信息 {item.informationDensity === 'high' ? '高' : item.informationDensity === 'low' ? '低' : '中'}</span>
              </div>
              <div className="p-5">
                <div className="flex flex-wrap gap-2"><RoleBadge role={item.primaryRole} />{item.secondaryRoles.map((role) => <RoleBadge key={role} role={role} />)}</div>
                <h3 className="mt-4 text-lg font-semibold leading-7 text-slate-950">{item.salesTask}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">图序作用：{item.sequencePurpose}</p>
                {item.visibleEvidence.length > 0 && <div className="mt-4 border-t border-slate-100 pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">可见证据</p><ul className="mt-2 space-y-2 text-sm leading-5 text-slate-600">{item.visibleEvidence.map((evidence) => <li key={evidence} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cyan-500" />{evidence}</li>)}</ul></div>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="panel p-6 sm:p-8">
          <SectionHeading eyebrow="04 · 重复信号" title="竞品反复在强调什么" description="重复次数高，通常意味着它把这个卖点当作核心购买理由。" />
          <div className="mt-6 space-y-5">
            {result.repeatedSellingPoints.length > 0 ? result.repeatedSellingPoints.map((item) => (
              <div key={item.claim}>
                <div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold text-slate-900">{item.claim}</h3><p className="mt-1 text-xs leading-5 text-slate-500">图片 {item.imageIndexes.map((index) => index + 1).join('、') || '待复核'} · {item.evidence}</p></div><span className="shrink-0 text-sm font-semibold text-amazon-blue">{item.frequency} 次</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amazon-blue" style={{ width: `${Math.max(12, item.frequency / maxFrequency * 100)}%` }} /></div>
              </div>
            )) : <p className="text-sm leading-6 text-slate-500">没有识别到足够明确的重复卖点，建议人工复核图中文字和细节。</p>}
          </div>
        </div>

        <div className="panel p-6 sm:p-8">
          <SectionHeading eyebrow="05 · 我方缺口" title="缺的不是一张图，而是一份证明" description={result.source.own ? '基于我方当前商品图，优先补齐会影响购买判断的证据。' : '没有提供我方商品时，这里只列待核对项，不断言我方一定缺少。'} />
          <div className="mt-6 space-y-3">
            {result.ownEvidenceGaps.map((gap) => {
              const meta = PRIORITY_META[gap.priority]
              return <article key={gap.proofNeeded} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold leading-6 text-slate-900">{gap.proofNeeded}</h3><span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}>{meta.label}</span></div><p className="mt-3 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-800">竞品证据：</span>{gap.competitorEvidence}</p><p className="mt-1 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-800">我方现状：</span>{gap.ownGap}</p><div className="mt-3 rounded-xl bg-white px-3 py-2.5 text-sm leading-6 text-amazon-blue">建议：{gap.recommendedImage}</div></article>
            })}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-cyan-200 bg-[linear-gradient(135deg,#ecfeff_0%,#ffffff_55%,#eff6ff_100%)] p-6 sm:p-8 lg:p-10">
        <SectionHeading eyebrow="06 · 差异化策略" title="参考有效表达，再形成我方体系" description={result.differentiatedStrategy.positioning} />
        {result.differentiatedStrategy.principles.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{result.differentiatedStrategy.principles.map((principle) => <span key={principle} className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-medium text-cyan-800">{principle}</span>)}</div>}
        <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {result.differentiatedStrategy.imagePlan.map((item, index) => (
            <article key={`${item.position}-${item.title}`} className={`grid gap-4 p-5 sm:grid-cols-[56px_160px_minmax(0,1fr)] sm:items-start ${index > 0 ? 'border-t border-slate-200' : ''}`}>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white">{String(item.position).padStart(2, '0')}</div>
              <div><RoleBadge role={item.role} /><h3 className="mt-2 text-sm font-semibold text-slate-950">{item.title}</h3></div>
              <div className="grid gap-3 lg:grid-cols-3"><p className="text-sm leading-6 text-slate-600"><span className="block text-xs font-semibold text-slate-400">购买问题</span>{item.salesTask}</p><p className="text-sm leading-6 text-slate-600"><span className="block text-xs font-semibold text-slate-400">必须拿出的证据</span>{item.proofToShow}</p><p className="text-sm leading-6 text-cyan-800"><span className="block text-xs font-semibold text-cyan-600">差异化表达</span>{item.differentiation}</p></div>
            </article>
          ))}
        </div>
        {result.differentiatedStrategy.referenceBoundaries.length > 0 && <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5"><h3 className="text-sm font-semibold text-amber-900">参考边界</h3><ul className="mt-3 grid gap-2 text-sm leading-6 text-amber-800 sm:grid-cols-2">{result.differentiatedStrategy.referenceBoundaries.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{item}</li>)}</ul></div>}
      </section>

      {result.limitations.length > 0 && <section className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-800">判断边界：</span>{result.limitations.join('；')}</section>}
      <button type="button" onClick={onReset} className="w-full cursor-pointer rounded-2xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:border-slate-400 hover:text-slate-950">分析另一组竞品图片</button>
    </div>
  )
}
