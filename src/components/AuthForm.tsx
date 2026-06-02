'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface AuthFormProps {
  mode: 'login' | 'register'
  initialReferralCode?: string
}

export default function AuthForm({ mode, initialReferralCode = '' }: AuthFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [referralCode, setReferralCode] = useState(initialReferralCode)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [codeCooldown, setCodeCooldown] = useState(0)

  const isLogin = mode === 'login'

  useEffect(() => {
    if (codeCooldown <= 0) {
      return
    }

    const timer = window.setTimeout(() => {
      setCodeCooldown((current) => current - 1)
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [codeCooldown])

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError('请先输入邮箱')
      return
    }

    setError('')
    setMessage('')
    setIsSendingCode(true)

    try {
      const response = await fetch('/api/auth/register/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()
      if (!response.ok) {
        setError(data.error || '验证码发送失败')
        const retryAfter = Number(response.headers.get('Retry-After') || 0)
        if (retryAfter > 0) {
          setCodeCooldown(retryAfter)
        }
        return
      }

      setMessage('验证码已发送，请查收邮箱')
      setCodeCooldown(60)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '验证码发送失败')
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, referralCode, verificationCode }),
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

            {!isLogin && (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">邮箱验证码</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="input-field"
                    placeholder="6位数字验证码"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={isSendingCode || codeCooldown > 0}
                    className="shrink-0 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                  >
                    {isSendingCode ? '发送中...' : (codeCooldown > 0 ? `${codeCooldown}s 后重发` : '发送验证码')}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">验证码 5 分钟内有效，同一邮箱 60 秒内不可重复发送。</p>
              </div>
            )}

            {!isLogin && (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">邀请码</label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(event) => setReferralCode(event.target.value.trim().toLowerCase())}
                  className="input-field"
                  placeholder="选填，填写后注册可获 6 积分"
                />
              </div>
            )}

            {message && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            )}

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
