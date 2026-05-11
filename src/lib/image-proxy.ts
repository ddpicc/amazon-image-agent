import crypto from 'crypto'
import { headers } from 'next/headers'

const DEFAULT_TTL_SECONDS = 60 * 60 * 24

function getProxySigningSecret(): string {
  const secret = process.env.IMAGE_PROXY_SECRET || process.env.IMAGE_KEY

  if (!secret) {
    throw new Error('IMAGE_PROXY_SECRET or IMAGE_KEY environment variable is required')
  }

  return secret
}

function signPayload(url: string, expires: string): string {
  return crypto
    .createHmac('sha256', getProxySigningSecret())
    .update(`${url}:${expires}`)
    .digest('hex')
}

function getPublicAppOrigin(): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/$/, '')
  }

  const headerStore = headers()
  const forwardedProto = headerStore.get('x-forwarded-proto') || 'https'
  const forwardedHost = headerStore.get('x-forwarded-host') || headerStore.get('host')

  if (!forwardedHost) {
    throw new Error('Unable to determine public app origin')
  }

  return `${forwardedProto}://${forwardedHost}`
}

export function createSignedImageProxyUrl(sourceUrl: string): string {
  const expires = String(Math.floor(Date.now() / 1000) + DEFAULT_TTL_SECONDS)
  const signature = signPayload(sourceUrl, expires)
  const proxyUrl = new URL('/api/image-proxy', getPublicAppOrigin())

  proxyUrl.searchParams.set('url', sourceUrl)
  proxyUrl.searchParams.set('expires', expires)
  proxyUrl.searchParams.set('signature', signature)

  return proxyUrl.toString()
}

export function verifySignedImageProxyUrl(sourceUrl: string, expires: string, signature: string): boolean {
  if (!sourceUrl || !expires || !signature) {
    return false
  }

  const expiresAt = Number(expires)
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false
  }

  const expectedSignature = signPayload(sourceUrl, expires)
  const received = Buffer.from(signature)
  const expected = Buffer.from(expectedSignature)

  if (received.length !== expected.length) {
    return false
  }

  return crypto.timingSafeEqual(received, expected)
}

export function isProxyableImageUrl(sourceUrl: string): boolean {
  try {
    const parsed = new URL(sourceUrl)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
