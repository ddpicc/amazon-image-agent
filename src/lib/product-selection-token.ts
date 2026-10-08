import crypto from 'crypto'

export function signProductSelection(userId: string, product: unknown) {
  const payload = Buffer.from(JSON.stringify({ userId, product, expiresAt: Date.now() + 2 * 60 * 60 * 1000 })).toString('base64url')
  return `${payload}.${signature(payload)}`
}
function signature(payload: string) {
  const secret = process.env.APP_SECRET?.trim()
  if (!secret) throw new Error('商品图片服务暂不可用，请联系管理员。')
  return crypto.createHmac('sha256', secret).update(`amazon-selection:${payload}`).digest('base64url')
}
export function verifyProductSelection<T>(token: string, userId: string): T {
  const [payload, supplied, extra] = token.split('.')
  if (!payload || !supplied || extra) throw new Error('图片选择凭证无效，请重新获取图片。')
  const expected = Buffer.from(signature(payload))
  const actual = Buffer.from(supplied)
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) throw new Error('图片选择凭证无效，请重新获取图片。')
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (parsed.userId !== userId || !Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= Date.now()) throw new Error('图片选择已过期，请重新获取图片并确认图序。')
  return parsed.product as T
}
