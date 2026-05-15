'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface AuthFormProps {
  mode: 'login' | 'register'
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isLogin = mode === 'login'

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()
      if (!response.ok) {
        setError(data.error || '请求失败')
        return
      }

      router.push('/')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '请求失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_100%)] px-4 py-12">
      <div className="mx-auto max-w-md">
        <div className="panel p-8">
          <div className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              {isLogin ? '登录' : '注册'}
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">
              {isLogin ? '登录你的账号' : '创建新账号'}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {isLogin ? '登录后即可使用分析、生图、历史和多用户能力。' : '先创建账号，再开始使用 Amazon 图片工作流。'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-800">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-800">密码</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input-field"
                minLength={8}
                required
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-amazon-orange px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? '提交中...' : (isLogin ? '登录' : '注册')}
            </button>
          </form>

          <div className="mt-6 text-sm text-slate-500">
            {isLogin ? '还没有账号？' : '已经有账号？'}{' '}
            <Link href={isLogin ? '/register' : '/login'} className="font-medium text-amazon-blue hover:text-blue-600">
              {isLogin ? '去注册' : '去登录'}
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
