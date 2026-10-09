# SOP 06 — 桌面端打包与 Release 发布

> 2026-10-02 当前构建入口已换成 `scripts/performance/build-desktop-staging.mjs`。
> 每次创建独立的 `.next-desktop-*`、`artifacts/performance/desktop-stage-*` 与
> `dist-desktop-staged-*`；旧 `scripts/build-desktop.mjs` 需要显式危险参数才可运行，
> 不再是默认入口。下文涉及旧 `dist-desktop/` 和旧脚本的历史事故分析可作排障参考；
> 产物路径、命令与验收以本节及当前 `package.json` 为准。

当前在线档：`pnpm run desktop:build` 会完成独立 Next 构建、资源白名单复制、pnpm 依赖实体化、
`electron-builder --win --publish never` 和包内静态资源/EXE SHA-256 核对。
离线学科档先执行 `pnpm run desktop:build:staged -- --offline --subjects=probability`，
确认暂存报告与专属索引后，用报告给出的私有 YAML 配置执行不发布打包。
离线档只预渲染选定学科，复制其正文、图片、已登记本地视频，并从全局索引离线裁出对应学科的
BM25/向量；未选学科路由、正文与导航入口不可用。构建不复制 `.env*`、embed-cache、旧项目或旧安装包。
打包完成仍须在允许启动桌面程序的环境里验证实际 Electron 启动、离线播放、公式与交互；
本机结构检查不能替代这一步。

## 适用场景

将「期末复习工作站」打包为 **Windows 桌面 exe**，并**发布或更新** GitHub Release。适用于：新功能/新内容上线、紧急 bug 修复热更、正式里程碑发版。

> 架构定论（**历史**）：EdgeOne Pages 因 SSR 云函数 128MiB 硬限无法承载本应用，已改为自托管 Node + Electron 桌面 exe。旧的 tmpfs 清理脚本在 `scripts/legacy/`。检索索引随 `content/.index/` 打进桌面包，运行时不再从 COS 回退。本 SOP 只覆盖桌面打包链路。

## 架构速览

- **运行模型**：Electron 主进程 `spawn` 内置的 Next standalone 服务（`ELECTRON_RUN_AS_NODE=1`，用 Electron 自带 Node 跑 `server.js`），再开 BrowserWindow 指向 `127.0.0.1:PORT`。
- **配置模型**：首次启动不要求录入 AI Provider 密钥；无 AI 配置时，模型请求显示正常的未配置错误，正文、笔记和 Account 登录不受影响。用户自有配置通过主进程加密保存在固定的历史 Gailvlun userData 路径；构建不得注入 provider/account/运营密钥。云能力由固定远端 bridge 提供并需要网络，不宣称全部离线。
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
**发布前还必须实际启动打包后的程序并检查 `/` 与离线功能**；结构断言不证明运行成功。

### 不变量 3：密钥绝不进包，公开发布前必扫描

用户配置只保存在本机 DPAPI 加密数据目录。**发布到公开仓库 Release 前必须**：
- 扫产物无敏感配置：在 `dist-desktop-staged-<id>/win-unpacked` 中搜索 `*.env*`、`keys.enc` 与 `custom-api-secrets.enc`（应空）。
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

### Step 2 — 产物定身与真实启动验证（最确凿）

1. 使用构建 JSON 中的 `packageDir` 核对两个 `StudySolo-*.exe`、包内 `server.js`、`node_modules/next/package.json`、Worker 与索引。
2. Windows CI 从同一 source commit 执行 `pnpm build-index --bm25-only`，无需 provider/embedding 凭证，离线关键词检索可用，`vectorCount` 为零且没有预装语义向量；freshness 门禁仍对实际内容摘要执行完整核验。这不代表语义向量或 hybrid 检索通过。随后在干净 CI profile 中隔离 `APPDATA`、`LOCALAPPDATA`、`TEMP`，直接启动真实 `win-unpacked/StudySolo.exe --inspect=0`。CI-only Node inspector harness 只连接该子进程输出的 `127.0.0.1` inspector endpoint，通过真实 BrowserWindow DOM 检查 `/agent` 登录提示、guest Stop 按钮缺失和默认约 60% dock；截图上传为 CI artifact。从 BrowserTab 打开本机 StudySolo 测试路径，验证 Electron `<webview>` 原生缩放、100% 重置和菜单刷新。随后调用 app quit、确认本地端口释放，并以同一隔离 profile 关闭后重开；userData 必须落到临时根下的 `Gailvlun`，不得读取或复制真实用户目录。
3. 空白 profile 不注入 key；首屏可以打开，AI 未配置时应显示普通配置错误。Provider call、Account operator key 和云凭据均不得进入构建或 smoke job。

仅检查独立 `server.js` 不足以代替这项 Electron 启动测试。

### Step 3 — 安全扫描（公开发布前强制，见不变量 3）

### Step 4 — 版本、分支与推送
```bash
git checkout master && git merge --ff-only <feature-branch>   # 如在特性分支
git tag -a vX.Y.Z -m "桌面版 vX.Y.Z：……"
git push origin master && git push origin vX.Y.Z
```

### Step 5 — 校验值（业界规范）

从本次构建 manifest 记录两个 Windows EXE 与 Android APK 的实际字节数和 SHA-256。Android release APK 在隔离签名 job 中完成 `zipalign`/`apksigner` 后重新计算哈希；不要用未签名 APK 的哈希冒充下载资产哈希。

### Step 6 — Release Notes
Release job 应先生成待审草稿，按**附录模板**填：简介 / 下载选择表 / 系统要求 / 首启与未配置 AI 的说明 / 未签名校验说明 / 功能亮点 / 修订记录 / SHA256。文件名、大小、哈希必须来自本次构建 manifest。

### Step 7 — 发布
```bash
# v0.6.0 使用新 tag，不覆盖或移动既有 v0.5.1。
# workflow_dispatch 默认 master；构建产物的 source SHA/version 不一致时拒绝签名或上传。
# Android 签名与无签名 secret 的 Release 上传分 job；先上传 draft，由发布负责人手动公开。
```

### Step 8 — 发布后验证
```bash
gh release view vX.Y.Z --json assets -q '.assets[] | "\(.name) \(.size) \(.updatedAt)"'
```
确认两个 EXE 与签名 APK 的资产名称、文件字节数、更新时间和哈希与本次 manifest 一致。Release 发布负责人应把 Windows 安装 EXE 与签名 APK 下载到受限客户端目录并完整复算 SHA-256；不能把 HTTP Range 检查当作完整下载验收。

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
| 安装版 | `dist-desktop-staged-<id>/StudySolo-setup-X.Y.Z.exe` | 以本次构建 manifest 为准 | NSIS per-user 安装版 |
| 便携版 | `dist-desktop-staged-<id>/StudySolo-portable-X.Y.Z.exe` | 以本次构建 manifest 为准 | 便携单文件 |
| Android | `StudySolo-android-X.Y.Z.apk` | 以本次构建 manifest 为准 | Custom Tabs 外部浏览器壳 |
| 解包目录 | `dist-desktop-staged-<id>/win-unpacked/` | — | 验证用，不分发 |

`dist-desktop-staged-*/` 已 `.gitignore`，安装包不进 git。

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
| `electron/main.js` | spawn standalone、环境变量隔离、旧 userData 路径兼容、`webviewTag`、启动诊断（子进程提前退出带 stderr 立即 reject） |
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
**StudySolo · 多学科辅助学习** 客户端。正文与本机笔记可使用；AI 请求需有用户配置的 Provider，云能力需联网，不宣称所有能力离线可用。

## 下载
| 文件 | 适合 | 大小 |
|---|---|---|
| **StudySolo-setup-X.Y.Z.exe** | 多数 Windows 用户（安装版） | 以 Release 资产为准 |
| **StudySolo-portable-X.Y.Z.exe** | 免安装 Windows 用户 | 以 Release 资产为准 |
| **StudySolo-android-X.Y.Z.apk** | Android 用户（系统浏览器壳） | 以 Release 资产为准 |

**系统要求**：Windows 10 / 11（64 位）。

## 首次运行
首次启动无需填写 Provider 密钥。未配置 AI 时，相应请求会显示未配置错误；本机用户设置保持在历史 userData 目录并以 DPAPI 加密，**绝不打进安装包、绝不上传**。

## ⚠️ 未签名说明
Windows 二进制尚未代码签名，系统可能显示未知发布者。只从官方 GitHub Release 获取并核对 SHA-256；若系统策略拒绝该文件，请联系发布者，不要绕过警告。

## 功能亮点 / 修订记录
- …（本版改了什么）

## SHA256 校验
\`\`\`
<sha256>  StudySolo-setup-X.Y.Z.exe
<sha256>  StudySolo-portable-X.Y.Z.exe
<sha256>  StudySolo-android-X.Y.Z.apk
\`\`\`
校验（PowerShell）：`Get-FileHash .\StudySolo-setup-X.Y.Z.exe -Algorithm SHA256`
```
