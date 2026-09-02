# 光影集

一个部署在 Cloudflare Workers 上的响应式图片与视频画廊。访客可以拖放或批量选择文件，上传完成后内容会按照原始比例自动排列。

## 已实现

- 图片与视频批量上传、实时进度和错误提示
- R2 流式保存文件，D1 保存媒体资料
- 图片/视频筛选与响应式瀑布流排版
- 视频 Range 请求，支持拖动进度条和断点读取
- 文件格式、大小与响应头安全检查
- 首次访问时自动初始化 D1 表；同时保留 Drizzle 迁移文件

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
