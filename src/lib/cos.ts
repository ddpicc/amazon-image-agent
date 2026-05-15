import COS from 'cos-nodejs-sdk-v5'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} environment variable is not set`)
  }
  return value
}

let cosClient: COS | null = null

function getCosClient(): COS {
  if (!cosClient) {
    cosClient = new COS({
      SecretId: requireEnv('COS_SECRET_ID'),
      SecretKey: requireEnv('COS_SECRET_KEY'),
    })
  }

  return cosClient
}

function getPublicBaseUrl(): string {
  const configured = process.env.COS_PUBLIC_BASE_URL
  if (configured) {
    return configured.replace(/\/$/, '')
  }

  const bucket = requireEnv('COS_BUCKET')
  const region = requireEnv('COS_REGION')
  return `https://${bucket}.cos.${region}.myqcloud.com`
}

export function buildCosPublicUrl(key: string): string {
  return `${getPublicBaseUrl()}/${key.replace(/^\//, '')}`
}

export async function uploadBufferToCos(params: {
  buffer: Buffer
  key: string
  contentType: string
}): Promise<{ url: string; key: string; bytes: number; mimeType: string }> {
  const bucket = requireEnv('COS_BUCKET')
  const region = requireEnv('COS_REGION')

  await new Promise<void>((resolve, reject) => {
    getCosClient().putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: params.key,
        Body: params.buffer,
        ContentType: params.contentType,
      },
      (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      },
    )
  })

  return {
    url: buildCosPublicUrl(params.key),
    key: params.key,
    bytes: params.buffer.byteLength,
    mimeType: params.contentType,
  }
}
