# 光影集

一个部署在 Cloudflare Workers 上的响应式图片与视频画廊。访客可以拖放或批量选择文件，上传完成后内容会按照原始比例自动排列。

## 已实现

- 图片与视频批量上传、实时进度和错误提示
- R2 流式保存文件，D1 保存媒体资料
- 图片/视频筛选与响应式瀑布流排版
- 视频 Range 请求，支持拖动进度条和断点读取
- 文件格式、大小与响应头安全检查
- 首次访问时自动初始化 D1 表；同时保留 Drizzle 迁移文件
- 独立的公开画廊与上传工作区
- 自定义收藏夹名称、简介和封面
- 按收藏夹、日期、图片与视频分类浏览
- 管理员审核制账号、加密密码和安全会话

## 从 GitHub 接入 Cloudflare

先在 Cloudflare 控制台创建以下资源：

- D1 数据库：建议命名为 `yys-media-db`
- R2 存储桶：建议命名为 `yys-media-files`

然后在 Workers & Pages 中选择 **Import a repository**，连接本仓库，并配置：

- 构建命令：`pnpm run build`
- 部署命令：`pnpm run deploy`
- 根目录：留空（仓库根目录）

在 Worker 的 **Settings → Builds → Build variables** 中添加：

| 变量 | 值 |
| --- | --- |
| `CLOUDFLARE_WORKER_NAME` | Cloudflare 控制台中的 Worker 名称 |
| `CLOUDFLARE_D1_DATABASE_NAME` | `yys-media-db`（或实际名称） |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 详情页中的 Database ID |
| `CLOUDFLARE_R2_BUCKET_NAME` | `yys-media-files`（或实际名称） |

应用使用固定绑定名：D1 为 `DB`，R2 为 `FILES`。构建后生成的 Wrangler 配置会读取以上变量。

## 初始化管理员和登录系统

首次成功部署后，进入 Worker 的 **Settings → Variables and Secrets**，添加：

| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `ADMIN_SETUP_TOKEN` | Secret | 至少32位的随机初始化令牌 |
| `TURNSTILE_SITE_KEY` | Text | Turnstile 前端站点密钥，可稍后配置 |
| `TURNSTILE_SECRET_KEY` | Secret | Turnstile 服务端密钥，可稍后配置 |

保存变量后访问 `/setup`，输入初始化令牌并创建第一个管理员。创建成功后应删除或更换 `ADMIN_SETUP_TOKEN`。其他用户从 `/register` 提交申请，管理员在 `/admin/users` 审核；只有状态为“已通过”的账号能够进入 `/upload`。

若启用 Turnstile，站点密钥和服务端密钥必须同时配置。项目启用了 `keep_vars`，后续 Git 自动部署会保留控制台中的运行时变量与密钥。

## 上传限制

当前单个文件上限为 95 MB，兼容 Cloudflare Free/Pro 方案的 100 MB 请求体限制。支持 JPEG、PNG、WebP、GIF、AVIF、MP4、WebM、MOV 与 OGV。

目前上传入口按需求对访客开放。若网站会公开推广，建议在上线前增加 Cloudflare Turnstile、登录验证或上传口令，避免第三方滥用存储空间。

## 常用命令

```bash
pnpm install
pnpm run build
pnpm run deploy
```

技术栈：Vinext、React、Cloudflare Workers、D1、R2、Tailwind CSS。
