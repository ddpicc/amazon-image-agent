import { Resend } from 'resend'

let resendClient: Resend | null = null

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} environment variable is not set`)
  }
  return value
}

function getResendClient() {
  if (!resendClient) {
    resendClient = new Resend(requireEnv('RESEND_API_KEY'))
  }

  return resendClient
}

export async function sendRegistrationVerificationEmail(params: {
  email: string
  code: string
  expiresInMinutes: number
}) {
  const resend = getResendClient()
  const from = requireEnv('RESEND_FROM')

  const { error } = await resend.emails.send({
    from,
    to: params.email,
    subject: '注册验证码',
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h2 style="margin:0 0 16px">注册验证码</h2>
        <p style="margin:0 0 12px">你正在注册账号，本次验证码为：</p>
        <div style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:6px;color:#f59e0b">
          ${params.code}
        </div>
        <p style="margin:0 0 8px">验证码 ${params.expiresInMinutes} 分钟内有效。</p>
        <p style="margin:0">如果不是你本人操作，请忽略这封邮件。</p>
      </div>
    `,
  })

  if (error) {
    throw new Error(error.message)
  }
}
