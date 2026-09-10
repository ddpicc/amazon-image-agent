import crypto from 'crypto'
import type { Product1688Result } from '@/lib/1688-product'

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000

interface SelectionTokenPayload extends Product1688Result {
  userId: string
  expiresAt: number
}

function getAppSecret(): string {
  const secret = process.env.APP_SECRET?.trim()
  if (!secret) throw new Error('APP_SECRET environment variable is not set')
  return secret
}

function signPayload(encodedPayload: string): string {
  return crypto.createHmac('sha256', getAppSecret()).update(`1688-selection:${encodedPayload}`).digest('base64url')
}

export function create1688SelectionToken(userId: string, product: Product1688Result): string {
  const payload: SelectionTokenPayload = {
    ...product,
    userId,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${encodedPayload}.${signPayload(encodedPayload)}`
}

export function verify1688SelectionToken(token: string, userId: string): SelectionTokenPayload {
  const [encodedPayload, suppliedSignature] = token.split('.')
  if (!encodedPayload || !suppliedSignature) throw new Error('1688 图片选择凭证无效，请重新获取商品图片。')

  const expectedSignature = signPayload(encodedPayload)
  const expectedBuffer = Buffer.from(expectedSignature)
  const suppliedBuffer = Buffer.from(suppliedSignature)
  if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    throw new Error('1688 图片选择凭证无效，请重新获取商品图片。')
  }

  let payload: SelectionTokenPayload
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SelectionTokenPayload
  } catch {
    throw new Error('1688 图片选择凭证无效，请重新获取商品图片。')
  }

  if (payload.userId !== userId || payload.expiresAt <= Date.now()) {
    throw new Error('1688 图片选择已失效，请重新获取商品图片。')
  }
  if (!payload.offerId || !Array.isArray(payload.images) || !payload.images.length) {
    throw new Error('1688 图片选择凭证内容不完整，请重新获取商品图片。')
  }
  return payload
}
