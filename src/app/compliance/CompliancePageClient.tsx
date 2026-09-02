'use client'

import { FormEvent, useMemo, useState } from 'react'
import Link from 'next/link'
import ReferenceImageUploader from '@/components/ReferenceImageUploader'
import type { ComplianceCheckItem, ComplianceImageRole, CompliancePlatform, ComplianceResult, ComplianceStatus } from '@/lib/compliance-check'

const PLATFORM_OPTIONS: Array<{ value: CompliancePlatform; label: string; description: string }> = [
  { value: 'amazon', label: 'Amazon', description: '根据主图或辅图区分规则，检查背景、主体和叠加元素' },
  { value: 'temu', label: 'Temu', description: '根据图片角色检查主体清晰度、真实性、构图和素材风险' },
]

const IMAGE_ROLE_OPTIONS: Array<{ value: ComplianceImageRole; label: string; description: string }> = [
  { value: 'main', label: '主图', description: '按平台主图要求重点检查背景、主体占比和叠加元素' },
  { value: 'secondary', label: '辅图 / 详情图', description: '允许场景和说明性设计，重点检查真实性、清晰度与误导风险' },
]

const STATUS_META: Record<ComplianceStatus, { label: string; className: string; icon: string }> = {
  pass: { label: '暂未发现明显问题', className: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: '✓' },
  warning: { label: '需要复核或优化', className: 'border-amber-200 bg-amber-50 text-amber-800', icon: '!' },
  fail: { label: '存在较高风险', className: 'border-rose-200 bg-rose-50 text-rose-800', icon: '×' },
  unknown: { label: '无法完全判断', className: 'border-slate-200 bg-slate-100 text-slate-700', icon: '?' },
}

function StatusBadge({ status }: { status: ComplianceStatus }) {
  const meta = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${meta.className}`}>
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  )
}

function CheckItem({ item }: { item: ComplianceCheckItem }) {
  const meta = STATUS_META[item.status]
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
        <StatusBadge status={item.status} />
      </div>
      <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm leading-6 ${meta.className}`}>
        {item.evidence}
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">
        <span className="font-semibold text-slate-800">建议：</span>{item.recommendation}
      </p>
    </article>
  )
}

export default function CompliancePageClient() {
  const [platform, setPlatform] = useState<CompliancePlatform>('amazon')
  const [imageRole, setImageRole] = useState<ComplianceImageRole>('main')
  const [image, setImage] = useState<File[]>([])
  const [result, setResult] = useState<ComplianceResult | null>(null)
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(false)

  const canSubmit = image.length === 1 && !isChecking
  const selectedPlatform = useMemo(
    () => PLATFORM_OPTIONS.find((option) => option.value === platform) || PLATFORM_OPTIONS[0],
    [platform],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!image[0]) {
      setError('请先上传一张商品图片')
      return
    }

    setError('')
    setResult(null)
    setIsChecking(true)

    try {
      const formData = new FormData()
      formData.append('platform', platform)
      formData.append('imageRole', imageRole)
      formData.append('image', image[0])

      const response = await fetch('/api/compliance/check', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json() as { result?: ComplianceResult; error?: string }
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || '图片体检失败，请稍后重试')
      }

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
        <header className="max-w-3xl">
          <Link href="/" className="text-sm font-medium text-amazon-blue transition hover:text-blue-700">← 返回工作流入口</Link>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            图片工具 · 初步检查
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">平台合规体检</h1>
          <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            上传一张商品图，选择目标平台，快速识别背景、主体、文字水印和画质等常见风险，并获得可执行的修改建议。
          </p>
        </header>

        <div className="mt-10 grid gap-6 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
          <form onSubmit={handleSubmit} className="panel space-y-7 p-6 sm:p-8">
            <div>
              <div className="text-sm font-semibold text-slate-900">1. 选择平台</div>
              <div className="mt-3 grid gap-3">
                {PLATFORM_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setPlatform(option.value)
                      setResult(null)
                    }}
                    className={`cursor-pointer rounded-2xl border p-4 text-left transition-colors duration-200 ${platform === option.value ? 'border-amazon-orange bg-orange-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-900">{option.label}</span>
                      {platform === option.value && <span className="text-sm font-semibold text-amazon-orange">已选择</span>}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-900">2. 选择图片角色</div>
              <div className="mt-3 grid gap-3">
                {IMAGE_ROLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setImageRole(option.value)
                      setResult(null)
                    }}
                    className={`cursor-pointer rounded-2xl border p-4 text-left transition-colors duration-200 ${imageRole === option.value ? 'border-amazon-orange bg-orange-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-900">{option.label}</span>
                      {imageRole === option.value && <span className="text-sm font-semibold text-amazon-orange">已选择</span>}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-900">3. 上传商品图片</div>
              <div className="mt-3">
                <ReferenceImageUploader
                  label="待检查图片"
                  helperText="仅检查 1 张图片，支持 JPG、PNG、WEBP，单张不超过 10 MB。"
                  accept="image/jpeg,image/png,image/webp"
                  maxImages={1}
                  emptySummaryText="上传主图或准备提交的平台商品图。"
                  filledSummaryText="图片已准备好，可以开始检查。"
                  value={image}
                  onChange={setImage}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
              当前检查：{selectedPlatform.label} {IMAGE_ROLE_OPTIONS.find((option) => option.value === imageRole)?.label} 基础图片风险。辅图不会因为不是纯白背景或包含说明性元素就自动判定违规。
            </div>

            {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">{error}</div>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex w-full cursor-pointer items-center justify-center rounded-2xl bg-amazon-blue px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isChecking ? '正在分析图片...' : '开始体检'}
            </button>
          </form>

          <section aria-live="polite" className="space-y-6">
            {!result && !isChecking && (
              <div className="panel flex min-h-[520px] flex-col justify-center px-6 py-12 text-center sm:px-10">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-600">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                  </svg>
                </div>
                <h2 className="mt-5 text-xl font-semibold text-slate-900">检查结果会显示在这里</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">选择平台并上传图片后，系统会分别展示技术信息、风险项目和整改顺序。</p>
              </div>
            )}

            {isChecking && (
              <div className="panel flex min-h-[520px] flex-col items-center justify-center px-6 py-12 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-amazon-orange" aria-hidden="true" />
                <h2 className="mt-5 text-xl font-semibold text-slate-900">正在检查图片</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">正在读取图片并分析可见风险，请稍候。</p>
              </div>
            )}

            {result && !isChecking && (
              <>
                <div className="panel p-6 sm:p-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-500">{result.platformLabel} · {result.imageRoleLabel} 初步体检结果</div>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{result.summary}</h2>
                    </div>
                    <StatusBadge status={result.overallStatus} />
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">图片尺寸</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{result.technical.width && result.technical.height ? `${result.technical.width} × ${result.technical.height}` : '未知'}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">文件格式</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{result.technical.mimeType.replace('image/', '').toUpperCase()}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">检查项目</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{result.items.length} 项</div>
                    </div>
                  </div>
                </div>

                <div className="panel p-6 sm:p-8">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl font-semibold text-slate-950">逐项检查</h2>
                    <button type="button" onClick={() => setResult(null)} className="cursor-pointer text-sm font-medium text-amazon-blue transition-colors hover:text-blue-700">重新检查</button>
                  </div>
                  <div className="mt-5 grid gap-4">{result.items.map((item) => <CheckItem key={item.key} item={item} />)}</div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="panel p-6">
                    <h2 className="text-lg font-semibold text-slate-950">建议处理顺序</h2>
                    <ol className="mt-4 space-y-3">
                      {result.actionPlan.map((item, index) => (
                        <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amazon-blue text-xs font-semibold text-white">{index + 1}</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="panel p-6">
                    <h2 className="text-lg font-semibold text-slate-950">使用边界</h2>
                    <p className="mt-4 text-sm leading-6 text-slate-600">{result.limitation}</p>
                    <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-800">查看本次检查依据</summary>
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                        {result.ruleBasis.map((rule) => <li key={rule}>· {rule}</li>)}
                      </ul>
                    </details>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
