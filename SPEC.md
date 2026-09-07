# PageMint — 跨境电商图片工作台

## 1. 项目定位

- **产品名**: PageMint（原 Amazon Image Generation Agent）
- **类型**: Web 端 AI 商品图片生产与处理工作台（内部工具）
- **目标用户**: 跨境 / 电商平台卖家（Amazon 为主，逐步扩展 Temu 等平台）
- **核心能力**: 商品分析 → 提示词生成 → AI 生图，外加积分计费、历史回看与后台运营

## 2. 技术栈

- **框架**: Next.js 14（App Router）+ React 18 + TailwindCSS
- **后端**: Next.js API Routes（Server Components 直连 DB）
- **数据库**: PostgreSQL + Prisma ORM
- **文本 AI**: 数据库管理的 OpenAI 兼容 provider 池（按优先级 fallback），API Key 加密存储
- **图片 AI**: 远端 `amazon-image-worker` 服务，异步提交 + 回调 + 前端轮询
- **对象存储**: 腾讯云 COS（参考图与成品图）
- **邮件**: Resend（注册验证码）
- **支付**: ZPay（支付宝 / 微信扫码）

## 3. 用户侧工作流

| 路由 | 说明 | 计费场景 |
| --- | --- | --- |
| `/` | 工作流入口页 | - |
| `/amazon` | 商品分析 → 提示词 → 整套 listing 图 / 单张图 / A+ 模块图 | Amazon 分析成功 5/次、普通图片成功 10/张；A+ 分析成功 5/次、A+ 图片成功 15/张 |
| `/playground` | 单张自由生成（提示词 + 参考图 + 尺寸） | `playground` 10/张 |
| `/compliance` | 上传 1–6 张图片后，按 Amazon / Temu 和美国 / 澳大利亚市场做四类图片合规与视觉 IP 风险初筛 | - |
| `/history` | 生成历史与分析记录回看 | - |
| `/points` | 积分中心：余额、账单、兑换码、充值、邀请返励 | - |
| `/login` `/register` | 登录注册（邮箱验证码） | - |

**首页占位中的规划入口**（`src/app/page.tsx` 的 `upcomingEntries`）：
做 Temu 图片、1688 / 拼多多链接生图、图片处理工具箱（抠白底 / 精修 / 多平台尺寸适配 / 图内文案翻译）。

## 4. 后台（`/admin`）

工作台、用户管理、积分与充值（订单结算 / 积分包）、登录公告、AI 操作审计、生图记录、Provider 管理（文本线路）、兑换码。

## 5. 核心机制

### 文本 AI provider 池
- `TextProvider` 表按 `priority` 排序，请求时从上到下 fallback（`src/lib/text-providers.ts` + `text-model.ts`）
- API Key 使用 `PROVIDER_KEY_ENCRYPTION_KEY` AES 加密落库，接口只回写 key（`src/lib/crypto.ts`）
- 每次调用写入 `AiOperation` / `AiOperationAttempt` 审计（30 天过期字段，暂无清理任务）

### 图片生成链路
- 提交：`/api/generate`（同步）或 `/api/generate/stream`（SSE），请求落库为 `ImageGenerationRequest`
- 提交到远端 worker：无参考图走 `/v1/async/images/generations`，带参考图走 `/v1/async/images/edits`（`src/lib/image-worker-client.ts`）
- 完成回调：`POST /api/image-worker/callback/[requestId]`（签名校验），前端通过 `GET /api/generate/[requestId]` 轮询
- 参考图先上传 COS（`src/lib/cos.ts` + `reference-images.ts`）
- 积分在图片任务成功时扣减（`debitPointForGeneration`），失败不扣费；整套 Amazon 生成按成功图片数量逐张计费，余额不足直接拒绝提交

### 积分体系
- 展示积分 = 内部积分 / 10（`POINTS_SCALE`，`src/lib/points-config.ts`）
- 新积分口径为 1 积分 = 0.01 元；默认充值套餐为 5 元 / 500 积分、25 元 / 2500 积分、100 元 / 10500 积分
- Amazon 初始分析和 A+ 分析均在成功保存结果后各扣 5 积分，分析失败不扣费；分析流水复用现有 `GENERATION_DEBIT` 类型并通过 metadata 区分场景，不新增数据库枚举或迁移
- 流水 `PointsLedgerEntry` 带幂等键；支持兑换码、ZPay 充值（`/api/points/payment-orders/*` + 支付回调）、注册 / 邀请奖励
- 已知缺口：生图失败退款（`refundPointForFailedGeneration`）尚未接入调用方

### 认证
- 邮箱 + 密码（bcrypt），会话为 opaque token cookie，库内只存哈希（`src/lib/auth.ts`）
- 注册需邮箱验证码（Resend 发送，`email-verification.ts`）
- 角色：`ADMIN` / `USER`，管理员访问 `/admin/*`（`requireAdmin`）

## 6. API 一览

- 分析：`POST /api/analyze/stream`、`POST /api/analyze/prompts`、`GET /api/analyze/[analysisId]`
- 合规：`POST /api/compliance/scan`（1–6 张图片 + 平台 + 市场 + 图片角色，返回四类初筛结果）
- 生图：`POST /api/generate`、`POST /api/generate/stream`、`GET /api/generate/[requestId]`
- Worker 回调：`POST /api/image-worker/callback/[requestId]`
- 下载：`GET /api/download`
- 认证：`/api/auth/login`、`/api/auth/logout`、`/api/auth/register`、`/api/auth/register/send-code`
- 历史：`GET /api/history`、`GET /api/history/analysis/[id]`、`GET /api/history/images/[id]`
- 积分：`GET /api/points`、`POST /api/points/redeem`、`GET|POST /api/points/payment-orders`、`POST /api/points/payment-orders/order`、`POST /api/points/payment-orders/notify`
- 后台：`/api/admin/*`（公告、生图记录、订单结算、积分包、兑换码、text-providers CRUD / 排序 / 启停 / key）

## 7. 数据模型（`prisma/schema.prisma`）

`User`、`AnalysisRecord`、`ImageGenerationRequest`、`PointsLedgerEntry`、`PointsPackage`、`RedemptionCode`、`PaymentOrder`、`TextProvider`、`EmailVerificationCode`、`Announcement`、`AiOperation`、`AiOperationAttempt`

## 8. 环境变量

见 `.env.example`：`DATABASE_URL`、`APP_SECRET`、`PROVIDER_KEY_ENCRYPTION_KEY`、`APP_BASE_URL`、`IMAGE_WORKER_BASE_URL` / `IMAGE_WORKER_API_KEY` / `IMAGE_WORKER_TIMEOUT_MS`、`RESEND_API_KEY` / `RESEND_FROM`、`COS_*`、`ADMIN_EMAIL` / `ADMIN_PASSWORD`（seed 用）。图片合规的 `PANGOL_SCRAPEAPI_API_KEY`（外观专利 WIPO 检索，Pangol ScrapeAPI）为可选；未配置时接口会返回检索不完整状态，不影响平台图片体检。

## 9. 常用脚本

```bash
npm run dev                  # 本地开发
npm run build                # prisma generate + next build
npm run db:migrate:deploy    # 应用迁移（部署时）
npm run db:push              # 开发期直接推 schema
npm run db:seed              # 初始化管理员
npm run text-provider:upsert # 运维：写入文本 provider
```

## 10. 约定与历史决定

- 反推提示词（以图生提示词）工作流已下线：页面、API、计费场景、审计类型与数据库记录均已移除（迁移 `20260901090000_remove_reverse_prompt_workflow`）
- 平台差异化（尺寸、合规规范）的规划方向是做成工作流内的"平台规格层"，而不是每个平台一个入口
- 新增首页入口：正式入口加进 `entries` 数组，未上线的占位卡放 `upcomingEntries`
