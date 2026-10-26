const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const sharp = require('sharp')
const root = path.resolve(__dirname, '..')
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require: name => name in mocks ? mocks[name] : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`, mocks, globals) : require(name), Buffer, URL, AbortController, Request, Response, ReadableStream, TextEncoder, File, setTimeout, clearTimeout, setInterval, clearInterval, console, process, ...globals }, { filename: file })
  return module.exports
}
function strategyFixture() {
  return {
    executiveSummary: '完整策略', coreSalesStory: '可见证据',
    aestheticAnalysis: { overallScore: 78, summary: '视觉总结', dimensions: ['layout', 'color', 'copy', 'visual-impact', 'consistency'].map(dimension => ({ dimension, score: 78, strengths: '清晰', weaknesses: '需改进', referenceSuggestion: '参考结构', differentiation: '使用真实证据' })), referenceableElements: [] },
    sequenceAnalysis: { summary: '顺序总结', openingTask: '认识商品', middleTask: '解释卖点', closingTask: '消除顾虑', densityAssessment: '适中', flowStrength: 'mixed', missedOpportunities: [] },
    imageAnalyses: [0, 1].map(imageIndex => ({ imageIndex, primaryRole: 'detail', secondaryRoles: [], salesTask: '解释细节', visibleEvidence: ['可见接缝'], keyClaims: [], informationDensity: 'low', sequencePurpose: '补充信息', confidence: 'medium' })),
    repeatedSellingPoints: [], ownEvidenceGaps: [],
    differentiatedStrategy: { positioning: '我方定位', principles: ['不虚构'], imagePlan: [{ position: 1, role: 'main-visual', title: '展示主体', salesTask: '展示商品', proofToShow: '我方实拍', differentiation: '真实结构' }], referenceBoundaries: ['不复制品牌'] }, limitations: ['仅依据图片']
  }
}
const profile = { productType: 'bag', designSummary: 'bag outline', dominantFeatures: ['handle'], searchTerms: ['bag'], classificationHints: [], imageQuality: 'good' }
const complianceFixture = () => ({ summary: '已识别可见证据', platformItems: [{ key: 'quality', title: '清晰度', status: 'pass', evidence: '主体清晰', recommendation: '保留原图' }], visualFindings: [], patentSearchProfile: null })

test('patent business errors, malformed envelopes and invalid hits remain incomplete; valid zero completes', async () => {
  for (const [body, complete] of [[{ code: 601, message: 'quota' }, false], [{ code: 0, data: {} }, false], [{ code: 0, data: { data: { hits: [{}] } } }, false], [{ code: 0, data: { data: { hits: [] } } }, true]]) {
    const api = load('src/lib/design-patent-search.ts', {}, { process: { env: { PANGOL_SCRAPEAPI_API_KEY: 'test' } }, fetch: async () => ({ ok: true, json: async () => body }) })
    const result = await api.searchDesignPatentCandidates({ market: 'US', profile })
    assert.equal(result.complete, complete)
    assert.equal(result.messages.length === 0, complete)
  }
})
test('compliance requires explicit checks/findings; empty findings are valid only in a complete response', () => {
  const { validateComplianceResult } = load('src/lib/workflow-result-validation.ts')
  for (const value of [{}, [], null, { ...complianceFixture(), visualFindings: undefined }, { ...complianceFixture(), platformItems: [] }]) assert.throws(() => validateComplianceResult(value, 1))
  assert.doesNotThrow(() => validateComplianceResult(complianceFixture(), 1))
  const bad = complianceFixture(); bad.visualFindings = [{ category: 'logo', imageIndex: 8 }]
  assert.throws(() => validateComplianceResult(bad, 1))
})
test('strategy rejects missing scores, missing or duplicate images, missing plan, invalid dimensions', () => {
  const { validateStrategyResult } = load('src/lib/workflow-result-validation.ts')
  assert.throws(() => validateStrategyResult({}, 2))
  assert.doesNotThrow(() => validateStrategyResult(strategyFixture(), 2))
  for (const mutate of [p => delete p.aestheticAnalysis.overallScore, p => p.aestheticAnalysis.overallScore = '60', p => p.imageAnalyses.pop(), p => p.imageAnalyses[1].imageIndex = 0, p => p.differentiatedStrategy.imagePlan = [], p => p.aestheticAnalysis.dimensions.pop()]) {
    const value = strategyFixture(); mutate(value); assert.throws(() => validateStrategyResult(value, 2))
  }
})
test('real JPEG, PNG, lossy and lossless WEBP dimensions; MIME mismatch and corrupted bytes rejected', async () => {
  const { inspectImageBuffer } = load('src/lib/compliance-check.ts')
  for (const [format, options] of [['png', {}], ['jpeg', {}], ['webp', {}], ['webp', { lossless: true }]]) {
    const buffer = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#ffffff' } }).toFormat(format, options).toBuffer()
    const result = await inspectImageBuffer(buffer, `image/${format}`)
    assert.equal(result.width, 1600); assert.equal(result.height, 1200)
    if (format === 'png') await assert.rejects(inspectImageBuffer(buffer, 'image/jpeg'))
  }
  await assert.rejects(inspectImageBuffer(Buffer.from('not an image'), 'image/png'))
})
test('empty model JSON no longer produces passing compliance or a default strategy score', async () => {
  const mocks = { '@/lib/text-model': { requestTextJsonCompletion: async () => '{}' }, '@/lib/compliance-background': { analyzeBackgroundColor: async () => ({ rgb: [255, 255, 255], edgeNearWhiteRatio: 1, edgeUniformity: 1 }) } }
  const scan = load('src/lib/compliance-scan.ts', mocks)
  await assert.rejects(scan.scanImageCompliance({ platform: 'amazon', targetMarket: 'US', images: [{ buffer: Buffer.from('mock'), role: 'main', technical: { width: 1600, height: 1200, mimeType: 'image/jpeg', bytes: 4 } }] }), /不完整/)
  const strategy = load('src/lib/competitor-image-strategy.ts', mocks)
  await assert.rejects(strategy.analyzeCompetitorImageStrategy({ competitor: { mode: 'upload', marketplace: 'US', images: [{ buffer: Buffer.from('mock'), mimeType: 'image/jpeg' }], imageUrls: [] }, own: null }), /不完整/)
})
test('signed selections reject cross-user access, tampering and expiration', () => {
  const { signProductSelection, verifyProductSelection } = load('src/lib/product-selection-token.ts', {}, { process: { env: { APP_SECRET: 'local-test' } } })
  const token = signProductSelection('alice', { images: ['a'] })
  assert.equal(verifyProductSelection(token, 'alice').images[0], 'a')
  assert.throws(() => verifyProductSelection(token, 'bob'))
  assert.throws(() => verifyProductSelection(token + '.extra', 'alice'))
  assert.throws(() => verifyProductSelection(token.slice(0, -4) + 'xxxx', 'alice'))
  const later = load('src/lib/product-selection-token.ts', {}, { process: { env: { APP_SECRET: 'local-test' } }, Date: { now: () => Date.now() + 3 * 60 * 60 * 1000 } })
  assert.throws(() => later.verifyProductSelection(token, 'alice'), /过期/)
})
test('remote missing image stops analysis with original index; selected order survives successful download', async () => {
  const mocks = { '@/lib/product-selection-token': { verifyProductSelection: () => ({ asin: 'B012345678', marketplace: 'US', title: 'test', images: ['https://m.media-amazon.com/0.jpg', 'https://m.media-amazon.com/1.jpg', 'https://m.media-amazon.com/2.jpg'] }) }, '@/lib/competitor-image-strategy': { prepareStrategyImage: async buffer => ({ buffer, mimeType: 'image/jpeg' }) } }
  const input = { mode: 'asin', marketplace: 'US', token: 'signed', indexes: [2, 0], userId: 'alice', label: '竞品', files: [] }
  let fail = true
  const source = load('src/lib/competitor-image-source.ts', mocks, { fetch: async url => new Response(String(url).endsWith('0.jpg') && fail ? null : String(url), { status: String(url).endsWith('0.jpg') && fail ? 500 : 200 }) })
  await assert.rejects(source.resolveStrategySource(input), /原图 1 下载失败/)
  fail = false
  const result = await source.resolveStrategySource(input)
  assert.equal(result.originalImageIndexes.join(','), '2,0')
  assert.equal(result.imageUrls[0], 'https://m.media-amazon.com/2.jpg')
  assert.throws(() => source.selectedImageIndexes([0, 0], 3))
  assert.throws(() => source.selectedImageIndexes([3], 3))
})
function fakeOperations() {
  const rows = new Map()
  const calls = []
  const prisma = { aiOperation: {
    updateMany: async ({ where, data }) => { calls.push({ where, data }); const row = rows.get(where.id); if (!row || (where.status && row.status !== where.status)) return { count: 0 }; Object.assign(row, data); return { count: 1 } },
    findUnique: async ({ where }) => rows.get(where.id),
  } }
  const operations = { startAiOperation: async params => { const row = { id: 'op1', startedAt: new Date(), status: 'STARTED', ...params }; rows.set(row.id, row); return row }, getAiOperationExpiryDate: () => new Date(Date.now() + 10000) }
  return { rows, calls, prisma, operations }
}
test('task exists before parsing; stream emits ID, phases and persisted result', async () => {
  const db = fakeOperations()
  const { runWorkflow } = load('src/lib/workflow-reports.ts', { '@/lib/prisma': { prisma: db.prisma }, '@/lib/ai-operations': db.operations })
  const request = new Request('http://localhost/api/compliance/scan', { method: 'POST', headers: { Accept: 'application/x-ndjson' } })
  const response = await runWorkflow(request, 'alice', 'compliance-scan', async context => { assert.equal(db.rows.size, 1); await context.stage('download'); return { summary: 'ok' } })
  const events = (await response.text()).trim().split('\n').map(JSON.parse)
  assert.equal(events[0].type, 'started'); assert.equal(events[1].stage, 'download'); assert.equal(events[2].type, 'result')
  assert.equal(db.rows.get('op1').status, 'SUCCEEDED')
})
test('cancelled tasks cannot be overwritten by late completion; validation failure persists', async () => {
  const db = fakeOperations()
  const { runWorkflow, WorkflowInputError } = load('src/lib/workflow-reports.ts', { '@/lib/prisma': { prisma: db.prisma }, '@/lib/ai-operations': db.operations })
  const request = new Request('http://localhost/api/compliance/scan', { method: 'POST' })
  const response = await runWorkflow(request, 'alice', 'compliance-scan', async () => { db.rows.get('op1').status = 'FAILED'; db.rows.get('op1').errorMessage = '用户已取消任务'; return { summary: 'late' } })
  assert.equal(response.status, 500); assert.equal(db.rows.get('op1').errorMessage, '用户已取消任务'); assert.equal(db.rows.get('op1').responseSnapshotJson, undefined)
  const invalid = await runWorkflow(request, 'alice', 'compliance-scan', async () => { throw new WorkflowInputError('invalid upload') })
  assert.equal(invalid.status, 400); assert.equal(db.rows.get('op1').status, 'FAILED')
})
test('report reading and cancellation are restricted to the owner, type and retention period', async () => {
  const calls = []
  const mocks = { '@/lib/auth': { requireApiUser: async () => ({ id: 'alice' }) }, '@/lib/workflow-reports': { expireStaleReports: async () => undefined, REPORT_SOURCES: ['compliance-scan', 'competitor-strategy'] }, '@/lib/prisma': { prisma: { aiOperation: { findFirst: async query => { calls.push(query); return null }, updateMany: async () => { throw new Error('must not mutate unowned record') } } } } }
  const route = load('src/app/api/workflow-reports/[id]/route.ts', mocks)
  const request = new Request('http://localhost/api/workflow-reports/bob-report')
  assert.equal((await route.GET(request, { params: { id: 'bob-report' } })).status, 404)
  assert.equal((await route.DELETE(request, { params: { id: 'bob-report' } })).status, 404)
  for (const query of calls) { assert.equal(query.where.userId, 'alice'); assert.equal(query.where.id, 'bob-report'); assert.equal(query.where.sourcePage.in.length, 2); assert.ok(query.where.OR[1].expiresAt.gt) }
})
test('handoff contains plan and evidence boundaries; does not copy competitor images or titles', () => {
  const { buildStrategyRequirements } = load('src/lib/strategy-handoff.ts')
  const result = strategyFixture()
  result.source = { competitor: { productTitle: 'SECRET COMPETITOR TITLE', imageUrls: ['https://competitor.example/image'] }, own: null }
  const requirements = buildStrategyRequirements(result)
  assert.match(requirements, /第 1 张：展示主体/)
  assert.match(requirements, /不得编造/)
  assert.doesNotMatch(requirements, /SECRET|competitor\.example/)
})
test('unknown visual findings are not diluted by low-risk findings; other risks stay visible', async () => {
  const payload = complianceFixture()
  const finding = { key: 'logo-1', category: 'logo', imageIndex: 0, description: '标识', evidence: '局部可见', recommendation: '人工核验', riskLevel: 'low', confidence: 'high' }
  payload.visualFindings = [finding, { ...finding, key: 'logo-2', riskLevel: 'unknown', confidence: 'unknown' }, { ...finding, key: 'other', category: 'other', riskLevel: 'high' }]
  const scan = load('src/lib/compliance-scan.ts', { '@/lib/text-model': { requestTextJsonCompletion: async () => JSON.stringify(payload) }, '@/lib/compliance-background': { analyzeBackgroundColor: async () => ({ rgb: [255,255,255], edgeNearWhiteRatio: 1, edgeUniformity: 1 }) } })
  const result = await scan.scanImageCompliance({ platform: 'amazon', targetMarket: 'US', images: [{ buffer: Buffer.from('mock'), role: 'main', technical: { width: 1600, height: 1200, mimeType: 'image/jpeg', bytes: 4 } }] })
  assert.equal(result.modules.textLogo.status, 'unknown')
  assert.equal(result.modules.textLogo.confidence, 'unknown')
  assert.equal(result.modules.copyright.status, 'fail')
})
test('user cancellation aborts model work without penalizing provider health or starting fallback', async () => {
  const controller = new AbortController()
  let calls = 0, failures = 0
  class FakeOpenAI {
    constructor() { this.chat = { completions: { create: async (_, options) => { calls++; assert.ok(options.signal); controller.abort(new Error('user cancelled')); throw new Error('aborted') } } } }
  }
  const model = load('src/lib/text-model.ts', {
    openai: FakeOpenAI,
    '@/lib/text-providers': { listCandidateTextProviders: async () => [{ id: 'primary', name: 'primary', model: 'test', routingRole: 'AUTO' }, { id: 'fallback', name: 'fallback', model: 'test', routingRole: 'FALLBACK' }], markTextProviderFailure: async () => { failures++ }, markTextProviderSuccess: async () => undefined },
    '@/lib/ai-operations': { startAiOperationAttempt: async () => ({ id: 'attempt' }), completeAiOperationAttempt: async () => undefined }
  }, { console: { info() {}, warn() {}, error() {} } })
  await assert.rejects(model.requestTextJsonCompletion([], 100, { operationId: 'op', signal: controller.signal }), /user cancelled/)
  assert.equal(calls, 1); assert.equal(failures, 0)
})
test('legacy fallback prompt plans are detected so they can be regenerated', () => {
  const { normalizePromptResults } = load('src/lib/amazon-workflow.ts')
  const plan = {
    amazonSet: {
      status: 'completed',
      recommendedImagePlan: [{ type: 'main-white', index: 1, title: '白底主图', goal: '', notes: [] }],
      suggestedPrompts: { 'main-white': 'prompt' },
      workflowVersion: 2,
      items: [
        { slotId: 'main-white', title: '白底主图', visualForm: 'white', prompt: 'p1' },
        { slotId: 'secondary-1', title: '核心利益与使用场景', visualForm: 'life', prompt: 'p2' },
        { slotId: 'secondary-2', title: '关键细节', visualForm: 'detail', prompt: 'p3' },
        { slotId: 'secondary-3', title: '尺寸与比例', visualForm: 'size', prompt: 'p4' },
        { slotId: 'secondary-4', title: '功能卖点', visualForm: 'feature', prompt: 'p5' },
      ],
    },
    aplus: null,
  }
  assert.equal(normalizePromptResults(plan).amazonSet.generatedByFallback, true)

  const custom = JSON.parse(JSON.stringify(plan))
  custom.amazonSet.items[0].title = '完整 L 型主图'
  assert.equal(normalizePromptResults(custom).amazonSet.generatedByFallback, undefined)

  const marked = JSON.parse(JSON.stringify(custom))
  marked.amazonSet.generatedByFallback = true
  assert.equal(normalizePromptResults(marked).amazonSet.generatedByFallback, true)
})
