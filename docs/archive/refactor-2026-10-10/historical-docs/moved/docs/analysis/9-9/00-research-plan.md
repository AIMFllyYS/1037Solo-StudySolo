# gailvlun 深度调研规划文档（调研 PRD）

> **文档版本**：v1.0
> **编写人**：产品经理 许清楚（Xu）
> **编写日期**：2026-07-01
> **项目版本**：gailvlun v0.3.1
> **文档性质**：调研规划，不含代码修改
>
> **2026-09 校对说明**（计划 `25`）：本文档记录的是 2026-07-01 立项时的调研问题清单，多处提到的路径（`lib/store.ts`、`lib/quiz-store.ts`、`directiveComponents.ts`、`lib/hooks/useXxx.ts` 等）已随计划 `22`/`23` 搬家，仅在命中处补充了「现已搬到 X」的括注，不改写问题原文——它记录的是「当时为什么要问这个问题」，具体现网路径请以 `docs/plans/archive/00-execution-contract.md` 第六节与对应维度报告（`01`/`03`/`06` 等）为准。
>
> **目录搬迁提示（2026-09 之后）**：本轮调研报告实际落在 `docs/analysis/9-9/`（不再是本文正文写的 `docs/research/`）；`docs/superpowers/`、`docs/compose/`、`docs/releases/`、`docs/plans/01`–`25` 均已移入 `docs/archive/` 与 `docs/plans/archive/`。下文这些旧路径按当时状态保留，**照抄会找不到文件**。

---

## 1. 调研目标与范围

### 1.1 总体目标

对 gailvlun（期末复习工作站 · 多学科辅助学习应用）进行**系统性、全量、深度**的底层机制调研，达成以下四项核心目标：

1. **全面理解项目所有底层机制**：从架构哲学到具体实现，覆盖 21 个 app 文件、197 个组件、192 个库文件、1799 个内容文件、19708 个 manim 文件、303 个脚本，形成对项目每一层运转原理的完整认知。
2. **输出多维度深度报告**：在 `docs/research/` 下输出 15+ 篇专题报告，每篇深入一个维度，说明底层原理、架构设计、实现细节、问题与风险。
3. **Next.js 规范逐项对比**：以 Next.js 16 App Router 官方规范为基准，逐项审查项目实现，找出所有偏离规范的问题与待办。
4. **全自动化平台改造调研**：分析项目从「需要手动写代码/md/json 复习内容」到「全自动化平台」的差距，为后续平台化改造提供调研基础。

### 1.2 调研边界

| 范畴 | 说明 |
|------|------|
| **调研** | 项目所有源代码（app/components/lib/）、构建配置（next.config.mjs/tsconfig/eslint）、内容管线（content/manifest → loader → renderer）、AI 系统（端点/工具/检索/流式）、存储架构（IDB/LS/Storage v2）、状态管理（Zustand stores 全景）、桌面端（Electron）、测试体系、脚本体系、SOP 体系、Manim 动画管线、Next.js 规范合规性、全自动化平台改造可行性 |
| **不调研** | node_modules 第三方依赖内部实现、manim/ 下的 19708 个生成文件（svg/tex/mp4）的逐文件内容、public/ 静态资源二进制内容、content/ 下 1799 个内容文件的逐文件内容审查（抽样即可）、已有文档的重复内容（docs/refer/、docs/sop/ 已覆盖的仅做引用与深化） |
| **不改代码** | 本次纯调研，不修改任何源代码，仅输出 md 报告文件 |

### 1.3 与已有文档的关系

| 已有文档 | 关系 | 说明 |
|----------|------|------|
| `docs/refer/rendering-architecture.md` | **深化** | 已有渲染架构规范，调研报告将深入到每个插件链、指令组件、CanvasBlock 运行时的实现细节，并补充问题清单 |
| `docs/refer/storage-architecture.md` | **深化** | 已有存储架构规范，调研报告将深入 Storage v2 分会话分 key、水合门控、迁移策略的实现细节 |
| `docs/refer/performance-audit-report.md` | **补充** | 已有性能审计报告（2026-06-28），调研报告将覆盖更广范围（含构建/SSR/交互组件性能），并审查已有优化是否仍有效 |
| `docs/sop/00-08` | **引用+评估** | SOP 体系已标准化，调研报告评估其自动化潜力，不重复 SOP 内容 |
| `docs/archive/superpowers/specs/` | **引用** | 4 个设计文档（学习应用设计/AI升级/浮窗统一/CanvasBlock 重建），调研报告引用其设计决策 |
| `docs/archive/compose/specs/` | **引用** | 考前模拟优化设计，调研报告引用 |
| `docs/archive/releases/` | **引用** | v0.3.1 修复说明，调研报告引用 |

---

## 2. 调研维度清单（16 个方向）

### 维度 01：项目总览与架构哲学

**调研问题**：
1. 项目的整体架构分层是什么？数据流如何从 content/ 流经 lib/ 到 components/ 最终到 app/ 渲染？
2. 项目采用了哪些架构设计哲学（如学科无关设计、共享渲染核心、SSR/CSR 边界划分）？这些哲学的取舍理由是什么？
3. 6 个学科（概率论/物理/化学/近现代史/毛概/CET-4）如何在同一架构中共存？学科扩展的成本模型是什么？
4. 项目的技术选型决策（Next.js 16 + React 19 + Zustand 5 + Tailwind 4 + KaTeX + Manim）背后的理由是什么？有哪些选型是超前/保守的？
5. 从 v0.0 到 v0.3.1 的架构演进路径是什么？关键转折点在哪里？

**调研深度**：架构图绘制 + 设计决策溯源 + 取舍分析
**调研方法**：代码静态分析 + 文档考古（docs/superpowers/specs 时间线）+ 架构图绘制

---

### 维度 02：内容管理系统

**调研问题**：
1. 内容树的完整数据结构是什么？`content/manifest.ts` → `lib/content-data/manifest.ts` 的映射关系如何运作？
2. `SubjectId` + `CategoryId` 的学科无关设计如何实现？新增一个学科的完整步骤是什么？
3. `lib/content/loader.ts` 的内容加载机制是什么？Markdown/JSON/HTML 三种 renderType 如何分流？
4. 媒体清单系统（`media.generated.ts` / `media.scripts.generated.ts` / `media.scripts.ids.generated.ts`）如何生成和消费？
5. `nav.generated.json` 导航生成机制是什么？侧边栏数据如何从 manifest 流转到前端？

**调研深度**：数据结构全量 + 加载流程图 + 扩展步骤文档
**调研方法**：代码静态分析 + 数据流追踪 + 生成脚本审查

---

### 维度 03：共享渲染架构

**调研问题**：
1. `lib/markdown/plugins.ts` 的完整插件链是什么？`sharedRemarkPlugins` 和 `sharedRehypePlugins` 各包含哪些插件，顺序敏感度如何？
2. 自定义指令系统（`:::definition` / `:::insight` / `:::example` / `:::pitfall` / `:::figure` / `:::interactive` 等）的解析和渲染流程是什么？
3. `directiveComponents.ts`（2026-09 现已搬到 `components/shared/directives/registry.ts`）中每个指令组件的职责和实现细节是什么？
4. `NoteRendererServer`（SSG）和 `NoteRendererClient` 的边界在哪里？服务端预渲染了什么，客户端水合了什么？
5. KaTeX 渲染管线的 mhchem 补丁问题（next.config.mjs 注释提到的 barrel 优化破坏单例）的根因和解决方案是什么？

**调研深度**：插件链全量 + 指令系统完整 + SSR/CSR 边界精确
**调研方法**：代码逐行分析 + 插件链时序图 + 已有文档（rendering-architecture.md）深化

---

### 维度 04：AI 对话系统

**调研问题**：
1. `app/api/chat/route.ts` 的完整请求处理流程是什么？OpenAI 兼容端点如何适配？Anthropic adapter 如何工作？
2. AI 工具调用系统（`getCurrentPage` / `getOutline` / `getSection` / `searchNotes` / `searchAllContent`）的注册、调度、返回格式是什么？
3. 流式响应（SSE）的完整链路是什么？从 API route 到 `useChat` hook 到 UI 渲染的 token 流如何传递？
4. 上下文管理系统（`estimateTokens` / `fullContext` / `semanticSearch` / 滑动窗口）如何控制 token 消耗？
5. 划词问 AI 的完整流程是什么？从用户选中文本到 OutboundMessage 触发到浮窗/面板响应的链路如何？
6. `app/api/canvas-revise/route.ts` 的 Canvas 修订机制如何工作？AI 如何生成和修订 CanvasBlock？

**调研深度**：请求全链路 + 工具系统完整 + 流式时序图 + 上下文策略
**调研方法**：代码逐行分析 + API 请求/响应追踪 + 流式时序图绘制

---

### 维度 05：存储架构

**调研问题**：
1. IndexedDB 存储适配器（`lib/storage/idbStorage.ts`）的完整实现是什么？`createStore` / `getItem` / `setItem` / `removeItem` 的 SSR 守卫如何工作？
2. Storage v2 分会话分 key 架构是什么？`chatSessionKey` / `chatBlobKey` 的分离策略如何防 OOM？
3. localStorage 层存储了哪些数据？`PERSIST_KEYS` 的完整清单和各 key 的用途是什么？
4. 水合门控（`useHydrated`）机制如何防止 SSR/CSR 水合不匹配？
5. 从 Storage v1 到 v2 的迁移策略是什么？`chatStorage.migrate.test.ts` 覆盖了哪些迁移场景？
6. 流式双节流（UI 60ms + IDB 写入 800ms 尾随防抖）的实现细节和效果是什么？

**调研深度**：存储全量 + 迁移策略 + 防抖实现细节
**调研方法**：代码逐行分析 + 已有文档（storage-architecture.md）深化 + 迁移测试审查

---

### 维度 06：状态管理

**调研问题**：
1. 项目中所有 Zustand store 的完整清单是什么？每个 store 的状态字段、action、持久化策略是什么？
2. `lib/store.ts`（全局 store，2026-09 现已搬到 `lib/stores/ui.ts`，原路径只留转发壳）的状态结构是什么？`RightTab` / `MobileTab` / `OutboundMessage` 等核心类型如何驱动 UI？
3. `lib/quiz-store.ts`（2026-09 现已搬到 `lib/stores/quiz.ts`）的状态结构是什么？Quiz 进度追踪如何运作？
4. 各个 hook/store（`useChat` / `useChatHistory` / `useChatUI` / `useSettings` / `useTheme` / `useBrowser` / `useFloatingChats` / `useWindowManager` 等；2026-09 起除 `useChat` 外均已搬到 `lib/stores/`）如何封装 store 订阅？
5. Zustand persist 中间件与 IndexedDB 的集成方式是什么？哪些 store 使用了 persist？
6. 订阅模式是否存在性能问题？`useChat` 按会话引用相等订阅优化解决了什么问题？

**调研深度**：Store 全景表 + 订阅模式分析 + 性能问题清单
**调研方法**：代码静态分析 + Store 字段提取 + 订阅链路追踪

---

### 维度 07：性能优化

**调研问题**：
1. 已有的性能优化措施全景清单是什么？（参考 `performance-audit-report.md`，补充 2026-06-28 后新增的优化）
2. 虚拟化策略：`@tanstack/react-virtual` 在哪些场景使用？ChatThread 虚拟化的实现细节是什么？
3. 懒加载策略：`LazyVisible` 组件如何工作？哪些长内容使用了懒加载？
4. 代码分割策略：`dynamic(..., { ssr: false })` 在交互组件注册表中如何使用？54+ 个交互组件的分割效果如何？
5. `optimizePackageImports`（framer-motion / lucide-react）的效果和限制（katex 不可加入）是什么？
6. 构建产物体积分析：首屏 bundle 大小、各路由 chunk 大小、content/ 的 outputFileTracing 策略如何？

**调研深度**：优化全景 + 效果量化 + 残留问题清单
**调研方法**：代码静态分析 + 已有报告深化 + 构建产物分析

---

### 维度 08：交互组件系统

**调研问题**：
1. `components/interactives/registry.ts` 的完整注册表结构是什么？529 行代码注册了多少个交互组件？
2. `InteractiveMeta` 接口的每个字段含义是什么？`subjectId` / `chapterId` / `sectionId` 如何实现按章节过滤？
3. `dynamic(() => import(...), { ssr: false })` 的动态加载机制如何工作？每个交互组件的 chunk 大小如何？
4. 概率论（ch01-ch08）和化学（ch01-ch14）的交互组件分别覆盖了哪些知识点？
5. `::interactive{id=...}` 指令如何在笔记 Markdown 中内联引用交互组件？
6. 交互组件与 CanvasBlock 系统的关系是什么？是否存在重叠？

**调研深度**：注册表全量 + 组件清单 + 加载机制分析
**调研方法**：代码静态分析 + 注册表提取 + 组件抽样审查

---

### 维度 09：Manim 动画系统

**调研问题**：
1. Manim 渲染管线的完整流程是什么？`manim/render.py` 如何工作？`--chapter` 参数如何控制渲染范围？
2. 19708 个 manim 文件（10727 svg + 8456 tex + 222 py + 81 mp4）的组织结构是什么？
3. Manim 动画如何集成到笔记内容中？SVG/MP4 文件如何被 `MediaEmbed` 指令引用？
4. LaTeX/MiKTeX 在 Manim 渲染链路中的角色是什么？8456 个 tex 文件的生成和消费流程是什么？
5. Manim 动画的发布流程是什么？`scripts/render` 和 `scripts/render:chapter` 的区别是什么？
6. Manim 媒体清单如何与 `media.scripts.generated.ts` / `media.scripts.ids.generated.ts` 关联？

**调研深度**：渲染管线全量 + 文件组织结构 + 集成机制
**调研方法**：脚本分析 + 文件系统结构分析 + 集成代码审查

---

### 维度 10：路由与 SSR/SSG

**调研问题**：
1. App Router 路由结构完整地图是什么？`app/[subject]/[category]/[id]/` 的动态路由如何运作？
2. `generateStaticParams` 如何为 manifest 中全部 (subject, category, id) 组合预渲染？预渲染数量是多少？
3. `dynamicParams = false` 和 `revalidate = false` 的作用是什么？内容更新后如何触发重新构建？
4. `NoteRendererServer` 在构建期完成了哪些工作？Markdown → HTML/KaTeX 的预渲染如何消除客户端瀑布？
5. 11 个 API 路由（artifact/can-embed/canvas-revise/chat/chat-title/examples/follow-ups/image-gen/quiz/record/section）各自的职责是什么？
6. `app/manifest.ts` PWA 配置的完整内容是什么？可安装 PWA 的元数据如何配置？

**调研深度**：路由全量 + SSG 策略 + API 路由清单
**调研方法**：代码静态分析 + 构建配置审查 + 路由地图绘制

---

### 维度 11：桌面端 Electron

**调研问题**：
1. `electron/main.js` 的主进程架构是什么？如何加载 Next.js standalone server？
2. `electron/preload.js` 暴露了哪些 IPC API？渲染进程与主进程的通信边界是什么？
3. `electron-builder.yml` 的打包配置是什么？支持哪些平台？产物大小如何？
4. `BUILD_STANDALONE=1` 环境变量如何影响 `next.config.mjs`？standalone 模式与普通模式的区别是什么？
5. `scripts/build-desktop.mjs` 的构建流程是什么？Web 构建和桌面构建的差异在哪里？
6. `electron/setup-preload.js` + `electron/setup.html` 的首次设置流程是什么？
7. Electron 42 + Next.js 16 的兼容性如何？有哪些已知问题？

**调研深度**：架构全量 + 打包流程 + 兼容性分析
**调研方法**：代码静态分析 + 配置文件审查 + 构建脚本分析

---

### 维度 12：测试体系

**调研问题**：
1. 双运行器架构（node:test 1177 + Vitest 51 = 1228 pass）的分工是什么？哪些测试用 node:test，哪些用 Vitest？
2. `scripts/run-unit-tests.mjs` 如何发现和执行 node:test 测试？测试发现规则是什么？
3. Vitest 配置在哪里？jsdom 环境如何设置？React Testing Library 如何集成？
4. 测试覆盖了哪些模块？哪些核心模块缺少测试？
5. `tests/` 目录结构是什么？api/content/contextTruncationPolicy/globalSearch/performance 等子目录的测试范围是什么？
6. prebuild 钩子中的 `run-unit-tests.mjs` 如何作为质量门禁？失败后如何处理？

**调研深度**：测试全景 + 覆盖率分析 + 质量门禁评估
**调研方法**：测试文件清点 + 运行配置分析 + 覆盖率报告

---

### 维度 13：构建与脚本体系

**调研问题**：
1. `prebuild` 钩子链的完整流程是什么？6 个检查脚本（check-content-encoding / gen-script-ids / check-katex-chars / check-recording-example-latex-escapes / check-media-sync / check-prose-svg-rules / run-unit-tests）各自的职责和执行顺序？
2. 303 个脚本的组织结构是什么？content/media/check/build/archive 等分类的脚本数量和用途？
3. `scripts/build-index.ts` 如何构建向量索引？307MB 索引文件的生成流程是什么？
4. `scripts/gen-nav-manifest.ts` 如何生成导航清单？
5. 内容检查脚本（check-katex-chars / check-prose-svg-rules / check-media-sync）检查什么？失败条件是什么？
6. `scripts/content/` 子目录的脚本用途是什么？内容生产自动化程度如何？

**调研深度**：脚本全景 + 构建链路 + 自动化程度评估
**调研方法**：脚本清点 + 代码分析 + 构建流程追踪

---

### 维度 14：SOP 体系与内容生产流程

**调研问题**：
1. SOP 体系（00-08 + subject-onboarding）的完整结构是什么？每个 SOP 覆盖什么环节？
2. 从教材处理（01）→ 详解生成（02/02b）→ 录音处理（03）→ 题目生成（04）→ 内容集成（05）→ 桌面打包（06）→ 测试（07）→ 试卷集成（08）的完整流程是什么？
3. 每个环节的自动化程度如何？哪些步骤是纯手动，哪些有脚本辅助，哪些是全自动？
4. 人文类学科（近现代史/毛概）与理工类学科（概率论/物理/化学）的 SOP 差异是什么？`02b-detail-generation-humanities.md` 覆盖了什么？
5. `subject-onboarding.md` 的新学科接入流程是什么？接入一个新学科需要多少步骤？
6. SOP 体系与全自动化平台改造的关系是什么？哪些 SOP 环节最适合自动化？

**调研深度**：SOP 全量 + 自动化程度评估 + 改造潜力分析
**调研方法**：文档审查 + 脚本对照 + 流程图绘制

---

### 维度 15：Next.js 16 规范逐项对比

**调研问题**（见第 3 节详细清单）：
1. App Router 规范合规性
2. Server Components vs Client Components 边界
3. 数据获取模式（Server-side fetch / cache / revalidate）
4. 元数据 API（Metadata / Viewport / generateMetadata）
5. 缓存策略（fetch cache / data cache / full route cache）
6. 中间件（Middleware）
7. 动态路由与静态生成（generateStaticParams / dynamicParams / revalidate）
8. API 路由设计规范
9. 图片优化（next/image）
10. 字体优化（next/font）
11. Script 优化（next/script）
12. 错误处理（error.tsx / not-found.tsx / loading.tsx）
13. 环境变量管理
14. 部署配置（EdgeOne / standalone / Electron）
15. TypeScript strict 模式合规性
16. ESLint 配置合规性

**调研深度**：逐项对比 + 问题清单 + 修复建议
**调研方法**：官方文档对比 + 代码逐项审查 + 配置文件分析

---

### 维度 16：全自动化平台改造调研

**调研问题**：
1. **现状分析**：当前内容生产的哪些环节需要手动写代码/md/json？每个环节的人工成本估算？
2. **目标定义**：全自动化平台应该是什么样？用户上传教材/录音 → 自动生成笔记/题目/动画/交互组件的完整愿景？
3. **差距分析**：从当前架构到全自动化平台，需要新增哪些系统？需要改造哪些现有系统？
4. **技术选型**：内容自动生成（LLM + 模板）、向量索引自动化、Manim 动画自动生成、交互组件自动生成的技术可行性？
5. **改造路径**：分阶段改造路线图是什么？哪些环节优先自动化，哪些后置？
6. **平台化架构**：从单体 Next.js 应用到平台化架构（CMS + 生成引擎 + 渲染引擎 + 分发引擎）的演进方向？

**调研深度**：现状全量 + 差距分析 + 改造路线图
**调研方法**：代码分析 + SOP 审查 + 技术可行性评估 + 架构演进推演

---

## 3. Next.js 16 规范对比清单

以下 16 个方向需逐项对比 Next.js 16 App Router 官方规范与项目实际实现：

| # | 规范方向 | 对比要点 | 涉及文件 |
|---|----------|----------|----------|
| 1 | **App Router 路由结构** | 路由层级是否规范、layout/page 嵌套是否合理、route group 使用情况、parallel routes / intercepting routes 使用情况 | `app/` 全部 21 个文件 |
| 2 | **Server / Client Components 边界** | `"use client"` 使用是否最小化、Server Components 是否充分使用、数据获取是否在 Server 端完成、Client Components 是否仅做交互 | `app/[subject]/[category]/[id]/page.tsx`（Server） vs `ContentPageClient.tsx`（Client） |
| 3 | **数据获取模式** | 是否使用 Server-side fetch、cache 选项使用、revalidate 策略、是否在 Client 端有不必要的数据获取 | `app/api/section/route.ts`、`lib/content/loader.ts` |
| 4 | **元数据 API** | `metadata` / `viewport` 导出是否规范、`generateMetadata` 是否按内容动态生成、OG 图片配置 | `app/layout.tsx`、各 `page.tsx` |
| 5 | **缓存策略** | `fetch` cache 选项、`unstable_cache` / `revalidateTag` / `revalidatePath` 使用情况、`revalidate = false` 的影响 | `next.config.mjs`、`app/[subject]/[category]/[id]/page.tsx` |
| 6 | **中间件（Middleware）** | 是否使用 `middleware.ts`、中间件覆盖范围、匹配器配置 | 项目根目录 |
| 7 | **动态路由与静态生成** | `generateStaticParams` 实现、`dynamicParams` / `revalidate` / `dynamic` 导出使用、ISR 可行性 | `app/[subject]/[category]/[id]/page.tsx` |
| 8 | **API 路由设计** | Route Handler 规范、HTTP 方法处理、错误响应格式、streaming response 实现 | `app/api/` 11 个路由 |
| 9 | **图片优化** | `next/image` 使用情况、`unoptimized` 模式的影响、图片格式（jpg 4090 个）、lazy loading | `next.config.mjs`、`components/shared/ContentImage.tsx` |
| 10 | **字体优化** | `next/font` 使用情况、当前是否使用系统字体、字体加载策略 | `app/layout.tsx`（bootstrapScript 中的字体配置） |
| 11 | **Script 优化** | `next/script` 使用情况、`dangerouslySetInnerHTML` 内联脚本的风险、`strategy` 配置 | `app/layout.tsx`（bootstrapScript） |
| 12 | **错误处理** | `error.tsx` / `not-found.tsx` / `loading.tsx` 是否齐全、错误边界覆盖范围、Suspense 使用 | `app/[subject]/[category]/[id]/loading.tsx` |
| 13 | **环境变量管理** | `.env` 文件结构、`NEXT_PUBLIC_` 前缀使用、敏感信息暴露风险、运行时 vs 构建时环境变量 | `next.config.mjs`、API routes 中的 `process.env` |
| 14 | **部署配置** | EdgeOne 部署配置（`edgeone.json`）、standalone 输出、`outputFileTracingIncludes/Excludes`、Electron 打包 | `next.config.mjs`、`edgeone.json`、`electron-builder.yml` |
| 15 | **TypeScript strict 合规** | `tsconfig.json` strict 配置、`strictNullChecks`、`noUncheckedIndexedAccess`、类型安全程度 | `tsconfig.json`、全项目 `.ts/.tsx` |
| 16 | **ESLint 合规** | `eslint.config.mjs` 配置、`eslint-config-next` 规则集、自定义规则、lint 错误数量 | `eslint.config.mjs` |

---

## 4. 子智能体分工建议

### 4.1 分工策略

建议分 **5 个子智能体**并行调研，按领域聚分组，最小化跨智能体依赖：

| 子智能体 | 负责维度 | 调研深度 | 预估工作量 |
|----------|----------|----------|------------|
| **Agent-A：架构与渲染** | 维度 01（总览）、02（内容管理）、03（渲染架构）、10（路由与SSR/SSG） | 深度代码分析 + 架构图 | 高 |
| **Agent-B：AI 与存储** | 维度 04（AI对话）、05（存储）、06（状态管理） | 深度代码分析 + 时序图 | 高 |
| **Agent-C：性能与交互** | 维度 07（性能）、08（交互组件）、09（Manim动画） | 代码分析 + 效果量化 | 中 |
| **Agent-D：工程与测试** | 维度 11（Electron）、12（测试）、13（构建脚本）、14（SOP体系） | 配置审查 + 流程分析 | 中 |
| **Agent-E：规范与平台** | 维度 15（Next.js规范对比）、16（全自动化平台改造） | 逐项对比 + 可行性分析 | 高 |

### 4.2 并行/串行策略

```
阶段 1（并行）：Agent-A / B / C / D / E 同时启动
  ├── Agent-A: 维度 01 → 02 → 03 → 10（串行内部维度，有依赖关系）
  ├── Agent-B: 维度 04 → 05 → 06（串行内部维度）
  ├── Agent-C: 维度 07 → 08 → 09（串行内部维度）
  ├── Agent-D: 维度 11 → 12 → 13 → 14（串行内部维度）
  └── Agent-E: 维度 15 → 16（串行内部维度）

阶段 2（串行）：汇总
  └── 主理人汇总 5 份报告 → 编写 overview.md 总览文档
```

### 4.3 每个子智能体的调研深度要求

- **代码层面**：必须阅读所负责维度的全部相关源代码文件，不能仅依赖已有文档
- **问题层面**：每个维度必须输出「问题清单」（含严重程度 P0/P1/P2/P3）
- **图示层面**：架构图/数据流图/时序图使用 Mermaid 语法
- **规范层面**：Agent-E 的 Next.js 规范对比必须逐项给出「合规/偏离/缺失」判定
- **改造层面**：Agent-E 的全自动化平台改造必须给出分阶段路线图

---

## 5. 输出报告结构规范

### 5.1 报告命名规范

```
docs/research/
├── 00-research-plan.md          ← 本文档（调研规划）
├── 01-architecture-overview.md   ← 维度 01：项目总览与架构哲学
├── 02-content-management.md      ← 维度 02：内容管理系统
├── 03-rendering-architecture.md  ← 维度 03：共享渲染架构
├── 04-ai-chat-system.md          ← 维度 04：AI 对话系统
├── 05-storage-architecture.md    ← 维度 05：存储架构
├── 06-state-management.md        ← 维度 06：状态管理
├── 07-performance-optimization.md← 维度 07：性能优化
├── 08-interactive-components.md  ← 维度 08：交互组件系统
├── 09-manim-animation.md         ← 维度 09：Manim 动画系统
├── 10-routing-ssr-ssg.md         ← 维度 10：路由与 SSR/SSG
├── 11-electron-desktop.md        ← 维度 11：桌面端 Electron
├── 12-testing-system.md          ← 维度 12：测试体系
├── 13-build-scripts.md           ← 维度 13：构建与脚本体系
├── 14-sop-content-pipeline.md    ← 维度 14：SOP 体系与内容生产流程
├── 15-nextjs-compliance.md       ← 维度 15：Next.js 规范逐项对比
├── 16-automation-platform.md     ← 维度 16：全自动化平台改造调研
└── overview.md                   ← 总览文档（最后汇总）
```

### 5.2 单篇报告统一模板

每篇报告必须包含以下章节：

```markdown
# [维度名称] 深度调研报告

> **调研人**：[子智能体名称]
> **调研日期**：2026-07-01
> **项目版本**：gailvlun v0.3.1
> **关联文档**：[列出相关的已有文档]

## 1. 执行摘要
（200-300 字，概述本维度的核心发现）

## 2. 架构总览
（Mermaid 架构图 + 文字说明）

## 3. 核心机制详解
### 3.1 [机制 1]
### 3.2 [机制 2]
...

## 4. 数据流与调用链路
（Mermaid 时序图/流程图 + 文字说明）

## 5. 关键代码路径
（列出核心文件和关键代码段，附行号引用）

## 6. 设计决策与取舍分析
（为什么这样设计，有什么取舍）

## 7. 问题清单
| # | 问题描述 | 严重程度 | 涉及文件 | 建议修复方向 |
|---|----------|----------|----------|--------------|
| 1 | ... | P0/P1/P2/P3 | ... | ... |

## 8. 改进建议
（分优先级的改进建议）

## 9. 与全自动化平台改造的关系
（本维度对平台化改造的影响和建议）

## 10. 参考资料
（官方文档链接、项目内文档链接）
```

### 5.3 总览文档（overview.md）结构

```markdown
# gailvlun 全项目深度调研总览

> **汇总人**：主理人
> **汇总日期**：2026-07-01

## 1. 调研概况
（调研范围、维度数量、报告数量、子智能体数量）

## 2. 项目全景架构图
（Mermaid 全局架构图，整合各维度报告的架构图）

## 3. 各维度报告索引
| # | 维度 | 报告文件 | 核心发现 | 问题数 |
|---|------|----------|----------|--------|
| 01 | 项目总览 | 01-architecture-overview.md | ... | ... |
| ... | ... | ... | ... | ... |

## 4. 问题汇总
（按 P0/P1/P2/P3 汇总所有维度的问题）

## 5. Next.js 规范合规总览
（16 项规范的合规情况汇总表）

## 6. 全自动化平台改造路线图
（整合维度 16 的改造建议，形成统一路线图）

## 7. 关键待确认问题
（所有维度的待确认问题汇总）
```

---

## 6. 全自动化平台改造调研要点

### 6.1 现状分析：哪些环节是手动写代码/md/json

| 环节 | 当前方式 | 人工成本 | 自动化潜力 |
|------|----------|----------|------------|
| **教材处理** | 手动用 MinerU 解析 PDF → 手动清洗 → 手动转 Markdown | 高 | 高（LLM 辅助清洗） |
| **详解笔记编写** | 手动编写 .md 文件，含 `:::definition` / `:::insight` / `:::example` / `:::pitfall` 指令 + KaTeX 公式 | 极高 | 高（LLM + 模板生成） |
| **录音逐字稿处理** | 手动录音 → 手动转写 → 手动分段 → 手动生成详解 | 极高 | 中（ASR 自动转写 + LLM 分段） |
| **题目生成** | 手动编写 .json 文件（stem/options/answer/hint/explanation/sourceRef） | 高 | 高（LLM 生成 + 人工校验） |
| **Manim 动画** | 手动编写 .py 脚本 → 手动渲染 → 手动集成 SVG/MP4 | 极高 | 中（LLM 生成 Manim 脚本 + 自动渲染） |
| **交互组件** | 手动编写 React 组件 → 手动注册到 registry.ts | 极高 | 低-中（模板化 + LLM 辅助） |
| **内容集成** | 手动更新 manifest.ts → 手动检查媒体同步 → 手动构建索引 | 中 | 高（脚本自动化已有基础） |
| **考前模拟/试卷** | 手动编写试卷内容 → 手动集成 | 高 | 高（LLM + 题库生成） |
| **构建发布** | prebuild 检查链 → next build → 桌面打包 | 低 | 已高度自动化 |

### 6.2 目标：全自动化平台应该是什么样

```
用户输入                    平台引擎                         输出
─────────                  ─────────                        ─────
教材 PDF  ──┐               ┌─ 内容解析引擎（MinerU + LLM）     ┌─ 详解笔记 (.md + 指令 + KaTeX)
课堂录音  ──┤               ├─ 笔记生成引擎（LLM + 模板）       ├─ 题目 (.json)
考试大纲  ──┼──→ 平台 ──→  ├─ 题目生成引擎（LLM + 校验）  ──→ ├─ Manim 动画 (.py → .svg/.mp4)
知识点树  ──┤               ├─ 动画生成引擎（LLM → Manim 脚本）  ├─ 交互组件（模板化生成）
历年真题  ──┘               ├─ 交互生成引擎（模板 + 参数化）     ├─ 向量索引 (.index/)
                           ├─ 索引构建引擎（自动 build-index）   ├─ 导航清单 (nav.generated.json)
                           ├─ 质量检查引擎（自动 prebuild 检查）  └─ 媒体清单 (media.generated.ts)
                           └─ 发布引擎（自动 build + deploy）
```

### 6.3 差距分析维度

| # | 差距维度 | 当前状态 | 目标状态 | 差距大小 |
|---|----------|----------|----------|----------|
| 1 | **内容输入** | 手动放置文件到 content/ | 平台上传 → 自动解析入库 | 大 |
| 2 | **笔记生成** | 手动编写 .md | LLM + 模板自动生成 → 人工审校 | 大 |
| 3 | **题目生成** | 手动编写 .json | LLM 生成 + 自动校验 + 人工审校 | 大 |
| 4 | **动画生成** | 手动编写 .py + 手动渲染 | LLM 生成 Manim 脚本 + 自动渲染 | 极大 |
| 5 | **交互组件** | 手动编写 React 组件 | 模板化 + 参数化生成 | 极大 |
| 6 | **索引构建** | 手动运行 build-index | 内容变更自动触发 | 中 |
| 7 | **质量检查** | prebuild 钩子 | 实时检查 + 预提交检查 | 小 |
| 8 | **发布流程** | 手动 build + 手动部署 | CI/CD 自动发布 | 中 |
| 9 | **内容管理** | 文件系统 + manifest.ts | CMS 数据库 + 版本管理 | 大 |
| 10 | **多学科扩展** | 手动接入（SOP subject-onboarding） | 平台化新学科向导 | 大 |

### 6.4 改造路径建议方向

**阶段 1（短期）：内容生成辅助**
- LLM 辅助生成详解笔记（从教材段落 → 带指令的 Markdown）
- LLM 辅助生成题目（从知识点 → 题目 JSON + 自动校验）
- 自动化录音转写（ASR 集成）

**阶段 2（中期）：管线自动化**
- 内容变更监听 → 自动触发索引重建
- Manim 脚本模板化 → LLM 填充参数 → 自动渲染
- 交互组件模板化（常见类型：函数绘图/分子结构/概率模拟 → 参数化模板）

**阶段 3（长期）：平台化**
- Web CMS 界面（替代文件系统管理内容）
- 多用户协作（内容编辑/审校/发布分离）
- CI/CD 全自动发布管线
- 新学科接入向导（自动化 SOP 执行）

---

## 7. 待确认问题

以下问题需主理人或用户澄清：

| # | 问题 | 影响 | 建议询问对象 |
|---|------|------|--------------|
| 1 | 全自动化平台的用户画像是什么？（教师自助上传？学生自助学习？平台运营团队？） | 影响改造方向和优先级 | 用户 |
| 2 | 全自动化平台是否需要保留当前的 Web + Electron 双形态？还是纯 Web 平台？ | 影响部署架构调研 | 用户 |
| 3 | AI 对话系统使用的具体 AI 提供商是？（SiliconFlow / OpenAI / Anthropic？）影响合规性和成本分析 | 影响 AI 维度调研深度 | 主理人 |
| 4 | 向量索引 307MB 从 COS 下载到 /tmp 的策略是否在生产中稳定？是否有超时/失败处理？ | 影响存储和部署调研 | 主理人 |
| 5 | 6 个学科的内容是否还在持续更新？还是已进入维护期？ | 影响全自动化平台改造的紧迫性 | 用户 |
| 6 | 是否有其他大学/课程需要复用此平台？还是仅限当前 6 个学科？ | 影响平台化的多租户/多课程设计 | 用户 |
| 7 | EdgeOne 部署的 CDN 缓存策略是什么？`revalidate = false` 下内容更新后的缓存失效机制？ | 影响部署配置调研 | 主理人 |
| 8 | Manim 动画渲染环境（Python + LaTeX/MiKTeX + ffmpeg）是否在 CI/CD 中可用？还是仅本地渲染？ | 影响自动化管线设计 | 主理人 |
| 9 | 当前 1228 个测试的运行时间是多少？是否在 CI 中全量运行？ | 影响测试体系调研 | 主理人 |
| 10 | 调研报告的目标读者是谁？（开发者？项目管理者？投资者？）影响报告的技术深度和表达方式 | 影响所有报告的写作风格 | 用户 |

---

## 附录 A：项目文件统计

| 目录 | 文件数 | 说明 |
|------|--------|------|
| app/ | 21 | App Router + API 路由 + manifest.ts PWA |
| components/ | 197 | 17 个子目录（browser/canvas/chat/...） |
| lib/ | 192 | 18 个子目录（ai/content/hooks/markdown/...） |
| content/ | 1799 | chapters/各学科/quiz/examples + .index 向量索引 307MB |
| manim/ | 19708 | 10727 svg + 8456 tex + 222 py + 81 mp4 |
| scripts/ | 303 | content/media/check/build/archive |
| public/ | 4742 | 4090 jpg + 344 mp4 + 170 svg |
| docs/ | 67 | sop/refer/plans/superpowers/compose/releases |
| tests/ | ~20+ | api/content/performance/helpers/fixtures |
| **总计** | **~27000+** | |

## 附录 B：已有文档索引

| 路径 | 内容 | 调研关系 |
|------|------|----------|
| `docs/sop/00-infrastructure.md` | 基础设施 SOP | 引用 |
| `docs/sop/01-textbook-processing.md` | 教材处理 SOP | 引用+评估 |
| `docs/sop/02-detail-generation.md` | 详解生成 SOP | 引用+评估 |
| `docs/sop/02b-detail-generation-humanities.md` | 人文详解生成 SOP | 引用+评估 |
| `docs/sop/03-recording-processing.md` | 录音处理 SOP | 引用+评估 |
| `docs/sop/04-quiz-generation.md` | 题目生成 SOP | 引用+评估 |
| `docs/sop/05-content-integration.md` | 内容集成 SOP | 引用+评估 |
| `docs/sop/06-desktop-packaging-release.md` | 桌面打包发布 SOP | 引用+评估 |
| `docs/sop/07-testing.md` | 测试 SOP | 引用+评估 |
| `docs/sop/08-exam-paper-integration.md` | 试卷集成 SOP | 引用+评估 |
| `docs/sop/subject-onboarding.md` | 新学科接入 SOP | 引用+评估 |
| `docs/refer/rendering-architecture.md` | 渲染架构规范 | 深化 |
| `docs/refer/storage-architecture.md` | 存储架构规范 | 深化 |
| `docs/refer/performance-audit-report.md` | 性能审计报告 | 补充 |
| `docs/refer/exam-type-distribution.md` | 考试题型分布 | 引用 |
| `docs/refer/mineru-parsing-guide.md` | MinerU 教程 | 引用 |
| `docs/refer/modern-history-textbook-format.md` | 近代史格式 | 引用 |
| `docs/superpowers/specs/2026-06-16-prob-stats-learning-app-design.md` | 学习应用设计 | 引用 |
| `docs/superpowers/specs/2026-06-17-probability-output-integration-design.md` | 概率论输出集成设计 | 引用 |
| `docs/superpowers/specs/2026-06-19-ai-learning-upgrade-design.md` | AI 学习升级设计 | 引用 |
| `docs/superpowers/specs/2026-06-25-floating-chat-unification-design.md` | 浮窗统一设计 | 引用 |
| `docs/superpowers/plans/2026-06-28-global-appearance-theme.md` | 全局外观主题计划 | 引用 |
| `docs/superpowers/plans/2026-06-29-canvas-block-runtime-rebuild.md` | CanvasBlock 运行时重建计划 | 引用 |
| `docs/superpowers/plans/2026-06-29-physics-recording-remaining-content.md` | 物理录音剩余内容计划 | 引用 |
| `docs/superpowers/plans/2026-06-30-gailvlun-0.3.1-critical-bugfix.md` | v0.3.1 关键修复计划 | 引用 |
| `docs/releases/2026-06-30-v0.3.1-critical-fixes.md` | v0.3.1 发布说明 | 引用 |

---

> **本文档为调研规划，不包含代码修改。后续各子智能体按本规划执行调研，输出报告到 `docs/research/` 目录。**
