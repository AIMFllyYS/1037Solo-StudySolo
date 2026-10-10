# D4 Bundle 与构建

> 范围：重依赖分包、路由分包、dynamic 覆盖、i18n、生成资产、CSS、Electron standalone、构建期警告。
> 实测数据见 `measurements.md` §1（本报告的 P0-1 已由产物 manifest 实证）。

## 板块总结

重型功能库的懒加载纪律**整体良好**：pdfjs、docx/pptx-preview、mammoth、RDKit WASM、Milkdown、54 个 interactives、397KB 讲稿本体均在异步边界后。**但首屏真正债务在三条静态链路**：① `AppShell` 静态导入 `MobileMiniChat` → 整套聊天栈进全站 eager 闭包；② `lib/stores/ui.ts` 静态引入 `contentTree` + `nav.generated.json`(339KB) + `lectures.generated.json`(50KB)；③ i18n 双词典(245KB 源) + `@supabase/supabase-js` 经 root layout 静态入每页。

**产物实证**（`page_client-reference-manifest.js`）：每路由 eager = 447KB 框架 + 根 layout 客户端闭包 **31 chunk = 3,561KB**，在 `/login`、`/class`、`/agent`、`/c/[sessionId]` 上完全一致。修复优先级最高的是 `MobileMiniChat` 一处 `dynamic()` 化——一行改动即可把最大块功能代码退回异步边界。

## 发现清单

### [P0-1] `MobileMiniChat` 静态导入把整套聊天栈拉进全站 eager chunk — `components/layout/AppShell.tsx:51`（产物实证）

- **链**：`AppShell.tsx:51` 静态 `MobileMiniChat` → `MobileMiniChat.tsx:10-11` 静态 `ChatThread`+`ChatInput` → `ChatMessage` → `MessageContent.tsx:5-18` → react-markdown + `plugins.ts`（remark×5/rehype×4 + katex + mhchem）→ `directives/registry.ts` ~15 指令组件 → `MediaEmbed` → `interactives/registry.ts`(54+ dynamic 表) + `media.generated.ts`(52KB) + `media.physics.generated.ts`(83KB) → `CanvasDirective` → 画布渲染器 → `ChatMessageVisualizations` → `VideoPlayer` → **@vidstack/react** → `ChatInput` → `useChat` → `sendMessage` barrel → `consumeStudyStream` → **`ai` SDK（带 zod 进客户端）**。
- **实证**：根 layout `layout-router <module evaluation>`（`async:false`）含 31 chunk = 3,561KB：markdown 栈 700KB、zod 326KB、supabase 217KB、vidstack 258KB、RDKit-init 104KB、聊天壳 ~131KB、其余 ~1.8MB。**所有路由（含 /login）都付这笔钱**；桌面端 `MobileMiniChat` 内部 `hidden`/`isMobile` 分支使其几乎从不渲染——纯下载+解析浪费。
- **方向**：`MobileMiniChat` 改 `next/dynamic({ssr:false})`（仅 mobile 视口挂载）；顺审 `AppShell.tsx:45-50` 同组 `MobileTopBar`/`MobileBottomNav`/`MobileChapterPicker`/`MobileReviewHub`/`MobileSettingsPanel`/`MobileSidebarDrawer` 是否同法。注意 `ChatPanel` 已在 RightPanel dynamic 边界内（`RightPanel.tsx:26-60`）——修好 MobileMiniChat 后聊天栈即可回到「只在打开面板时加载」。
- **验证**：修复后 `/login` 的 layout-router chunks 中不应再出现 markdown/supabase/zod/vidstack chunk；eager 体积应回落到 ~1MB 量级。

### [P1-2] `lib/stores/ui.ts` 静态引入 contentTree + 双份目录 JSON — `lib/stores/ui.ts`、`lib/content-data/*`

- **现状**：客户端基础包静态吃进 `contentTree`（全量目录树对象）+ `nav.generated.json`(339KB) + `lectures.generated.json`(50KB)——目录数据双份常驻（树本体 + 生成 JSON）。
- **影响**：~390KB+ JSON parse + 对象常驻，所有路由；对纯工具页（/login、/class、/agent）纯浪费。
- **方向**：目录树改按需（首屏只载顶层科目，展开再取子树）或挪服务端组件传递；nav/lectures JSON 与树合并去重。
- **验证**：grep chunk 中 nav.generated 文本指纹；修复前后 JS heap。

### [P1-3] i18n 双词典 + supabase-js 全量进 root — `app/layout.tsx` 链、`lib/i18n/`、`070ayc3s2d327.js`(217KB)

- 双语言词典 245KB 源（en+zh 全量）；supabase-js 整包在 root（代理/会话需要，但 `/class` 等无会话页同样付账）。
- **方向**：词典按 `accept-language`/设置懒切；supabase 客户端边界内聚到需要 auth 的子树（深链/同步路径已在 dynamic import engine——可复用该边界）。

### [P1-4] 全局 CSS ~300KB 级无条件下发 — `app/styles/` + katex/vidstack 全局样式

- 全局 KaTeX 字体/样式 + Vidstack 样式在 layout 即引（SA-4 静态估算 ~300KB 字符源，产出未实测）。
- **方向**：KaTeX CSS 挪到首个数学渲染点（或保留——字体 FOUC 权衡需产品确认）；Vidstack CSS 随播放器 chunk。
- **验证**：`wc -c .next/static/css/*.css` 与 coverage 工具。

### [P2-5] Turbopack 构建期 15 条警告：动态文件 pattern 过宽致 NFT 过追踪 — `lib/content/contentPaths.ts:27`、`lib/content/lectures/paths.ts:65`、`next.config.mjs`

- **实测**（build 输出）：`contentPaths.ts` 的 `path.join(cwd,'content',subject,category,id.ext)` 动态 pattern **匹配 48,872 个文件**；`lectures/paths.ts` 匹配 **56,573 个文件**；`next.config.mjs` 报「whole project was traced unintentionally」×4（`api/quiz`、`api/section`、`instrumentation` 等）。
- **影响**：构建追踪成本 + standalone/NFT 产物可能混入无关文件（Electron 包体放大风险）。
- **方向**：`path.join(/*turbopackIgnore: true*/ ...)` 或收窄到静态子目录；`outputFileTracingExcludes` 已排 `_raw`/`examples`，可再评估。

### [P2-6] Electron standalone 产物残留待查 — `scripts/build-desktop.mjs` + standalone 输出

- 未验证项：`.next/cache` 是否混入、`node_modules` 是否含 devDeps/测试文件、pnpm 重复 store、`content/` 全量复制后可再裁的素材。
- **验证**：`du -ah standalone | sort -h | tail`；对照 package.json dependencies。

### [P2-7] 无 bundle 分析器 — `knip.json`、`package.json`

- 建议 devDeps 加 `@next/bundle-analyzer` + `"analyze"` script；本报告 chunk 归因靠 manifest 手工统计，可持续化。

## 已确认做对的懒加载（勿回归）

| 项 | 证据 |
|---|---|
| Milkdown | `MilkdownNoteEditor.tsx:4` 静态 Crepe 但宿主 `UserNoteEditorWindow`/`ClassroomNoteWindow` 均 `dynamic(ssr:false)`；产物实证 milkdown chunk(966KB) 不在任何 eager 闭包 |
| PDF.js | `PdfDocumentPane`/`PdfPageCanvas`/`pdfText.ts:9` 全 runtime `import()`；worker 独立 public 资源 |
| DOCX/PPTX/mammoth | `docx-preview`/`pptx-preview`/`mammoth`(`imageUtils.ts:182`) 全 runtime `import()` |
| RDKit | `lib/chemistry/rdkit.ts:3` 仅 type import；`/rdkit/RDKit_minimal.{js,wasm}` 按需 script 注入+Promise 复用（注：104KB 的 `0k4sau` chunk 是初始化胶水代码进了 eager，WASM 本体仍懒加载） |
| Interactives | `registry.ts:31+` 54+ `dynamic(ssr:false)` + `InteractiveTab`+`LazyVisible` |
| DeferredWindowLayers | 19 窗层 `ssr:false` + `idleReady/neededNow` 门控（`:36-48`）——推广模板 |
| RightPanel 四 Tab | ChatPanel/VideoTab/InteractiveTab/BrowserTab 全 `ssr:false`+骨架（`:26-60`） |
| 讲稿二段式 | ids(2.8KB) 静态 + 397KB 本体首次展开 `import()`（`VideoTab.tsx:44-49`） |
| sync engine | `lib/sync/schedule.ts:28,33,39` `import("./engine")` 懒加载 |
| highlight.js | `plugins.ts:37-53` `detect:false`+9 语言白名单 |
| Markdown SSR | `NoteRendererServer` 用 `MarkdownAsync` 服务端渲染；客户端 `NoteRenderer` 仅异步边界 |
| optimizePackageImports | framer-motion/lucide-react 已启用；katex 排除决策正确（`next.config.mjs:21-26`，mhchem 副作用） |
| instrumentation | `instrumentation.ts` `NEXT_RUNTIME==='nodejs'` guard + `await import(indexHealth)`，不进浏览器包 |
| undici | 仅 `api/image-gen` 服务端静态用，无客户端泄漏 |
