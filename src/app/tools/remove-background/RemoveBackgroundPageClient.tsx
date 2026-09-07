'use client'

import Link from 'next/link'
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react'
import { removeBackground } from '@/lib/background-remover'

const MAX_FILE_SIZE = 20 * 1024 * 1024

export default function RemoveBackgroundPageClient() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [originalUrl, setOriginalUrl] = useState('')
  const [resultUrl, setResultUrl] = useState('')
  const [resultFile, setResultFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => () => {
    if (originalUrl) URL.revokeObjectURL(originalUrl)
  }, [originalUrl])

  useEffect(() => () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl)
  }, [resultUrl])

  const selectFile = (nextFile: File | undefined) => {
    if (!nextFile) return
    setError('')
    setResultFile(null)
    setResultUrl('')
    if (!nextFile.type.startsWith('image/')) {
      setError('请选择 JPG、PNG 或 WEBP 图片。')
      return
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setError('图片不能超过 20 MB，请先压缩后再试。')
      return
    }
    setFile(nextFile)
    setOriginalUrl(URL.createObjectURL(nextFile))
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectFile(event.target.files?.[0])
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    selectFile(event.dataTransfer.files?.[0])
  }

  const handleProcess = async () => {
    if (!file || isProcessing) return
    setError('')
    setIsProcessing(true)
    setProgress(0)
    try {
      const processedFile = await removeBackground(file, setProgress)
      setResultFile(processedFile)
      setResultUrl(URL.createObjectURL(processedFile))
      setProgress(100)
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : '移除背景失败，请换一张图片重试。')
    } finally {
      setIsProcessing(false)
    }
  }

  const clearFile = () => {
    setFile(null)
    setResultFile(null)
    setOriginalUrl('')
    setResultUrl('')
    setError('')
    setProgress(0)
  }

  return (
    <main className="min-h-[calc(100vh-76px)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900">← 返回图片工具箱</Link>
        <header className="mt-7 max-w-3xl">
          <div className="inline-flex rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">图片工具箱 · 现在可用</div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">移除背景</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">在浏览器本地完成抠图，原始图片不会上传到 PageMint。适合先处理商品主图，再继续做合规检查或 AI 生图。</p>
        </header>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <section className="panel p-6 sm:p-7">
            <div onDrop={handleDrop} onDragOver={(event) => event.preventDefault()} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click() }} className="group cursor-pointer rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center transition hover:border-orange-400 hover:bg-orange-50/50 focus:outline-none focus:ring-4 focus:ring-orange-100">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105" aria-hidden="true">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5 7.5 12 12 16.5 16.5 12 21 16.5M6.75 7.5h.008v.008H6.75V7.5Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 19.5h18" /></svg>
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-900">拖拽图片到这里，或点击上传</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">支持 JPG、PNG、WEBP，单张最大 20 MB</p>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleInputChange} className="hidden" />
            </div>

            {file && <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{file.name}</p><p className="mt-1 text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p></div><button type="button" onClick={clearFile} className="shrink-0 text-xs font-medium text-slate-500 transition hover:text-rose-600">移除</button></div>}

            {error && <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">{error}</div>}

            <button type="button" onClick={handleProcess} disabled={!file || isProcessing} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {isProcessing && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
              {isProcessing ? (progress > 0 ? `正在处理 ${Math.round(progress)}%` : '正在准备模型...') : '开始移除背景'}
            </button>
            <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-800">首次使用需要在浏览器下载本地模型，之后会使用缓存，速度会更快。</div>
          </section>

          <section className="panel min-h-[480px] p-6 sm:p-7" aria-live="polite">
            {!file && <div className="flex min-h-[420px] flex-col items-center justify-center text-center"><div className="checkerboard flex h-28 w-28 items-center justify-center rounded-3xl border border-slate-200 text-4xl text-slate-400" aria-hidden="true">✦</div><h2 className="mt-6 text-xl font-semibold text-slate-900">处理结果会显示在这里</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">上传一张商品图，浏览器会自动识别主体并生成透明背景 PNG。</p></div>}
            {file && !resultUrl && <div className="grid min-h-[420px] place-items-center"><div className="w-full max-w-md"><div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-100"><img src={originalUrl} alt="待处理图片" className="aspect-square w-full object-contain" /></div><p className="mt-4 text-center text-sm text-slate-500">准备就绪，点击左侧按钮开始处理。</p></div></div>}
            {resultUrl && resultFile && <div><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">完成</p><h2 className="mt-1 text-xl font-semibold text-slate-950">背景已移除</h2></div><a href={resultUrl} download={resultFile.name} className="inline-flex items-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600">下载透明 PNG</a></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><div><p className="mb-2 text-xs font-semibold text-slate-500">原图</p><div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><img src={originalUrl} alt="原图" className="aspect-square w-full object-contain" /></div></div><div><p className="mb-2 text-xs font-semibold text-slate-500">透明背景</p><div className="checkerboard overflow-hidden rounded-2xl border border-slate-200"><img src={resultUrl} alt="已移除背景的图片" className="aspect-square w-full object-contain" /></div></div></div><p className="mt-4 text-xs leading-5 text-slate-500">处理在当前浏览器完成，PageMint 不会保存或上传原图。</p></div>}
          </section>
        </div>
      </div>
    </main>
  )
}
