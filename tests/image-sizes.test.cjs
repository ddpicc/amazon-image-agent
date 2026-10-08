const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')

function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: name => {
      if (name in mocks) return mocks[name]
      if (name === '@/lib/image-options') return load('src/lib/image-options.ts')
      throw new Error(`Unexpected dependency: ${name}`)
    },
    process: { env: {} }, URL, console, ...globals,
  }, { filename: file })
  return module.exports
}

test('Amazon queue preserves scene dimensions through storage and Worker submission', async () => {
  const cases = [
    ...['aplus-main', 'aplus-hero', 'aplus-transform', 'aplus-grid', 'aplus-lifestyle', 'aplus-feature', 'aplus-detail']
      .map(imageType => ({ sourcePage: 'amazon', imageType, size: '1600x1600', expected: '1536x960' })),
    { sourcePage: 'amazon', imageType: 'main', size: '1536x960', expected: '1600x1600' },
    { sourcePage: 'amazon', imageType: 'slot-1', size: '1024x1024', expected: '1600x1600' },
    { sourcePage: 'playground', imageType: 'aplus-hero', size: '2048x1360', expected: '2048x1360' },
  ]
  for (const scenario of cases) {
    let stored, operation, submitted
    const service = load('src/lib/image-generation-service.ts', {
      '@/lib/ai-operations': {
        startAiOperation: async input => { operation = input; return { id: 'operation' } },
        getAiOperationExpiryDate: () => new Date(),
      },
      '@/lib/amazon-workflow': { AMAZON_REFERENCE_IMAGE_LIMIT: 3 },
      '@/lib/image-model-config': { resolveImageModelForGeneration: async () => ({ model: 'test-model', costInternal: 10 }) },
      '@/lib/image-worker-client': {
        submitRemoteImageTask: async input => { submitted = input; return { requestId: 'remote', status: 'pending' } },
      },
      '@/lib/points': { ensureSufficientPointsForGeneration: async () => {} },
      '@/lib/points-config': { toDisplayPoints: value => value },
      '@/lib/prisma': { prisma: { imageGenerationRequest: {
        create: async ({ data }) => { stored = { id: 'local', ...data }; return stored },
        findUnique: async () => stored,
        update: async () => {},
      } } },
      '@/lib/crypto': {},
    })
    await service.createQueuedImageGenerationRequest({
      ...scenario, userId: 'user', prompt: 'test', originalPrompt: 'test',
      billingScene: scenario.imageType.startsWith('aplus-') ? 'aplus' : 'amazon',
      entryApi: '/api/generate/stream', referenceImages: [],
    })
    assert.equal(stored.size, scenario.expected)
    assert.equal(stored.requestPayloadJson.size, scenario.expected)
    assert.equal(operation.requestSnapshot.size, scenario.expected)
    await service.submitQueuedImageGenerationRequest('local')
    assert.equal(submitted.size, scenario.expected)
  }
})

test('Worker client sends A+ dimensions unchanged for generate and edit requests', async () => {
  for (const referenceImageUrls of [[], ['https://example.com/reference.png']]) {
    let sentUrl, sentBody
    const client = load('src/lib/image-worker-client.ts', {}, {
      process: { env: { IMAGE_WORKER_BASE_URL: 'https://worker.example.com', IMAGE_WORKER_API_KEY: 'test' } },
      AbortSignal,
      fetch: async (url, init) => {
        sentUrl = url; sentBody = JSON.parse(init.body)
        return { ok: true, json: async () => ({ id: 'remote', status: 'pending' }) }
      },
    })
    await client.submitRemoteImageTask({ prompt: 'test', model: 'test-model', size: '1536x960', referenceImageUrls })
    assert.equal(sentBody.size, '1536x960')
    assert.equal(sentUrl.endsWith(referenceImageUrls.length ? '/edits' : '/generations'), true)
  }
})
