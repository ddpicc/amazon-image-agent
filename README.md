# PageMint

面向 Amazon listing 的多用户图片生产工具。当前版本支持：

- 登录注册与多用户隔离
- 商品分析与 Prompt 套餐生成
- Amazon 工作流与自由生图页
- 通过 `amazon-image-worker` 统一中转图片生成
- 生图结果统一上传腾讯云 COS
- 用户历史页与管理员生图调用记录页

## 当前架构

- 前端：Next.js 14 + React + TailwindCSS
- 数据库：PostgreSQL + Prisma
- 认证：邮箱密码 + 数据库 session
- 文本分析：OpenAI-compatible text provider pool
- 图片生成：本地建单 + 远端 `amazon-image-worker`
- 图片存储：Tencent Cloud COS

## 核心能力

- `/amazon`
  - 上传商品信息和参考图
  - 先跑分析，再生成 Prompt 套餐，再做单张或整套图
- `/playground`
  - 独立测试提示词、尺寸、比例和参考图
- `/history`
  - 普通用户查看自己的分析记录和生图记录
- `/admin/image-records`
  - 管理员查看全站生图调用日志、命中 provider、耗时、状态和产出图片

## 环境变量

复制 `.env.example` 为 `.env.local`：

```bash
cp .env.example .env.local
```

必填变量说明：

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/amazon_image_agent

# App secrets
APP_SECRET=replace_with_a_long_random_secret
PROVIDER_KEY_ENCRYPTION_KEY=replace_with_a_second_long_random_secret

# Remote image worker bridge
IMAGE_WORKER_BASE_URL=https://your-image-worker.example.com
IMAGE_WORKER_API_KEY=worker_api_key_for_agent
IMAGE_WORKER_TIMEOUT_MS=15000

# Resend email
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM=noreply@your-domain.com

# Tencent COS
COS_SECRET_ID=your_cos_secret_id
COS_SECRET_KEY=your_cos_secret_key
COS_REGION=ap-guangzhou
COS_BUCKET=your-bucket-name
COS_PUBLIC_BASE_URL=https://your-bucket-name.cos.ap-guangzhou.myqcloud.com

# Optional bootstrap admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change_me_please
```

说明：

- `APP_SECRET` 用于 session token 哈希
- `PROVIDER_KEY_ENCRYPTION_KEY` 用于加密数据库里的上游 provider key
- `IMAGE_WORKER_BASE_URL` 和 `IMAGE_WORKER_API_KEY` 用于把生图任务提交到 `amazon-image-worker`
- `RESEND_API_KEY` 和 `RESEND_FROM` 用于注册邮箱验证码发送
- 文本 provider 仍通过数据库维护
- 运行时不读取 `TEXT_KEY`、`TEXT_URL`、`TEXT_MODEL` 这类环境变量
- 图片 provider 改由 `amazon-image-worker` 自己维护
- 文本 provider 的 base URL、model、优先级和 key 仍通过脚本或后台写入

## 本地启动

### 1. 安装依赖

```bash
npm install
```

### 2. 生成 Prisma Client

```bash
npm run prisma:generate
```

### 3. 初始化数据库结构

```bash
npm run db:push
```

### 4. 初始化管理员账号

```bash
npm run db:seed
```

如果 `.env.local` 里配置了 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD`，这个步骤会创建或更新管理员账号。

### 5. 写入至少一个文本 provider

示例：

```bash
PROVIDER_NAME=text-primary \
PROVIDER_VENDOR=openai-compatible \
PROVIDER_BASE_URL=https://www.uocode.com/v1 \
PROVIDER_MODEL=gpt-5.4 \
PROVIDER_API_KEY=your_text_api_key \
PROVIDER_PRIORITY=100 \
PROVIDER_ENABLED=true \
npm run text-provider:upsert
```

如果你要加 backup provider，再执行一次，换一组名字、URL、model 和 key 即可。`PRIORITY` 越小优先级越高。

### 6. 启动开发服务器

```bash
npm run dev
```

默认打开 `http://localhost:3000`。

## 数据与路由说明

### 用户与权限

- 普通用户：
  - 可以使用 `/amazon` 和 `/playground`
  - 可以查看 `/history`
- 管理员：
  - 拥有普通用户全部能力
  - 可以查看 `/admin/image-records`

### 生图链路

`/api/generate` 现在的行为：

1. 校验登录态
2. 写入生图请求记录
3. 把任务提交到 `amazon-image-worker`
4. 当前页和 `/history` 轮询本地记录，本地再同步远端状态
5. 远端 worker 自己完成 provider fallback、出图和 COS 上传
6. agent 只保存本地历史、状态和积分

### 分析链路

- `/api/analyze/stream`
- `/api/analyze/prompts`

都会要求登录，分析结果会落库，供 `/history` 回看。
- 文本分析、Prompt 生成和反推提示词都从数据库读取 text provider，按优先级顺序 fallback。

## 常用脚本

```bash
npm run dev
npm run build
npm run prisma:generate
npm run db:push
npm run db:seed
npm run text-provider:upsert
```

## Zeabur 部署说明

下面是推荐的 Zeabur 部署顺序。

### 1. 创建 PostgreSQL 服务

在 Zeabur 项目里先创建 PostgreSQL，并拿到连接串，填到：

```env
DATABASE_URL=...
```

### 2. 配置应用环境变量

在应用服务里设置：

- `DATABASE_URL`
- `APP_SECRET`
- `PROVIDER_KEY_ENCRYPTION_KEY`
- `IMAGE_WORKER_BASE_URL`
- `IMAGE_WORKER_API_KEY`
- `IMAGE_WORKER_TIMEOUT_MS`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COS_REGION`
- `COS_BUCKET`
- `COS_PUBLIC_BASE_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

建议：

- `APP_SECRET` 和 `PROVIDER_KEY_ENCRYPTION_KEY` 都使用高强度随机字符串
- `COS_PUBLIC_BASE_URL` 使用你 bucket 的公网访问域名

### 3. 首次部署后初始化数据库

在 Zeabur Shell 或一次性 Job 中执行：

```bash
npm run prisma:generate
npm run db:push
npm run db:seed
```

### 4. 配置远端图片 worker

在 Zeabur 应用环境变量中配置：

```bash
IMAGE_WORKER_BASE_URL=https://your-image-worker.example.com
IMAGE_WORKER_API_KEY=worker_api_key_for_agent
IMAGE_WORKER_TIMEOUT_MS=15000
```

### 5. 写入文本 provider

在 Zeabur Shell 中执行一次或多次：

```bash
PROVIDER_NAME=text-primary \
PROVIDER_VENDOR=openai-compatible \
PROVIDER_BASE_URL=https://www.uocode.com/v1 \
PROVIDER_MODEL=gpt-5.4 \
PROVIDER_API_KEY=your_text_api_key \
PROVIDER_PRIORITY=100 \
PROVIDER_ENABLED=true \
npm run text-provider:upsert
```

再写 backup provider：

```bash
PROVIDER_NAME=text-backup-1 \
PROVIDER_VENDOR=openai-compatible \
PROVIDER_BASE_URL=https://backup.example.com/v1 \
PROVIDER_MODEL=gpt-5.4 \
PROVIDER_API_KEY=your_backup_text_key \
PROVIDER_PRIORITY=200 \
PROVIDER_ENABLED=true \
npm run text-provider:upsert
```

### 6. 启动命令

Zeabur 应用启动命令可保持：

```bash
npm run start
```

如果你的构建流程不是自动执行 install/build，确保部署流程里至少包含：

```bash
npm install
npm run build
```

### 7. 上线后检查

按这个顺序验证：

1. 能访问 `/register` 与 `/login`
2. 管理员账号能登录
3. 普通用户能进入 `/amazon` 和 `/playground`
4. 生图成功后返回的是 COS URL
5. `/history` 能看到自己的分析与生图记录
6. `/admin/image-records` 能看到 provider、上游 URL、尝试次数、耗时和结果图
7. `/admin/providers` 能管理文本 provider；图片 provider 在 `amazon-image-worker` 侧维护

## Provider 管理建议

当前版本支持两种维护方式：

- 管理员后台：`/admin/providers`
- 脚本维护：适合初始化或批量导入

推荐做法：

- `primary` 用主线路
- `backup-*` 用备用线路
- 通过 `PROVIDER_PRIORITY` 控制优先级
- 故障时文本链路会在单次请求内顺序 fallback

Key 存储策略：

- key 会先在应用层加密
- 数据库存的是密文，不是明文
- 管理后台只支持写入或轮换新 key，不会显示旧 key
- 解密依赖 `PROVIDER_KEY_ENCRYPTION_KEY`

## 迁移说明

当前版本已经移除 agent 本地图片执行主链路：

- 不再依赖本地 image provider 池
- 不再在本仓库内消费图片队列
- 图片生成统一通过 `amazon-image-worker` 执行
- 最终仍返回 COS URL

如果你之前的部署环境里还保留旧的 `IMAGE_PROXY_SECRET`，现在可以删除。

## License

MIT
