# SOP 06 — 桌面端打包与 Release 发布

> 2026-10-02 当前构建入口已换成 `scripts/performance/build-desktop-staging.mjs`。
> 每次创建独立的 `.next-desktop-*`、`artifacts/performance/desktop-stage-*` 与
> `dist-desktop-staged-*`；旧 `scripts/build-desktop.mjs` 需要显式危险参数才可运行，
> 不再是默认入口。下文涉及旧 `dist-desktop/` 和旧脚本的历史事故分析可作排障参考；
> 产物路径、命令与验收以本节及当前 `package.json` 为准。

2026-10-11 按当前源码复核：主进程密钥 IO 位于 electron/keyStorage.cjs，electron/**/* 收入运行模块并排除 *.test.*。本机 loopback 端口维持 35349，已有数据的 origin 保持；应用状态、资源和秘密归属由当前代码与验证报告确定。

当前在线档：`pnpm run desktop:build` 会完成独立 Next 构建、资源白名单复制、pnpm 依赖实体化、
`electron-builder --win --publish never` 和包内静态资源/EXE SHA-256 核对。
离线学科档先执行 `pnpm run desktop:build:staged -- --offline --subjects=probability`，
确认暂存报告与专属索引后，用报告给出的私有 YAML 配置执行不发布打包。
离线档只预渲染选定学科，复制其正文、图片、已登记本地视频，并从全局索引离线裁出对应学科的
BM25/向量；未选学科路由、正文与导航入口不可用。构建不复制 `.env*`、embed-cache、旧项目或旧安装包。
打包完成仍须在允许启动桌面程序的环境里验证实际 Electron 启动、离线播放、公式与交互；
本机结构检查不能替代这一步。

## 适用场景

将 StudySolo 打包为 Windows 桌面 exe。打包、结构检查、实际启动与 GitHub Release 发布是独立步骤，执行范围由当次人类任务确定。现有 Gailvlun 包名、artifact 名称及存储 origin 保持代码约定。

> 架构定论（**历史**）：EdgeOne Pages 因 SSR 云函数 128MiB 硬限无法承载本应用，已改为自托管 Node + Electron 桌面 exe。旧的 tmpfs 清理脚本在 `scripts/legacy/`。检索索引随 `content/.index/` 打进桌面包，运行时不再从 COS 回退。本 SOP 只覆盖桌面打包链路。

## 架构速览

- **运行模型**：Electron 主进程 spawn 内置 Next standalone 服务（ELECTRON_RUN_AS_NODE=1），BrowserWindow 使用固定 127.0.0.1:35349。端口占用会报告失败，不能换随机端口导致 IndexedDB/localStorage 更换 origin。
- **密钥模型**：首启要求自由中转的 URL/API Key/模型 ID；SiliconFlow、MiMo、Zhipu、Unsplash 为可选。keyStorage.cjs 维护 userData/keys.enc 与 custom-api-secrets.enc；safeStorage 可用时使用 OS 加密，其他平台沿用现有 JSON 回退和文件权限处理。用户秘密不进入安装包；config.js 是非密配置，serverEnvironment 保留操作者凭据剥离边界。
- **关键文件**：`scripts/performance/build-desktop-staging.mjs`(当前构建编排)、`scripts/performance/runtime-asset-inventory.ts`(白名单)、`electron-builder.yml`(模板)、`electron/main.js`(主进程)、`electron/config.js`(烘焙非密配置)、`next.config.mjs`(`BUILD_STANDALONE` 开关)。

## 输入物料

| 物料 | 说明 |
|------|------|
| 源码（master 或特性分支） | 已通过 `tsc --noEmit`，功能/内容就绪 |
| 已注册的内容 | 新增板块须先按 SOP 01–05 完成 + manifest 注册（见 05-content-integration） |
| gh CLI 登录态 | `gh auth status` 含 `repo` scope（建 release + 推送） |
| 桌面依赖 | `electron` / `electron-builder`（package.json devDeps，CN 镜像见 build-desktop） |

---

## 🔴 三条不可违背的不变量（血泪经验，违反则 exe 启动即崩或泄密）

### 不变量 1：node_modules 必须真正进包（双层坑，缺一不可）

桌面 exe「启动报 `Next 服务启动超时`（安装版）/ `未找到 server.js`（便携版）」的根因有**两层**，两个修复都已内置，改打包流程时**不可移除任一**：

1. **electron-builder 默认忽略剔除 node_modules**：其默认 ignore 含 `!**/node_modules/**`，会把 `extraResources` 里的 `node_modules` **整个剔除**（与 symlink 无关，即便是真实文件也丢）。
   → `electron-builder.yml` **必须有第二条 extraResources，以 `node_modules` 目录自身为 `from`**（其相对路径不含 `node_modules` 段，故绕过忽略）：
   ```yaml
   extraResources:
     - from: .next/standalone
       to: standalone
     - from: .next/standalone/node_modules     # ← 关键第二条，缺它包内 node_modules 为空
       to: standalone/node_modules
   ```
2. **pnpm 的 standalone node_modules 是符号链接农场**：顶层 `next`/`react` 是指向仓库 `.pnpm` 的**绝对** symlink，Windows 复制不可靠；而 `cpSync(dereference)` 拍平又会**破坏 pnpm 解析**（包依赖在 `.pnpm/<pkg>/node_modules/` 下是**兄弟**非嵌套，拍平顶层 `next` 后找不到兄弟 `@swc/helpers` → `Cannot find module '@swc/helpers'`）。
   → 当前 staging builder 从 traced `.pnpm` 将各主包复制到**新的**顶层真实目录，原输出与旧包均不删除；不可只拍平少数顶层 symlink。

### 不变量 2：两道护栏，绝不跳过

当前 staging builder 在打包前核对 `server.js`、实体化 `node_modules/next`、Worker 与索引，
打包后由 `perf:package-check` 核对实际 `win-unpacked/resources/standalone/` 和两个 EXE 的 SHA-256。
Next 的 dist/node_modules 下可能出现指向 pnpm 的嵌套包链接；standalone-shell 在白名单复制阶段解引用为真实文件，顶层依赖仍由原 materialize 阶段处理。Windows 验收包含目录 junction 夹具和实际暂存/包检查。
**发布前还必须实际启动打包后的程序并检查 `/` 与离线功能**；结构断言不证明运行成功。

### 不变量 3：密钥绝不进包，公开发布前必扫描

用户秘密位于 userData，OS 加密及既有回退由 keyStorage 实现。发布到公开仓库 Release 前必须：
- 扫产物无密钥：`find dist-desktop/win-unpacked -iname "*.env*" -o -iname "keys.enc"`（应空）。
- 扫 standalone 无明文密钥：grep `sk-` / `AI_API_KEY=` / `Bearer <token>`（应空）。
- 确认 `electron/config.js` 只放**非密** URL/模型名。

---

## 步骤流程

### Step 0 — 预检
```bash
gh auth status                      # 含 repo scope
git status                          # 确认待打包改动 / 当前分支
npx tsc --noEmit                    # 必须 0 错误
```
- 带新内容时：确认 manifest 已注册、内容文件 UTF-8 无 BOM。
- 决定**版本号与分支策略**（见下「版本与更新策略」）。

### Step 1 — 构建
```bash
pnpm run desktop:build
```
脚本顺序：Worker/内容/索引闸门 → 隔离 `next build`(BUILD_STANDALONE=1) → 严格白名单暂存静态资源与正文 → 在新目录实体化 `.pnpm` 依赖 → `electron-builder --win --publish never`(portable+nsis) → 实际包内依赖与 SHA-256 静态检查。不会触碰旧 `dist-desktop/`。

必须保存输出 JSON 的 `stageRoot`、`packageDir`、`fileCount`，以及
`artifacts/performance/package-online-check.json` 或 `package-offline-check.json`。
`packaged=true` 且 `perf:package-check` 退出 0 才是包内结构通过；真实启动仍单独验收。

### Step 2 — 产物定身验证（最确凿）
```bash
ls -la dist-desktop-staged-<id>/*.exe           # 使用刚返回的 packageDir
# 直接启动「打包产物」里的 standalone，确认能服务：
node -e '...spawn <packageDir>/win-unpacked/resources/standalone/server.js, 轮询 / 期望 200...'
ls <packageDir>/win-unpacked/resources/standalone/node_modules/next/package.json   # 应存在
```
> 经验：仅验源 standalone 不够——一定要验**打包后**那份（exe 里真正要跑的），本会话两次靠它发现问题。

### Step 3 — 安全扫描（公开发布前强制，见不变量 3）

### Step 4 — 版本、分支与推送
```bash
git checkout master && git merge --ff-only <feature-branch>   # 如在特性分支
git tag -a vX.Y.Z -m "桌面版 vX.Y.Z：……"
git push origin master && git push origin vX.Y.Z
```

### Step 5 — 校验值（业界规范）
```bash
sha256sum dist-desktop/Gailvlun-setup-X.Y.Z.exe dist-desktop/Gailvlun-portable-X.Y.Z.exe
```
记录两个 SHA256，写进 Release notes。

### Step 6 — Release Notes
写 `dist-desktop/RELEASE_NOTES.md`（该目录 gitignored），按**附录模板**填：简介 / 下载选择表 / 系统要求 / 首次填 3 密钥(加密本地·不进包) / 未签名 SmartScreen 提示 / 功能亮点 / 修订记录 / SHA256。

### Step 7 — 发布
```bash
# 新建：
gh release create vX.Y.Z --target master --title "Gailvlun 桌面版 vX.Y.Z（Windows）" --notes-file dist-desktop/RELEASE_NOTES.md
# 原地更新（已存在的 release）：
gh release edit vX.Y.Z --notes-file dist-desktop/RELEASE_NOTES.md
# 上传资源（2.3GB+，务必后台跑）：
gh release upload vX.Y.Z dist-desktop/Gailvlun-setup-X.Y.Z.exe dist-desktop/Gailvlun-portable-X.Y.Z.exe --clobber
```

### Step 8 — 发布后验证
```bash
gh release view vX.Y.Z --json assets -q '.assets[] | "\(.name) \(.size) \(.updatedAt)"'
```
确认两个 exe **大小=本地、updatedAt 新**。

---

## 版本与更新策略（决策表）

| 情况 | 版本号 | tag | Release |
|------|--------|-----|---------|
| 新功能 / 新内容 | minor/patch bump `package.json.version` | 新 tag | 新建 release |
| **紧急 bug 修复**（旧版刚发布、基本无下载、已破损） | 保持版本，原地更新 | `git tag -f vX.Y.Z` 移到修复 commit + `git push -f origin vX.Y.Z` | `gh release edit` + `upload --clobber` |
| 正式里程碑 | semver | 新 tag | 新建 release |

> **force-move tag 仅用于刚发布的破损版本**（无下游依赖时低风险，保证 tag↔二进制一致）；否则一律发新版本号，不要乱移已被人下载的 tag。本会话 v0.1.0 即因首发版有两个 bug，采用「原地更新 + force-move tag + clobber 资源」。

## 产物规范

| 文件 | 路径 | 大小 | 说明 |
|------|------|------|------|
| 安装版 | `dist-desktop/Gailvlun-setup-X.Y.Z.exe` | ~1.5 GB | NSIS，装一次秒启，**日常推荐** |
| 便携版 | `dist-desktop/Gailvlun-portable-X.Y.Z.exe` | ~800 MB | 自解压到 `%TEMP%`，每次启动慢/脆，次选 |
| 解包目录 | `dist-desktop/win-unpacked/` | — | 验证用，不分发 |

`dist-desktop/` 已 `.gitignore`，exe 不进 git。

## 常见故障速查（本项目实测）

| 症状 | 根因 | 处理 |
|------|------|------|
| exe 启动「Next 服务启动超时」 | 包内 node_modules 缺失/损坏 | 查 `electron-builder.yml` 第二条 extraResources + `build-desktop` hoist；两道护栏会提前抓到 |
| 便携版「未找到 server.js」 | standalone 不完整（同上） | 同上 |
| `Cannot find module '@swc/helpers'` | 用了 deref 拍平 node_modules（破坏 pnpm 兄弟依赖） | 改用 hoist（`materializeNodeModules`），**勿 deref** |
| 桌面浏览器白屏 | webview 无 `display:flex`/绝对定位塌成 0 高 | 见 `components/browser/BrowserTab.tsx` 的 `WebviewSite`（绝对铺满 + display:flex + 失败可视化） |
| 划词浮窗接口 400 `20015 System message must be at the beginning` | 给请求拼了多条 system（Qwen 只允许一条在最前） | `app/api/chat/route.ts` 合并为单条 system |
| 子智能体「carpool quota exhausted / Overloaded」 | 服务端临时限流（非用量超限） | 等几分钟重试失败项；产物多半已落盘，**先校验再补**，勿盲目重跑全部 |
| 上传卡很久 | 2.3GB 走上行带宽 | 正常，后台跑 + `gh release view` 确认 |

## 自动化脚本与配置清单

| 文件 | 角色 |
|------|------|
| `scripts/performance/build-desktop-staging.mjs` | 当前端到端构建（新stage、白名单、实体依赖、包内静态检查） |
| `scripts/build-desktop.mjs` | 旧实现，默认禁用；保留供历史事故对照 |
| `electron-builder.yml` | **extraResources 两条目（关键）**、portable+nsis target、asar |
| `electron/main.js` | spawn standalone、首启密钥门、`webviewTag`、启动诊断（子进程提前退出带 stderr 立即 reject） |
| `electron/config.js` | 烘焙非密配置（改端点/模型在此，**勿放密钥**） |
| `next.config.mjs` | `BUILD_STANDALONE=1` 才产出 standalone（Web/EdgeOne 构建不受影响） |

## 参考文件

- [00-infrastructure.md](./00-infrastructure.md) — 环境变量规范
- [05-content-integration.md](./05-content-integration.md) — 打包前内容须先注册并验证
- `electron/README.md` — 桌面架构与本地构建/使用说明
- `scripts/performance/build-desktop-staging.mjs` / `electron-builder.yml` / `electron/main.js` — 当前实现真相源

---

## 附录：Release Notes 模板

```markdown
**Gailvlun · 期末复习工作站** 的 Windows 桌面版。多学科学习应用（笔记/正文、AI 助教、Manim 视频、交互演示、内置浏览器、题库），本地离线使用，功能与网页版一致。

## 下载
| 文件 | 适合 | 大小 |
|---|---|---|
| **Gailvlun-setup-X.Y.Z.exe** | 多数用户（安装版，秒启） | ~1.5 GB |
| **Gailvlun-portable-X.Y.Z.exe** | 免安装（单文件，启动稍慢） | ~800 MB |

**系统要求**：Windows 10 / 11（64 位）。

## 首次运行
填 3 个 API 密钥：硅基流动（必填）、小米 MiMo / 智谱（可选）。密钥经 Windows DPAPI 加密存本机，**绝不打进安装包、绝不上传**。

## ⚠️ 未签名说明
二进制未签名，SmartScreen 可能拦截 → 点「更多信息 → 仍要运行」；介意者用下方 SHA256 校验。

## 功能亮点 / 修订记录
- …（本版改了什么）

## SHA256 校验
\`\`\`
<sha256>  Gailvlun-setup-X.Y.Z.exe
<sha256>  Gailvlun-portable-X.Y.Z.exe
\`\`\`
校验（PowerShell）：`Get-FileHash .\Gailvlun-setup-X.Y.Z.exe -Algorithm SHA256`
```
