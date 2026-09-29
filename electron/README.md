# Gailvlun 桌面版 (Electron)

把整个 Next.js 应用打包成 Windows 桌面 .exe，功能与本地 `pnpm start` **完全一致**。
设计为「Route A」：Electron 主进程在启动 Next standalone 服务**之前**，把用户填的
API 密钥作为环境变量注入。**Next 应用代码零改动。**

## 密钥与配置的边界

- **用户自填的密钥**（加密存于 `userData/keys.enc`，**绝不进安装包**）：
  - `RELAY_BASE_URL` / `RELAY_API_KEY` / `RELAY_MODEL_ID`（自由中转，必填）— 任意 OpenAI 兼容网关，不必使用项目默认中转站
  - `AI_API_KEY`（硅基流动，可选）— 生图 / 语义搜索 embedding+rerank
  - `MIMO_API_KEY`（小米 Token Plan，可选）— MiMo 模型
  - `ZHIPU_API_KEY`（智谱，可选）— 联网搜索 / 向量容灾
  - `UNSPLASH_ACCESS_KEY`（Unsplash，可选）— 对话配图 / 图片搜索
  - **升级补填**：老用户升级后无需重装、也无需找文件——`keys.enc` 是 DPAPI 加密的二进制，
    不可手改。打开「应用 → API 密钥设置…」，已存的密钥会自动带出，只需在新增栏补填后
    「保存并启动」即热生效。新增一个密钥 = 在 `main.js` 的 `KEY_NAMES`、`startServer` 注入、
    `setup.html` 各加一处，其余流程自动复用。
- **内置的非密钥配置**（见 `electron/config.js`，可安全打进 exe）：固定本地端口 `APP_PORT: 35349`（与 `package.json` 的 `dev`/`start` 一致，保证网页端与桌面端同源）、base URL、模型名、
  reasoning 字段、embedding/rerank 模型、search mode、视频 CDN。

## 离线 / 在线

- **完全离线**：内容页（SSR/KaTeX/高亮）、笔记、BM25 关键词搜索、Quiz、图片、进度（IndexedDB）。
- **需联网 + 对应 key**：AI 对话、向量/混合语义搜索、联网搜索、视频播放（CDN 流）。

## 构建

```bash
pnpm install            # 含 electron / electron-builder
pnpm run desktop:build  # 1) next build (standalone) 2) 拷 static/public/content(含307MB索引) 3) electron-builder
```

产物在 `dist-desktop/`：

- `Gailvlun-portable-<version>.exe` —— 免安装单文件，双击即用（每次启动自解压，稍慢）。
- `Gailvlun-setup-<version>.exe` —— NSIS 安装版，装一次后秒启（推荐日常使用）。

## 本地联调（不打包，验证启动链路）

```bash
# 先产出 standalone 并补齐资源（等同 desktop:build 的前两步）
BUILD_STANDALONE=1 pnpm exec next build
node -e "const{cpSync}=require('fs');cpSync('.next/static','.next/standalone/.next/static',{recursive:true});cpSync('public','.next/standalone/public',{recursive:true});cpSync('content','.next/standalone/content',{recursive:true})"
pnpm run desktop:dev    # electron . —— 走真实主进程：弹密钥设置 → 起 server → 开窗
```

## 工作原理（简）

1. `main.js` 读取/收集密钥（`KEY_NAMES`，`safeStorage` DPAPI 加密）。
2. 以 `ELECTRON_RUN_AS_NODE` 用 Electron 自带 Node 跑 `.next/standalone/server.js`，
   `cwd` 设为 standalone 目录（应用用 `process.cwd()` 读 `content/`），注入 env + **固定端口 35349**（`electron/config.js` 的 `APP_PORT`；端口变了 origin 就变，本地数据会被孤立，因此绝不随机换端口）。
3. 轮询端口就绪后开 `BrowserWindow` 加载 `127.0.0.1:PORT`。
4. 「应用 → API 密钥设置」可改密钥，保存后自动重启 server 并刷新（因 `provider.ts`
   在模块加载时读 env，密钥变更需重启服务进程）。

## 备注

- 未做代码签名：首次运行 Windows SmartScreen/杀软可能提示，「仍要运行」即可（或后续配置签名）。
- 图标可选：放 `build/icon.ico` 后在 `electron-builder.yml` 取消 `icon` 注释。
- `next.config.mjs` 仅当 `BUILD_STANDALONE=1` 才切到 standalone + 关图片优化，**不影响本地 / 自托管 Web 构建**。检索索引随 `content/.index/` 打进包内，运行时只读本地、不从远端回退（见 `docs/sop/10-search-index-lifecycle.md`）。
