'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

interface ToolboxEntryCardProps {
  iconPath: string
}

const toolboxTools = [
  { href: '/tools/remove-background', icon: 'M4.5 12.75 9 17.25 19.5 6.75', iconTone: 'bg-orange-100 text-orange-600', title: '移除背景', description: '本地处理商品图，快速导出透明 PNG。', active: true },
  { icon: 'M12 3v18m9-9H3', iconTone: 'bg-sky-100 text-sky-600', title: '精修与提质感', description: '优化画面细节，让商品更干净、更有质感。', active: false },
  { icon: 'M4.5 6.75h15m-15 5.25h15m-15 5.25h15', iconTone: 'bg-violet-100 text-violet-600', title: '多平台尺寸适配', description: '一张商品图，适配 Amazon、Temu 等平台规格。', active: false },
  { icon: 'M7.5 8.25h9m-9 3.75h6m-9.75 6.75 2.25-2.25h9a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25h-12A2.25 2.25 0 0 0 3.75 6v8.25a2.25 2.25 0 0 0 2.25 2.25v3.75Z', iconTone: 'bg-emerald-100 text-emerald-600', title: '图内文案翻译', description: '识别并翻译图片中的文案，方便跨市场上架。', active: false },
] as const

export default function ToolboxEntryCard({ iconPath }: ToolboxEntryCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} aria-haspopup="dialog" aria-expanded={isOpen} className="group relative flex w-full flex-col rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-7 text-left transition-all duration-200 hover:-translate-y-1 hover:border-cyan-300 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)] focus:outline-none focus:ring-4 focus:ring-cyan-100">
        <div className="relative flex items-start justify-between gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-cyan-100 text-cyan-600 shadow-sm transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d={iconPath} /></svg>
          </span>
          <span className="inline-flex rounded-full border border-white/80 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">图片工具箱</span>
        </div>
        <div className="relative mt-6 flex grow flex-col">
          <h3 className="text-2xl font-semibold text-slate-950">图片处理工具箱</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">上传图片即可抠白底、精修并提升质感，支持一张图适配多平台尺寸，图内文案还能翻译成目标语言。</p>
          <ul className="mt-6 space-y-3 text-sm text-slate-700">
            {['抠白底、精修、提升质感', '一张图适配多平台尺寸', '图内文案翻译成目标语言'].map((bullet) => <li key={bullet} className="flex items-start gap-3"><svg className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg><span>{bullet}</span></li>)}
          </ul>
          <div className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">查看工具 <span className="transition group-hover:translate-x-1">→</span></div>
        </div>
      </button>

      {isOpen && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm animate-[fade-in_180ms_ease-out]" role="dialog" aria-modal="true" aria-labelledby="toolbox-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsOpen(false) }}>
        <div className="w-full max-w-3xl rounded-[32px] border border-white/70 bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.28)] animate-[scale-in_220ms_cubic-bezier(0.16,1,0.3,1)] sm:p-8">
          <div className="flex items-start justify-between gap-5">
            <div><p className="text-sm font-medium text-cyan-600">图片工具箱</p><h2 id="toolbox-dialog-title" className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">你想先处理哪一步？</h2><p className="mt-2 text-sm leading-6 text-slate-500">先从最常用的移除背景开始，其他工具会沿用同一套工作区逐步加入。</p></div>
            <button ref={closeButtonRef} type="button" onClick={() => setIsOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-cyan-100" aria-label="关闭图片工具箱">×</button>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {toolboxTools.map((tool) => {
              const card = <div className={`group flex h-full items-start gap-4 rounded-2xl border p-4 text-left transition-all duration-200 ${tool.active ? 'border-orange-200 bg-orange-50/70 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-[0_12px_24px_rgba(255,153,0,0.13)]' : 'border-slate-200 bg-slate-50/70'}`}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tool.iconTone}`}><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d={tool.icon} /></svg></span><span className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold text-slate-950">{tool.title}<span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tool.active ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-500'}`}>{tool.active ? '现在可用' : '即将上线'}</span></span><span className="mt-1 block text-xs leading-5 text-slate-500">{tool.description}</span></span></div>
              return tool.active ? <Link key={tool.title} href={tool.href} onClick={() => setIsOpen(false)}>{card}</Link> : <div key={tool.title} aria-disabled="true">{card}</div>
            })}
          </div>
        </div>
      </div>}
    </>
  )
}
