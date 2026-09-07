'use client'

import { FormEvent, useState } from 'react'

interface Product1688Result {
  offerId: string
  title: string
  images: string[]
  sourceUrl: string
}

export default function EightEightPageClient() {
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<Product1688Result | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setResult(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/1688/product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const payload = await response.json() as { result?: Product1688Result; error?: string }
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || '1688 商品信息获取失败，请稍后重试')
      }
      setResult(payload.result)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '1688 商品信息获取失败，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-[calc(100vh-76px)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="max-w-3xl">
          <div className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">1688 货源工作流</div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">获取 1688 商品图片和信息</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">输入 1688 商品链接，系统会先解析 offerid，再通过 JustOneAPI 获取商品标题和全部可用商品图片。</p>
        </header>

        <div className="mt-10 grid gap-6 xl:grid-cols-[minmax(0,410px)_minmax(0,1fr)]">
          <form onSubmit={handleSubmit} className="panel space-y-6 p-6 sm:p-8">
            <div>
              <label htmlFor="1688-url" className="mb-2 block text-sm font-semibold text-slate-900">1688 商品链接</label>
              <input
                id="1688-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://detail.1688.com/offer/123456789.html"
                className="input-field"
                required
              />
              <p className="mt-2 text-xs leading-5 text-slate-500">支持 detail.1688.com、m.1688.com 等 1688 商品链接。</p>
            </div>

            {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">{error}</div>}

            <button type="submit" disabled={isLoading || !url.trim()} className="inline-flex w-full items-center justify-center rounded-2xl bg-violet-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-400">
              {isLoading ? '正在获取商品信息...' : '获取商品信息'}
            </button>

            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
              当前只完成商品信息读取和图片预览，暂不自动进入 AI 生图。
            </div>
          </form>

          <section aria-live="polite" className="min-w-0">
            {!result && !isLoading && (
              <div className="panel flex min-h-[420px] flex-col items-center justify-center px-6 py-12 text-center sm:px-10">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-100 text-3xl text-violet-600" aria-hidden="true">↗</div>
                <h2 className="mt-5 text-xl font-semibold text-slate-900">商品信息会显示在这里</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">先输入一个 1688 商品链接，成功后会展示标题和所有识别到的商品图片。</p>
              </div>
            )}

            {isLoading && (
              <div className="panel flex min-h-[420px] flex-col items-center justify-center px-6 py-12 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-violet-600" aria-hidden="true" />
                <h2 className="mt-5 text-xl font-semibold text-slate-900">正在读取 1688 商品</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">JustOneAPI 的商品采集可能需要几十秒，请保持页面打开。</p>
              </div>
            )}

            {result && !isLoading && (
              <div className="space-y-6">
                <div className="panel p-6 sm:p-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">1688 商品标题</p>
                      <h2 className="mt-2 break-words text-2xl font-semibold leading-tight text-slate-950">{result.title}</h2>
                    </div>
                    <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">offerid：{result.offerId}</span>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500">
                    <span>识别到 {result.images.length} 张商品图片</span>
                    <a href={result.sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-violet-700 hover:text-violet-900">打开原商品链接 ↗</a>
                  </div>
                </div>

                <div className="panel p-6 sm:p-8">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-slate-950">全部商品图片</h2>
                    <span className="text-xs text-slate-500">{result.images.length} 张</span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {result.images.map((image, index) => (
                      <a key={image} href={image} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        <img src={image} alt={`${result.title} 商品图片 ${index + 1}`} loading={index < 4 ? 'eager' : 'lazy'} referrerPolicy="no-referrer" className="aspect-square w-full object-cover transition duration-200 group-hover:scale-[1.03]" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
