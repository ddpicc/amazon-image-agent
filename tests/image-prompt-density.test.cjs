const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const anthropic = fs.readFileSync(path.join(root, 'src/lib/anthropic.ts'), 'utf8')
const amazonClient = fs.readFileSync(path.join(root, 'src/app/amazon/AmazonPageClient.tsx'), 'utf8')

test('A+ fallback prompts define distinct medium-density module responsibilities', () => {
  assert.match(anthropic, /aplus-hero': .*1 个核心利益标题区和 1-2 个/)
  assert.match(anthropic, /aplus-transform': .*2-3 步连续动作、状态变化或结构关系/)
  assert.match(anthropic, /aplus-grid': .*不超过 3 个卖点分区、局部放大或结构标注/)
  assert.match(anthropic, /aplus-lifestyle': .*2-3 个来自商品事实的简短英文参数、利益标签或材质信息/)
})

test('Prompt generation caps copy and keeps information facts grounded', () => {
  assert.match(anthropic, /每张图最多 1 个短英文标题和 2-4 个短标签\/参数/)
  assert.match(anthropic, /只能来自商品描述、参考图或分析中已确认的事实/)
  assert.match(anthropic, /禁止长句、促销话术、虚构认证、夸张效果和无依据参数/)
  assert.match(anthropic, /主视觉之外至少加入一个有购买价值的辅助信息组件/)
})

test('Frontend directives preserve low-density responsibilities for main, size, and detail images', () => {
  assert.match(amazonClient, /这是整套图里的唯一白底主图，必须最优先保证合规/)
  assert.match(amazonClient, /这是整套图里的唯一尺寸图，重点建立大小、比例和摆放关系/)
  assert.match(amazonClient, /这是整套图里的唯一细节图，重点放大材质、纹理、做工或关键结构/)
  assert.match(amazonClient, /A\+ 使用中等信息密度/)
  assert.match(amazonClient, /卖点图一，只讲最强的 1-2 个核心卖点，可加入 2-3 个清晰的信息组件/)
})

