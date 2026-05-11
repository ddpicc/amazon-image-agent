# Amazon Image Agent

AI 驱动的亚马逊产品图片生成工具。通过分析产品信息，使用 Claude AI 生成优化的图片提示词，再由 GPT-Image 生成专业的产品图片。

## 功能特性

- **智能分析**: 使用 Claude AI 分析产品描述，提取卖点和视觉元素
- **多风格生成**: 支持 4 种图片风格（写实、插画、白底、生活方式）
- **批量生成**: 一次生成 3 张不同角度的产品图片
- **历史记录**: 保存生成历史，方便回顾和复用
- **一键导出**: 支持下载图片和复制提示词

## 技术栈

- **前端**: Next.js 14 + React + TailwindCSS
- **文本模型**: OpenAI-compatible text model
- **图片生成**: OpenAI-compatible image model

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local`，并填入你的模型配置：

```bash
cp .env.example .env.local
```

编辑 `.env.local`:

```env
TEXT_KEY=your_text_api_key_here
TEXT_URL=https://www.uocode.com/v1
TEXT_MODEL=gpt-5.4

IMAGE_KEY=your_image_api_key_here
IMAGE_URL=https://www.uocode.com/v1
IMAGE_MODEL=gpt-image-2
```

### 3. 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看应用。

## 使用流程

1. **输入产品信息**: 填写产品名称、描述、选择类别和目标受众
2. **AI 分析**: 点击"分析并生成图片"，Claude 会分析产品并生成提示词
3. **选择风格**: 根据需要选择图片风格
4. **生成图片**: 系统使用 GPT-Image 生成 3 张产品图片
5. **导出使用**: 下载图片或复制提示词用于其他用途

## 项目结构

```
src/
├── app/
│   ├── page.tsx              # 主页面
│   ├── layout.tsx            # 根布局
│   └── api/
│       ├── analyze/route.ts  # Claude 分析接口
│       └── generate/route.ts # 图片生成接口
├── components/
│   ├── ProductInput.tsx      # 产品信息输入表单
│   ├── ImageGrid.tsx        # 图片展示网格
│   ├── HistorySidebar.tsx    # 历史记录侧边栏
│   └── LoadingSpinner.tsx   # 加载动画
└── lib/
    ├── anthropic.ts          # Claude API 客户端
    └── openai.ts            # OpenAI API 客户端
```

## API 接口

### POST /api/analyze

分析产品并生成图片提示词。

**请求体**:
```json
{
  "productName": "Wireless Bluetooth Headphones",
  "description": "High-quality noise-canceling headphones...",
  "category": "Electronics",
  "targetAudience": "Young Adults (18-25)"
}
```

**响应**:
```json
{
  "analysis": "产品分析文本...",
  "imagePrompts": ["提示词1", "提示词2", "提示词3"],
  "visualElements": ["元素1", "元素2"]
}
```

### POST /api/generate

使用 GPT-Image 生成图片。

**请求体**:
```json
{
  "prompt": "图片提示词",
  "style": "realistic"
}
```

**响应**:
```json
{
  "imageUrl": "https://...",
  "revisedPrompt": "优化后的提示词"
}
```

## 图片风格

| 风格 | 描述 |
|------|------|
| `realistic` | 写实风格，专业产品摄影 |
| `illustrated` | 数字插画风格 |
| `white-bg` | 纯白背景，电商标准 |
| `lifestyle` | 生活场景，情感营销 |

## 获取 API Keys

- **文本服务**: 配置在 `TEXT_URL` / `TEXT_MODEL`
- **图片服务**: 配置在 `IMAGE_URL` / `IMAGE_MODEL`

## License

MIT
