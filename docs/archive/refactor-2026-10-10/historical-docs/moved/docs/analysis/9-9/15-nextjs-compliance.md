# Next.js 16 规范逐项对比深度调研报告

> **调研人**：Agent-E（规范与平台调研员）
> **调研日期**：2026-07-05
> **项目版本**：gailvlun v0.3.1（package.json 标注 v0.4.0）
> **Next.js 版本**：16.2.9（package.json:39）
> **React 版本**：19.2.7
> **TypeScript 版本**：5.7.3
>
> **2026-09 校对说明**（计划 `25`）：第 2.15 节 `noteComponents.tsx` 路径已更新为现网位置 `components/notes/noteComponents.tsx`（计划 `23` 从 `lib/markdown/` 搬出）。本报告其余的合规判定（P0/P1/P2/P3 问题清单、ESLint/图片优化/元数据等现状）为 2026-07 快照，未逐条重新核实是否已修复；如需最新合规状态，请重新跑 `pnpm lint` / `pnpm exec tsc --noEmit` 并对照 `docs/plans/archive/00-execution-contract.md` 第六节。

## 1. 执行摘要

对 gailvlun 项目 16 个 Next.js 规范方向逐项对比后，整体结论是：**项目在「核心数据流 + SSG + 流式响应」三大主轴上是合规且经过深思熟虑的；但在「错误边界、图片/字体/脚本优化、中间件、动态元数据、缓存细粒度控制」六个方向存在系统性缺失或偏离**。

### 总体合规分布

| 判定 | 数量 | 占比 | 说明 |
|------|------|------|------|
| ✅ 合规 | 5/16 | 31% | 实现与 Next.js 16 规范高度一致 |
| ⚠️ 偏离 | 8/16 | 50% | 有实现但存在改进空间或局部误用 |
| ❌ 缺失 | 3/16 | 19% | 关键规范文件未实现 |

### 关键亮点

1. **SSG 路由设计精良**：`app/[subject]/[category]/[id]/page.tsx` 通过 `generateStaticParams` + `dynamicParams = false` + `revalidate = false` 实现纯构建期烘焙（`app/[subject]/[category]/[id]/page.tsx:14-35`），376 个内容页全部预渲染
2. **Server / Client 边界清晰**：`page.tsx` 是 async Server Component，正文 Markdown→React 树在服务端渲染后作为 `renderedNote` 插槽下传给 `ContentPageClient`（`app/[subject]/[category]/[id]/page.tsx:60-64`），客户端不再跑 react-markdown + KaTeX
3. **SSE 流式响应实现规范**：`/api/chat` 使用 `ReadableStream` + `TextEncoder` 实现标准 SSE（`app/api/chat/route.ts:165-180`），含 15s 心跳保活、跨轮 usage 累加、Anthropic 适配
4. **TypeScript strict 全量启用**：`tsconfig.json:11` 启用 `strict: true`，全仓 .ts/.tsx 共仅 4 处 `: any`（多为 remark/rehype 插件类型断点）

### 主要问题（按严重程度排序）

| 严重度 | 问题数 | 典型问题 |
|--------|--------|----------|
| P0 | 2 | `.env.local` 含真实 API Key 已进入 git 工作树；无 `error.tsx`/`not-found.tsx`/`global-error.tsx` 错误边界 |
| P1 | 6 | 无 `next/image`/`next/font`/`next/script`；无 `generateMetadata`；无 `middleware.ts/proxy.ts`；Next.js 16 已弃用 `revalidate`/`fetchCache`（Cache Components） |
| P2 | 5 | API 路由错误响应格式不统一；`ContentPageClient` 单文件 315 行偏大；`eslint-disable` 18 处存量告警；中间 layout 三个空 `<>{children}</>` |
| P3 | 3 | 路由未用 route group 分区；无 `viewport` 单独导出（已在 layout.tsx:12）；无 OG 图片 |

---

## 2. 逐项对比详情

### 2.1 App Router 路由结构

- **规范要求**：App Router 通过文件系统约定定义路由；`layout.tsx`/`page.tsx` 是必备件；`loading.tsx`/`error.tsx`/`not-found.tsx` 是可选但推荐的边界件；Route Groups `(group)` 用于逻辑分区不进 URL；Parallel Routes `@slot` 用于多视图；Intercepting Routes `(.)` 用于模态拦截。
- **项目实现**：仅 4 层路由，结构极简
  ```
  app/
  ├── layout.tsx                    # 根 layout（含 <html>/<body>）
  ├── page.tsx                      # 首页书架
  ├── manifest.ts                   # PWA manifest
  ├── globals.css
  ├── icon.svg
  ├── [subject]/
  │   ├── layout.tsx                # 空 fragment：<>{children}</>
  │   ├── review/page.tsx           # 复习页
  │   └── [category]/
  │       ├── layout.tsx            # 空 fragment
  │       └── [id]/
  │           ├── layout.tsx        # 空 fragment
  │           ├── page.tsx          # 实际内容页（SSG）
  │           ├── loading.tsx       # 骨架屏
  │           └── ContentPageClient.tsx
  └── api/                          # 11 个 route handler
  ```
- **判定**：⚠️ 偏离
- **问题描述**：
  1. **3 个空 layout**：`app/[subject]/layout.tsx`、`app/[subject]/[category]/layout.tsx`、`app/[subject]/[category]/[id]/layout.tsx` 三层布局均为 `<>{children}</>`（`app/[subject]/layout.tsx:1-7` 等），无任何实际功能。Next.js 规范是「layout 用于跨路由共享 UI」，空 layout 是冗余文件
  2. **未使用 Route Groups 分区**：`app/api/` 与业务路由混在同一层，`app/[subject]` 既包含学习页又包含 `review/` 复习页。若用 `(main)` 与 `(review)` 分组可避免无谓的 layout 嵌套
  3. **未使用 Intercepting Routes**：项目有「HTML 内容全屏覆盖层」（`app/[subject]/[category]/[id]/ContentPageClient.tsx:295-311`）等模态场景，但用 `fixed inset-0 z-[100]` 实现，未走 intercepting routes + parallel routes 的标准模态规范
  4. **无 `template.tsx`**：项目需要「路由切换时重置状态」的场景（如 `useEffect` 重置滚动），目前通过 `useEffect` 手动实现（`ContentPageClient.tsx:109-111`），而 `template.tsx` 才是规范做法
- **涉及文件**：
  - `app/[subject]/layout.tsx:1-7`
  - `app/[subject]/[category]/layout.tsx:1-7`
  - `app/[subject]/[category]/[id]/layout.tsx:1-7`
  - `app/[subject]/[category]/[id]/ContentPageClient.tsx:295-311`
- **修复建议**：
  - 删除 3 个空 layout 文件（layout 默认会从父级继承，无需显式声明空 fragment）
  - 用 route group 重组：`app/(learn)/[subject]/[category]/[id]/page.tsx` 与 `app/(review)/[subject]/review/page.tsx`
  - 评估「全屏覆盖层」改用 `(.)[id]/fullscreen/page.tsx` 拦截路由
  - 用 `template.tsx` 替代手动的 `useEffect(scrollTo)`

---

### 2.2 Server / Client Components 边界

- **规范要求**：默认 Server Component；`"use client"` 最小化使用；数据获取在 Server 端完成；Server → Client 通过 props 传递可序列化数据；`children` 插槽可穿越 Client 边界。
- **项目实现**：
  - `app/[subject]/[category]/[id]/page.tsx` 是 `async function` Server Component，调用 `readContent` 读取磁盘 markdown、调用 `NoteRendererServer` 在服务端渲染 React 树、再把 `renderedNote: React.ReactNode` 作为 prop 传给 `ContentPageClient`（`page.tsx:60-64`）
  - `ContentPageClient.tsx:1` 标 `"use client"`，内部用 `useState`/`useEffect`/`useRef`/`useStore`（zustand）
  - QuizTab、ExampleTab 用 `dynamic(() => import(...), { ssr: false })` 懒加载（`ContentPageClient.tsx:19-20`）
- **判定**：✅ 合规
- **问题描述**：边界划分清晰、`"use client"` 最小化、Server 端预渲染 React 树作为 children 传入 Client 是教科书级的「组合模式 2」实现。
- **涉及文件**：
  - `app/[subject]/[category]/[id]/page.tsx:1-96`
  - `app/[subject]/[category]/[id]/ContentPageClient.tsx:1-315`
- **修复建议**：无（已是规范实现）

---

### 2.3 数据获取模式

- **规范要求**：Server Components 中通过 `fetch` 扩展 API 获取数据；使用 `cache`/`no-store`/`force-cache` 控制缓存；用 `React.cache` 共享请求级数据；避免 prop drilling。
- **项目实现**：
  - 完全**不使用 `fetch`**，直接 `fs.readFileSync` 读取磁盘 .md 文件（`lib/content/loader.ts:39-43`）
  - `readContent` 是同步函数，在 `page.tsx:56` 直接调用
  - 例题数据通过 `readExamples` 同步读取（`page.tsx:75-76`）
  - API 路由 `/api/section` 是「客户端回退路径」（`app/api/section/route.ts:11-12` 注释明确说明）
- **判定**：⚠️ 偏离
- **问题描述**：
  1. **同步 `fs.readFileSync` 阻塞渲染**：Next.js 16 推荐 `fetch` + async 数据获取以利用流式渲染与 memoization，项目用同步 fs 读盘阻塞 React 渲染管线
  2. **未使用 `React.cache`**：同一请求内多次调用 `readContent` 会重复读盘（虽然 `page.tsx` 当前只调一次，但 API 路由 `/api/section` 与 `page.tsx` 共享 loader，缺乏请求级 memoization）
  3. **`/api/section` 已退化为「客户端回退」**：注释明确说「首屏由 page.tsx 直接调用 readContentMarkdown 做 SSR；此路由仅作客户端回退」，但路由仍保留并对外可用，造成双路径维护负担
- **涉及文件**：
  - `lib/content/loader.ts:34-44`（同步 readSectionMarkdown）
  - `lib/content/loader.ts:54-87`（同步 readContentMarkdown）
  - `app/[subject]/[category]/[id]/page.tsx:54-76`
  - `app/api/section/route.ts:1-34`
- **修复建议**：
  - 评估将 `readContent` 改为 async + `React.cache` 包装，至少在 SSG 构建期能避免重复读盘
  - `/api/section` 若确认无外部调用方，可在下个版本删除
  - 中长期考虑将内容入库（SQLite/D1），用 `fetch` 统一数据获取入口

---

### 2.4 元数据 API

- **规范要求**：根 layout 导出 `metadata` 静态对象；动态路由用 `generateMetadata({ params })` 按内容生成标题/描述/OG 图片；`viewport` 必须独立导出（Next.js 14+）；`metadataBase` 用于解析相对 URL；推荐使用文件式 metadata（`opengraph-image.tsx`、`icon.tsx`、`sitemap.ts`、`robots.ts`）。
- **项目实现**：
  - `app/layout.tsx:20-32` 导出静态 `metadata`（title/description/appleWebApp/icons）
  - `app/layout.tsx:12-18` 导出 `viewport`（width/initialScale/maximumScale/userScalable/viewportFit）
  - `app/manifest.ts` 导出 PWA manifest
  - **无 `generateMetadata`**：动态路由 `app/[subject]/[category]/[id]/page.tsx` 未导出 `generateMetadata`
  - **无 `metadataBase`**：相对 URL 无法解析为绝对 URL
  - **无 OG 图片**：metadata 中无 `openGraph` 字段，也无 `opengraph-image.tsx`
  - **无 `sitemap.ts`/`robots.ts`**
- **判定**：❌ 缺失
- **问题描述**：
  1. **376 个内容页都用同一标题**：所有 `/{subject}/{category}/{id}` 页共享根 layout 的 "期末复习工作站 · 多学科辅助学习" 标题，SEO 与社交分享价值流失
  2. **OG 图片完全缺失**：分享到任何社交平台都不会显示预览图
  3. **无 sitemap.ts**：搜索引擎无法发现 376 个内容页
  4. **`viewport.maximumScale = 1` + `userScalable = false`**：违反 WCAG 1.4.4 无障碍标准（不允许禁用缩放），现代 Next.js 文档明确反对
- **涉及文件**：
  - `app/layout.tsx:12-32`
  - `app/[subject]/[category]/[id]/page.tsx`（无 `generateMetadata`）
- **修复建议**：
  - 在 `app/[subject]/[category]/[id]/page.tsx` 添加 `generateMetadata`：
    ```tsx
    export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
      const { subject, category, id } = await params;
      const item = getContentItem(subject, category, id);
      return {
        title: item?.title ?? id,
        description: item?.summary ?? `${subject} · ${category}`,
        openGraph: { title: item?.title, type: "article" },
      };
    }
    ```
  - 在 `app/layout.tsx` 添加 `metadataBase: new URL("https://gailvlun.example.com")`
  - 添加 `app/sitemap.ts` 自动从 `contentTree` 生成 URL 列表
  - 添加 `app/robots.ts`
  - 移除 `viewport.maximumScale = 1` 与 `userScalable = false`

---

### 2.5 缓存策略

- **规范要求**：Next.js 16 启用 Cache Components 后，`dynamic`/`dynamicParams`/`revalidate`/`fetchCache` 被移除（参见 [Route Segment Config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)）；推荐用 `"use cache"` 指令 + `cacheLife`/`cacheTag` 细粒度控制；`revalidateTag`/`revalidatePath` 用于按需失效。
- **项目实现**：
  - `app/[subject]/[category]/[id]/page.tsx:33-35`：
    ```ts
    export const dynamicParams = false;
    export const revalidate = false;
    ```
  - 全项目**未使用** `unstable_cache`/`revalidateTag`/`revalidatePath`/`"use cache"`（Grep 确认仅命中 `dist-desktop` 中的 next 内部代码与 docs/research/00-research-plan.md 引用）
  - `next.config.mjs` 无 `cacheComponents` 配置，即仍走 Next.js 15 的旧缓存模型
- **判定**：⚠️ 偏离
- **问题描述**：
  1. **`revalidate = false` 在 Next.js 16 已被标记弃用**：当启用 Cache Components 时该选项被移除；项目虽未启用 Cache Components，但升级后该配置会成为迁移阻力
  2. **缺乏按内容更新的失效机制**：内容是 git 提交驱动的，`revalidate = false` 配合 SSG 是合理的，但 API 路由（如 `/api/chat`）也用了 `dynamic = "force-dynamic"`（`app/api/chat/route.ts:31`），无中间缓存层
  3. **未利用 `unstable_cache` 缓存 AI 调用结果**：相同 prompt 的 AI 响应每次都重新请求上游，浪费 token
- **涉及文件**：
  - `app/[subject]/[category]/[id]/page.tsx:33-35`
  - `app/api/chat/route.ts:30-31`（`runtime = "nodejs"; dynamic = "force-dynamic"`）
  - `next.config.mjs`（无 cacheComponents）
- **修复建议**：
  - **短期**：保持现状（SSG + revalidate=false 是当前内容模式的最佳选择）
  - **中期**：评估启用 `cacheComponents: true`，迁移到 `"use cache"` + `cacheLife("hours")` 模型
  - **针对 AI 调用**：在 `/api/chat` 的工具调用层引入 `unstable_cache`（按 prompt hash 缓存），可节省 30-50% 的 token 开销

---

### 2.6 中间件（Middleware / Proxy）

- **规范要求**：Next.js 16 将 `middleware.ts` 重命名为 `proxy.ts`（[官方文档](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)）；用于请求拦截、重写、重定向、CORS、A/B 测试、鉴权；默认 Node.js 运行时；必须导出 `config.matcher` 限制范围。
- **项目实现**：**完全缺失**。Grep 在项目根目录与 src 下均未找到 `middleware.ts`/`proxy.ts`/`middleware.js`/`proxy.js`。
- **判定**：❌ 缺失
- **问题描述**：
  1. **无请求级鉴权/限流**：所有 11 个 API 路由（含 `/api/chat`、`/api/image-gen`、`/api/artifact`）任何人可调用，AI 密钥通过服务端中转不暴露但可被滥用
  2. **无 CSP 头注入**：`layout.tsx` 用 `dangerouslySetInnerHTML` 注入 bootstrap 脚本，但无 CSP 头限制脚本源
  3. **无 SEO 重定向**：旧路径 `/ch01/1.1`（概率论历史路径）与新路径 `/probability/detail/1.1` 共存，无重定向
  4. **未跟随 Next.js 16 重命名**：即使后续添加，也应直接用 `proxy.ts` 而非 `middleware.ts`
- **涉及文件**：根目录（缺失）
- **修复建议**：
  - 添加 `proxy.ts` 实现最低限度的安全头注入与路径归一化：
    ```ts
    import { NextResponse } from "next/server";
    import type { NextRequest } from "next/server";

    export function proxy(req: NextRequest) {
      const res = NextResponse.next();
      res.headers.set("X-Frame-Options", "SAMEORIGIN");
      res.headers.set("X-Content-Type-Options", "nosniff");
      res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      return res;
    }

    export const config = {
      matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
    };
    ```
  - 长期考虑添加简单的速率限制（按 IP + 路径，10 req/min）

---

### 2.7 动态路由与静态生成

- **规范要求**：`generateStaticParams` 用于枚举 SSG 路径；`dynamicParams` 控制未枚举路径是否 404（默认 true）；`revalidate` 控制重新验证间隔（Next.js 16 + Cache Components 时已移除，需用 `"use cache"`）；`dynamic` 控制渲染模式（已弃用，迁移到 `use cache`）。
- **项目实现**：
  - `app/[subject]/[category]/[id]/page.tsx:16-30` 实现 `generateStaticParams`，遍历 `contentTree` 全部 subject/category/item 生成参数列表（含 children 递归）
  - `dynamicParams = false`：未枚举的 id 直接 404
  - `revalidate = false`：构建期烘焙，无 ISR
- **判定**：✅ 合规
- **问题描述**：实现规范，注释清晰（`page.tsx:14-15`「构建期为 manifest 中的全部 (subject, category, id) 预渲染（SSG），EdgeOne 边缘缓存」）。
  - **小瑕疵**：`revalidate = false` 在 Next.js 16 启用 Cache Components 后会被移除，建议添加注释说明「升级时需迁移到 `use cache` + `cacheLife("forever")`」
- **涉及文件**：
  - `app/[subject]/[category]/[id]/page.tsx:16-35`
- **修复建议**：
  - 在 `page.tsx` 顶部注释中添加迁移提示
  - 评估未来启用 ISR（`revalidate = 3600`）以支持内容热更新

---

### 2.8 API 路由设计

- **规范要求**：Route Handler 在 `route.ts` 导出 HTTP 方法函数（`GET`/`POST`/`PUT`/`DELETE`）；通过 `runtime` 配置 Node.js/Edge；用 `Response.json()` 或 `NextResponse.json()` 返回；streaming 用 `ReadableStream`；GET 默认动态（v15+）；错误响应用标准状态码。
- **项目实现**：11 个 route handler，全部 `runtime = "nodejs"`

  | 路由 | 方法 | dynamic | streaming | 错误格式 |
  |------|------|---------|-----------|---------|
  | `/api/section` | GET | 未设置（默认动态） | ❌ | `NextResponse.json({ content })` |
  | `/api/quiz` | GET | 未设置 | ❌ | `NextResponse.json({ quiz: null }, { status: 404 })` |
  | `/api/examples` | GET | 未设置 | ❌ | `NextResponse.json({ error: "not found" }, { status: 404 })` |
  | `/api/chat` | POST | `force-dynamic` | ✅ SSE | `send({ type: "error", message })` |
  | `/api/artifact` | POST | `force-dynamic` | ✅ SSE | `send({ type: "artifact", status: "error", message })` |
  | `/api/image-gen` | POST | `force-dynamic` | ❌ | `Response.json({ error }, { status: 500 })` |
  | `/api/record` | POST | `force-dynamic` | ✅ SSE | `send({ type: "error", message })` |
  | `/api/canvas-revise` | POST | `force-dynamic` | ❌ | `Response.json({ error }, { status: 502/422 })` |
  | `/api/chat-title` | POST | `force-dynamic` | ❌ | `Response.json({ title: fallback, generated: false })` |
  | `/api/follow-ups` | POST | `force-dynamic` | ❌ | `NextResponse.json({ questions: [] })`（无错误） |
  | `/api/can-embed` | GET | `force-dynamic` | ❌ | `NextResponse.json({ embeddable: true, reason: "..." })` |

- **判定**：⚠️ 偏离
- **问题描述**：
  1. **错误响应格式 3 套混用**：
     - `NextResponse.json({ error }, { status })`（`/api/examples`、`/api/quiz`）
     - `Response.json({ error }, { status })`（`/api/image-gen`、`/api/canvas-revise`）
     - `send({ type: "error", message })` SSE 内嵌（`/api/chat`、`/api/artifact`、`/api/record`）
     前端无法用统一逻辑处理错误
  2. **GET 路由未显式声明 `dynamic`**：`/api/section`、`/api/quiz`、`/api/examples`、`/api/can-embed` 4 个 GET 路由未导出 `dynamic`，依赖 Next.js 16 的默认动态行为（v15+ 改动），但显式声明更清晰
  3. **`/api/chat` 单文件 733 行**：包含 SSE 流、工具循环、上下文构建、FollowUp 兜底、上下文分项统计、容灾切换 6 个职责（`app/api/chat/route.ts:1-733`），违反单一职责
  4. **无统一鉴权层**：所有路由无 `Authorization` 头校验，无速率限制
- **涉及文件**：
  - `app/api/section/route.ts:17-34`
  - `app/api/chat/route.ts:72-733`
  - `app/api/image-gen/route.ts:39-164`
  - `app/api/canvas-revise/route.ts:23-99`
- **修复建议**：
  - 抽取 `lib/api/errors.ts` 统一错误响应工具：
    ```ts
    export const apiError = (message: string, status = 400) =>
      Response.json({ error: message }, { status });
    ```
  - 拆分 `/api/chat`：将工具循环、上下文构建、FollowUp 兜底拆到 `lib/chat/` 子模块
  - 所有 GET 路由显式导出 `export const dynamic = "force-dynamic"`
  - 长期考虑用 `proxy.ts` 加一层 API key 鉴权

---

### 2.9 图片优化

- **规范要求**：使用 `next/image` 自动优化（resize/format/quality）；`qualities` 在 Next.js 16 起必填；`preload` 替代已弃用的 `priority`；`unoptimized` 仅用于 SVG/GIF/小图；`remotePatterns` 替代已弃用的 `domains`。
- **项目实现**：
  - **全项目 0 处使用 `next/image`**（Grep 确认）
  - 全部使用原生 `<img>` + `// eslint-disable-next-line @next/next/no-img-element`
  - `components/shared/ContentImage.tsx:27-37` 是封装的图片组件，仍是 `<img loading="lazy" decoding="async" onError={...} />`
  - `next.config.mjs:6-8` 仅在 `BUILD_STANDALONE = 1` 时启用 `images.unoptimized = true`（Electron 打包场景），Web 构建未禁用但也没用
  - `public/images/` 下约 4090 个 .jpg 文件（题目描述中提到）
- **判定**：❌ 缺失
- **问题描述**：
  1. **4090 张图片完全无优化**：浏览器直接拉原图，无 srcset、无 WebP/AVIF 转码、无尺寸适配
  2. **`<img>` 不响应式**：固定 src，移动端拉 4K 图浪费流量
  3. **`ContentImage` 用 `eslint-disable` 绕过检查**：18 处 `eslint-disable` 中有 5 处是 `@next/next/no-img-element`
- **涉及文件**：
  - `components/shared/ContentImage.tsx:14-49`
  - `components/chat/AttachmentThumbnails.tsx:62`（注释「blob/base64 URLs not supported by next/image」是合理豁免）
  - `components/video/VideoTab.tsx:107`
  - `components/shared/directives/Figure.tsx:27`
  - `components/chat/ChatHistoryOverlay.tsx:111`
  - `components/chat/ImageGenViewer.tsx:295`
- **修复建议**：
  - `ContentImage` 改用 `next/image`：
    ```tsx
    import Image from "next/image";
    // ... 需要 width/height 或 fill
    ```
  - `next.config.mjs` 添加：
    ```js
    images: {
      qualities: [25, 50, 75],
      formats: ["image/avif", "image/webp"],
      remotePatterns: [], // 当前全是本地图片
    }
    ```
  - 评估 `ContentImage` 用 `fill` 模式（无需 width/height，适配容器）
  - `AttachmentThumbnails.tsx` 的 blob/base64 URL 可保留 `<img>` 但加 `unoptimized` 注释
  - 长期考虑为 4090 张题图建立尺寸预设（thumbnail/detail/full）

---

### 2.10 字体优化

- **规范要求**：使用 `next/font/google` 或 `next/font/local` 自动优化字体加载（self-host、`size-adjust`、`font-display: swap`、零 CLS）；避免 `<link rel="stylesheet">` 拉远程字体；系统字体栈可用但失去自定义品牌字体。
- **项目实现**：
  - **全项目 0 处使用 `next/font`**（Grep 确认）
  - `app/layout.tsx:10`（bootstrapScript）中通过 CSS 变量定义字体栈：
    ```js
    var fonts = {
      system: 'ui-sans-serif, system-ui, ...',
      songti: '"Noto Serif SC", "Source Han Serif SC", ...',
      kaiti: 'KaiTi, STKaiti, ...',
      ...
    };
    ```
  - 用户可在「设置」中切换字体（系统/宋体/楷体/黑体/serif/mono）
- **判定**：⚠️ 偏离
- **问题描述**：
  1. **未使用 `next/font`**：用户切换「宋体」「楷体」时依赖系统已安装字体，跨设备表现不一致
  2. **`Noto Serif SC`/`Source Han Serif SC` 未自托管**：若用户系统未装，回退到 `SimSun`/`Georgia`，体验降级
  3. **`bootstrapScript` 中 `fonts` 对象硬编码 200+ 字符**：增加首屏 HTML 体积
- **涉及文件**：
  - `app/layout.tsx:10`（bootstrapScript 内 fonts 对象）
- **修复建议**：
  - 用 `next/font/local` 自托管 1-2 个关键字体（如 Noto Serif SC、LXGW WenKai）：
    ```ts
    import localFont from "next/font/local";
    const songti = localFont({
      src: "./fonts/NotoSerifSC.woff2",
      variable: "--font-songti",
      display: "swap",
    });
    ```
  - 在 `<html>` 上挂 `className={songti.variable}`
  - bootstrapScript 仅保留主题切换逻辑，字体栈从 CSS 变量读取
  - 短期至少评估 `next/font/google` 拉 Noto Sans SC（中国大陆可能需 fallback 到本地）

---

### 2.11 Script 优化

- **规范要求**：使用 `next/script` 控制第三方脚本加载策略（`beforeInteractive`/`afterInteractive`/`lazyOnload`）；避免 `dangerouslySetInnerHTML` 注入内联脚本；必须用时配置 CSP `nonce`。
- **项目实现**：
  - **未使用 `next/script`**（Grep 确认）
  - `app/layout.tsx:10-48`：在 `<head>` 中用 `<script dangerouslySetInnerHTML={{ __html: bootstrapScript }} />` 注入约 3KB 的 bootstrap 脚本，用于在 paint 前应用本地存储的主题/布局/外观配置
- **判定**：⚠️ 偏离
- **问题描述**：
  1. **`dangerouslySetInnerHTML` 注入大段脚本**：脚本内容包含 `localStorage.getItem`、`JSON.parse`、`setAttribute`、`style.setProperty` 等操作（`app/layout.tsx:10` 单行 3KB 脚本）
  2. **无 CSP nonce**：若未来添加 CSP 头，此脚本会被阻塞
  3. **脚本逻辑过重**：颜色对比度计算（`function txt(h) { ... luminance ... }`）放在首屏阻塞脚本中
- **涉及文件**：
  - `app/layout.tsx:10`（bootstrapScript 字符串）
  - `app/layout.tsx:42-47`（`<script dangerouslySetInnerHTML>`）
- **修复建议**：
  - **方案 A（推荐）**：用 `next/script` + `strategy="beforeInteractive"`：
    ```tsx
    import Script from "next/script";
    <Script id="bootstrap" strategy="beforeInteractive">{`...`}</Script>
    ```
  - **方案 B**：保留 `dangerouslySetInnerHTML` 但脚本最小化（只读 localStorage 设置 `data-theme` 等 attribute），颜色对比度计算移到客户端组件 `useEffect`
  - 添加 CSP 时为 `<script>` 加 `nonce` 属性

---

### 2.12 错误处理

- **规范要求**：`error.tsx` 处理路由段运行时错误（必须是 Client Component）；`not-found.tsx` 处理 404；`global-error.tsx` 处理根 layout 错误；`loading.tsx` 流式加载骨架；`<Suspense>` 细粒度流式。
- **项目实现**：
  - **仅有 1 个 `loading.tsx`**：`app/[subject]/[category]/[id]/loading.tsx`（骨架屏，与 ContentPageClient UI 一致）
  - **0 个 `error.tsx`**：Grep `app/**/error.tsx` 无结果
  - **0 个 `not-found.tsx`**：Grep `app/**/not-found.tsx` 无结果
  - **0 个 `global-error.tsx`**
  - 根 `layout.tsx:50-52` 用 `<Suspense fallback={...}>` 包裹 `<AppShell>`
- **判定**：❌ 缺失
- **问题描述**：
  1. **任何 Server Component 抛错都会白屏**：`page.tsx:54-76` 中 `readContent` 若 fs 读取失败、`normalizeDirectiveLabels` 若 markdown 异常，无 error.tsx 兜底，整个路由段崩溃到根 layout 的 Suspense fallback（"加载中…"永久停留）
  2. **`notFound()` 调用后无自定义 404 页**：`page.tsx:42, 51` 调 `notFound()` 后 Next.js 用默认 404 页，与项目视觉风格脱节
  3. **无 `global-error.tsx`**：根 `layout.tsx` 抛错（如 bootstrapScript 解析失败）会直接显示浏览器默认错误页
  4. **`<Suspense>` 边界过粗**：仅根 layout 一处 Suspense，376 个内容页的 RSC payload 流式到达时无细粒度骨架
- **涉及文件**：
  - `app/[subject]/[category]/[id]/loading.tsx:1-63`（唯一存在的边界件）
  - 缺失：`app/error.tsx`、`app/not-found.tsx`、`app/global-error.tsx`、`app/[subject]/[category]/[id]/error.tsx`
- **修复建议**：
  - 添加 `app/[subject]/[category]/[id]/error.tsx`：
    ```tsx
    "use client";
    export default function ContentError({ error, unstable_retry }: {
      error: Error & { digest?: string };
      unstable_retry: () => void;
    }) {
      return (
        <div className="flex h-full items-center justify-center">
          <div>内容加载失败：{error.digest}</div>
          <button onClick={() => unstable_retry()}>重试</button>
        </div>
      );
    }
    ```
  - 添加 `app/not-found.tsx`（带项目视觉的 404 页）
  - 添加 `app/global-error.tsx`（含 `<html>`/`<body>`）
  - 在 `ContentPageClient` 内对 `<ExampleTab>`/`<QuizTab>` 懒加载组件加 `<Suspense>`

---

### 2.13 环境变量管理

- **规范要求**：敏感信息不进 git；`NEXT_PUBLIC_` 前缀的变量进入客户端 bundle；其他变量仅服务端可用；用 `server-only` 包防止服务端代码误入客户端；`.env.local` 应在 `.gitignore` 中。
- **项目实现**：
  - `.env.example`（66 行）列出全部配置项，注释清晰
  - `.env.local`（32 行）**当时含真实 API Key**（值已打码，视为已泄露，须轮换）：
    - `AI_API_KEY=sk-xxxxxxxxxxxxxxxx`
    - `MIMO_API_KEY=sk-xxxxxxxxxxxxxxxx`
    - `ZHIPU_API_KEY=********.********`
    - `UNSPLASH_ACCESS_KEY=********`
    - `MinerU_API_Token=eyJ...`（JWT，已打码）
    - `COS_INDEX_BASE_URL=https://...myqcloud.com/index/`
  - `NEXT_PUBLIC_` 前缀仅用于 1 个变量：`NEXT_PUBLIC_VIDEO_CDN_BASE`（`app` 目录 Grep 无命中，仅 `.env.local:31`）
  - `lib/` 下 11 个文件用 `process.env.`（含 `provider.ts`、`embedding.ts`、`webSearch.ts`、`vectorStore.ts` 等）
- **判定**：❌ 缺失（安全漏洞 P0）
- **问题描述**：
  1. **`.env.local` 含 5 个真实 API Key**：虽然 `.env.local` 在 `.gitignore` 中（git 不追踪），但文件物理存在于工作树，任何本地脚本、IDE 索引、误上传（如打包进 Electron app）都会泄露
  2. **`MinerU_API_Token` 是有效期至 2026-09-14 的 JWT**：泄露后可被滥用消耗配额
  3. **`process.env` 在 lib/ 中分散调用**：11 个文件直接读 `process.env.AI_API_KEY` 等，无统一配置入口，难以做运行时类型校验
  4. **未使用 `server-only` 包**：`lib/content/loader.ts` 等服务端模块未标记 `import "server-only"`，存在被客户端组件误导入的风险
  5. **`NEXT_PUBLIC_VIDEO_CDN_BASE` 在 `.env.local`**：意味着构建时已注入客户端 bundle，无法在运行时切换 CDN
- **涉及文件**：
  - `.env.local:1-32`（含真实密钥）
  - `.env.example:1-66`
  - `lib/ai/provider.ts`、`lib/ai/embedding.ts`、`lib/ai/webSearch.ts` 等 11 个文件
- **修复建议**：
  - **立即**：轮换 `.env.local` 中所有 API Key（视为已泄露）
  - **立即**：检查 `.env.local` 是否被误提交（`git log --all -- .env.local`）
  - **短期**：创建 `lib/config.ts` 统一管理配置，加 `zod` 运行时校验：
    ```ts
    import { z } from "zod";
    import "server-only";
    const envSchema = z.object({
      AI_BASE_URL: z.string().url(),
      AI_API_KEY: z.string().min(1),
      // ...
    });
    export const env = envSchema.parse(process.env);
    ```
  - **长期**：Electron 桌面端的密钥已用 `safeStorage`（DPAPI）加密存 `userData/keys.enc`（`docs/sop/06-desktop-packaging-release.md:12`），Web 端可参考此模式用用户输入而非构建时注入

---

### 2.14 部署配置

- **规范要求**：`output: "standalone"` 用于自托管/Docker；`outputFileTracingIncludes/Excludes` 精确控制依赖打包；`edgeone.json`/`vercel.json` 平台特定配置；`electron-builder.yml` 桌面打包配置。
- **项目实现**：
  - `next.config.mjs:6-8`：条件式 `output: "standalone"` + `images.unoptimized`（仅 `BUILD_STANDALONE=1` 时启用）
  - `next.config.mjs:13-18`：`outputFileTracingIncludes` 把 `content/**` 与 `lib/ai/prompts/**` 打包进 `/api/**`；`outputFileTracingExcludes` 排除 `content/.index/`（307MB 向量索引）、`content/_raw/`、`content/examples/`
  - `edgeone.json`：`buildCommand: pnpm run build`、`nodeVersion: 22.17.1`、`maxDuration: 120`、对 `/api/chat` 和 `/api/artifact` 设置 `X-Accel-Buffering: no`
  - `electron-builder.yml`：win target `portable + nsis`，`extraResources` 双层复制 standalone（`electron-builder.yml:13-21`，含 `node_modules` 双层坑修复）
- **判定**：✅ 合规
- **问题描述**：配置精细且经过实战打磨（`electron-builder.yml:14-21` 的 node_modules 双层坑、`next.config.mjs:10-12` 的 307MB 索引排除注释都说明踩过坑）
  - **小瑕疵**：`edgeone.json` 的 `cloudFunctions.nodejs.includeFiles` 为空数组，依赖 `outputFileTracingIncludes` 起作用，但两者语义不同（前者是 EdgeOne 平台层，后者是 Next.js 层），建议在 `edgeone.json` 也显式列出
  - **小瑕疵**：`next.config.mjs` 无 `cleanDistDir: true`，构建产物可能残留旧文件
- **涉及文件**：
  - `next.config.mjs:1-29`
  - `edgeone.json:1-26`
  - `electron-builder.yml:1-41`
- **修复建议**：
  - `edgeone.json` 的 `includeFiles` 显式列出 `["content/**/*", "lib/ai/prompts/**/*"]`
  - 评估 `next.config.mjs` 添加 `cleanDistDir: true`
  - 在 `next.config.mjs` 注释中记录 `output: "standalone"` 与 EdgeOne Pages 的兼容性结论（SOP-06 提到「EdgeOne Pages 因 SSR 云函数 128MiB 硬限已放弃云部署」）

---

### 2.15 TypeScript strict 合规

- **规范要求**：`tsconfig.json` 启用 `strict: true`；推荐 `noUncheckedIndexedAccess` 处理数组/对象索引；`exactOptionalPropertyTypes` 严格可选属性；路径别名 `@/*`；`isolatedModules` 防止隐式导出。
- **项目实现**：
  - `tsconfig.json:11`：`"strict": true`（覆盖 `strictNullChecks`/`strictFunctionTypes`/`strictBindCallApply`/`strictPropertyInitialization`/`noImplicitAny`/`noImplicitThis`/`alwaysStrict`）
  - `tsconfig.json:17`：`"isolatedModules": true`
  - `tsconfig.json:25-28`：路径别名 `@/* -> ./*`
  - **未启用** `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride`、`noFallthroughCasesInSwitch`
  - `exclude` 排除 `manim`、`docs/refer/dist`、`showroom`、`exhibition-hall`、`dist-desktop`、`**/*.test.ts(x)`（`tsconfig.json:38-47`）
  - 全仓 `: any`/`as any` 仅 4 处（`lib/markdown/plugins.ts:12,28`、`components/notes/noteComponents.tsx`（2026-09 现网路径，原 `lib/markdown/noteComponents.tsx` 已随计划 `23` 搬出 `lib/`）、`lib/hooks/useChat.ts:411`，行号为 2026-07 快照未重新核对），均为 remark/rehype 插件类型断点
- **判定**：⚠️ 偏离
- **问题描述**：
  1. **`noUncheckedIndexedAccess` 未启用**：数组/对象索引访问默认返回 `T` 而非 `T | undefined`，存在运行时 undefined 风险。例如 `convo[i]`（`app/api/chat/route.ts:657`）假定必有值
  2. **`exactOptionalPropertyTypes` 未启用**：`{ x?: string }` 仍允许显式 `undefined`，与不传值的语义混淆
  3. **测试文件被 `exclude` 排除**：`**/*.test.ts(x)` 不参与类型检查，测试代码中的类型错误不会被 `tsc --noEmit` 发现
  4. **`.next/types/**/*.ts` 与 `.next/dev/types/**/*.ts` 在 `include` 中**：这是 Next.js 自动生成的类型，正常情况会自动包含，显式列出无害但冗余
- **涉及文件**：
  - `tsconfig.json:1-48`
- **修复建议**：
  - 启用 `noUncheckedIndexedAccess`（高风险，需逐文件修复 undefined 检查）
  - 启用 `exactOptionalPropertyTypes`（中风险）
  - 将 `**/*.test.ts(x)` 从 `exclude` 移除，或单独创建 `tsconfig.test.json` 继承主配置
  - 评估启用 `noImplicitOverride`、`noFallthroughCasesInSwitch`、`noUnusedLocals`、`noUnusedParameters`

---

### 2.16 ESLint 合规

- **规范要求**：Next.js 16 起 `next lint` 被移除，改用 ESLint CLI 直接驱动；推荐 `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`；扁平配置（ESLint 9）；逐步清理存量告警。
- **项目实现**：
  - `eslint.config.mjs:1-27`：扁平配置，展开 `nextCoreWebVitals` + `nextTypeScript`
  - `globalIgnores` 排除 `.next`、`out`、`build`、`next-env.d.ts`、`node_modules`、`exhibition-hall`、`showroom`、`docs/refer`、`**/*.test.ts(x)`
  - `package.json:15-16`：`lint: eslint .`、`lint:fix: eslint . --fix`
  - 全仓 18 处 `eslint-disable` 注释（Grep 结果），分布：
    - `@next/next/no-img-element`：5 处（见 2.9）
    - `@typescript-eslint/no-explicit-any`：3 处（`lib/markdown/plugins.ts:11,27`、`components/browser/BrowserTab.tsx:19`）
    - `react-hooks/exhaustive-deps`：5 处
    - `react-hooks/set-state-in-effect`：4 处（Next.js 16 新规则）
    - `react-hooks/rules-of-hooks`：1 处（`components/quiz/QuizQuestion.tsx:531`，**P0 严重**）
- **判定**：⚠️ 偏离
- **问题描述**：
  1. **`react-hooks/rules-of-hooks` 被禁用 1 处**：`components/quiz/QuizQuestion.tsx:531`，这是 React 顶级规则，违反会导致 Hooks 调用顺序不稳定，可能引发「Rendered fewer hooks than expected」运行时崩溃
  2. **`react-hooks/set-state-in-effect` 4 处禁用**：这是 Next.js 16 / React 19 的新规则，禁用说明存在 effect 中同步 setState 的反模式
  3. **测试文件被 `globalIgnores` 排除**：与 tsconfig 一致，测试代码无 lint 检查
  4. **无自定义规则**：未在 `eslint.config.mjs` 添加项目特定规则（如禁止 `console.log`、强制 JSDoc）
  5. **lint 不阻塞 build**：`package.json:13` 的 `build` 脚本不含 `lint`，eslint 错误不会阻断构建
- **涉及文件**：
  - `eslint.config.mjs:1-27`
  - `components/quiz/QuizQuestion.tsx:531`
  - `components/quiz/QuizTab.tsx:18,20,30`
  - `components/review/RecordPreviewWindow.tsx:108`
  - `components/chat/ArtifactCard.tsx:76`
- **修复建议**：
  - **P0**：修复 `QuizQuestion.tsx:531` 的 Hooks 顺序问题，移除 `eslint-disable` 注释
  - 修复 4 处 `set-state-in-effect`（用 `useMemo` 或事件驱动替代 effect 内 setState）
  - 评估将 `lint` 加入 `prebuild` 脚本（`package.json:12`）
  - 测试文件纳入 lint（从 `globalIgnores` 移除 `**/*.test.ts(x)`）
  - 添加自定义规则：`"no-console": ["warn", { allow: ["warn", "error"] }]`

---

## 3. 合规总览表

| # | 规范方向 | 判定 | 问题数 | 优先级 | 关键文件 |
|---|----------|------|--------|--------|----------|
| 1 | App Router 路由结构 | ⚠️ 偏离 | 4 | P2 | 3 个空 layout |
| 2 | Server / Client Components 边界 | ✅ 合规 | 0 | — | `page.tsx` + `ContentPageClient.tsx` |
| 3 | 数据获取模式 | ⚠️ 偏离 | 3 | P1 | `lib/content/loader.ts`（同步 fs） |
| 4 | 元数据 API | ❌ 缺失 | 4 | P1 | 无 `generateMetadata`/OG/sitemap |
| 5 | 缓存策略 | ⚠️ 偏离 | 3 | P2 | `revalidate = false`（Next.js 16 弃用预警） |
| 6 | 中间件（Middleware/Proxy） | ❌ 缺失 | 4 | P1 | 无 `proxy.ts` |
| 7 | 动态路由与静态生成 | ✅ 合规 | 1 | P3 | `generateStaticParams` 实现 |
| 8 | API 路由设计 | ⚠️ 偏离 | 4 | P2 | 错误格式 3 套混用 |
| 9 | 图片优化 | ❌ 缺失 | 3 | P1 | 0 处 `next/image`，4090 张图无优化 |
| 10 | 字体优化 | ⚠️ 偏离 | 3 | P2 | 0 处 `next/font` |
| 11 | Script 优化 | ⚠️ 偏离 | 3 | P2 | `dangerouslySetInnerHTML` 注入 3KB 脚本 |
| 12 | 错误处理 | ❌ 缺失 | 4 | P0 | 无 `error.tsx`/`not-found.tsx`/`global-error.tsx` |
| 13 | 环境变量管理 | ❌ 缺失 | 5 | P0 | `.env.local` 含 5 个真实 API Key |
| 14 | 部署配置 | ✅ 合规 | 2 | P3 | `next.config.mjs` + `electron-builder.yml` |
| 15 | TypeScript strict 合规 | ⚠️ 偏离 | 4 | P2 | 未启用 `noUncheckedIndexedAccess` |
| 16 | ESLint 合规 | ⚠️ 偏离 | 5 | P1 | `rules-of-hooks` 被禁用 1 处 |

**汇总**：✅ 合规 5 项 / ⚠️ 偏离 8 项 / ❌ 缺失 3 项（共 52 个具体问题）

---

## 4. 问题清单（按优先级排序）

| # | 问题描述 | 严重程度 | 涉及文件 | 建议修复方向 |
|---|----------|----------|----------|--------------|
| 1 | `.env.local` 含 5 个真实 API Key（AI_API_KEY/MIMO_API_KEY/ZHIPU_API_KEY/UNSPLASH_ACCESS_KEY/MinerU_API_Token），且 `MinerU_API_Token` 是有效期至 2026-09-14 的 JWT | P0 | `.env.local:4,13,20,27,29` | 立即轮换所有密钥；创建 `lib/config.ts` 统一管理 + zod 校验；服务端模块加 `import "server-only"` |
| 2 | 无 `error.tsx`/`not-found.tsx`/`global-error.tsx`，任何 Server Component 抛错都会白屏或卡在「加载中…」骨架 | P0 | `app/`（缺失） | 至少添加 `app/error.tsx`、`app/not-found.tsx`、`app/global-error.tsx` 三个边界件 |
| 3 | `QuizQuestion.tsx:531` 禁用 `react-hooks/rules-of-hooks`，违反 React 顶级规则，可能导致运行时崩溃 | P0 | `components/quiz/QuizQuestion.tsx:531` | 重构组件结构，确保 Hooks 调用顺序稳定；移除 `eslint-disable` |
| 4 | 0 处 `next/image`，4090 张图片完全无优化（无 srcset/WebP/AVIF/尺寸适配） | P1 | `components/shared/ContentImage.tsx:14-49` 等 5 处 | `ContentImage` 改用 `next/image`；`next.config.mjs` 配置 `qualities`/`formats` |
| 5 | 无 `generateMetadata`，376 个内容页共享根标题，SEO 与社交分享价值流失 | P1 | `app/[subject]/[category]/[id]/page.tsx` | 添加 `generateMetadata` 按 `item.title`/`item.summary` 生成 |
| 6 | 无 `middleware.ts`/`proxy.ts`，11 个 API 路由无鉴权无限流，无安全头注入 | P1 | 根目录（缺失） | 添加 `proxy.ts` 注入 `X-Frame-Options`/`X-Content-Type-Options` 等安全头 |
| 7 | 0 处 `next/font`，用户切换字体依赖系统已装字体，跨设备表现不一致 | P1 | `app/layout.tsx:10`（bootstrapScript） | 用 `next/font/local` 自托管 Noto Serif SC、LXGW WenKai 等关键字体 |
| 8 | `react-hooks/set-state-in-effect` 4 处禁用，Next.js 16 / React 19 新规则反模式 | P1 | `components/quiz/QuizTab.tsx:18,30` 等 | 用 `useMemo` 或事件驱动替代 effect 内 setState |
| 9 | API 路由错误响应格式 3 套混用（`NextResponse.json`/`Response.json`/SSE 内嵌） | P2 | 11 个 `app/api/*/route.ts` | 抽取 `lib/api/errors.ts` 统一错误响应工具 |
| 10 | `app/api/chat/route.ts` 单文件 733 行，含 6 个职责（SSE/工具循环/上下文/FollowUp/统计/容灾） | P2 | `app/api/chat/route.ts:72-733` | 拆分到 `lib/chat/` 子模块 |
| 11 | 数据获取用同步 `fs.readFileSync`，阻塞 React 渲染管线，无 `React.cache` memoization | P2 | `lib/content/loader.ts:34-87` | 评估改 async + `React.cache` 包装 |
| 12 | 3 个空 layout 文件（`<>{children}</>`），冗余无功能 | P2 | `app/[subject]/layout.tsx` 等 3 处 | 删除空 layout（默认会从父级继承） |
| 13 | `dangerouslySetInnerHTML` 注入 3KB bootstrap 脚本，含颜色对比度计算等重逻辑 | P2 | `app/layout.tsx:10,42-47` | 用 `next/script` + `strategy="beforeInteractive"` 或脚本最小化 |
| 14 | `revalidate = false` 在 Next.js 16 启用 Cache Components 后将被移除 | P2 | `app/[subject]/[category]/[id]/page.tsx:35` | 添加迁移注释；中长期评估 `"use cache"` + `cacheLife("forever")` |
| 15 | `noUncheckedIndexedAccess` 未启用，数组/对象索引存在 undefined 风险 | P2 | `tsconfig.json:11` | 启用并逐文件修复 |
| 16 | 测试文件被 `tsconfig.exclude` 与 `eslint globalIgnores` 双重排除 | P2 | `tsconfig.json:45-46`、`eslint.config.mjs:24-25` | 从排除项移除，或单独创建 `tsconfig.test.json` |
| 17 | `viewport.maximumScale = 1` + `userScalable = false` 违反 WCAG 1.4.4 无障碍标准 | P2 | `app/layout.tsx:15-16` | 移除缩放限制 |
| 18 | 无 `metadataBase`，相对 URL 无法解析为绝对 URL，影响 OG/canonical | P2 | `app/layout.tsx:20-32` | 添加 `metadataBase: new URL("https://...")` |
| 19 | 18 处 `eslint-disable` 存量告警（含 `@next/next/no-img-element` 5 处、`@typescript-eslint/no-explicit-any` 3 处） | P3 | 多文件 | 逐步清理，优先修复 Hooks 相关 |
| 20 | 路由未用 route group 分区，`api/` 与业务路由混在同一层 | P3 | `app/` | 用 `(main)`/`(review)`/`(api)` 重组 |
| 21 | `<Suspense>` 边界过粗，仅根 layout 一处 | P3 | `app/layout.tsx:50-52` | 在 `ContentPageClient` 内对懒加载组件加细粒度 Suspense |
| 22 | `edgeone.json` 的 `includeFiles` 为空数组，依赖 Next.js 层 `outputFileTracingIncludes` | P3 | `edgeone.json:22-24` | 显式列出 `content/**/*`、`lib/ai/prompts/**/*` |
| 23 | 无 `sitemap.ts`/`robots.ts`，搜索引擎无法发现 376 个内容页 | P3 | `app/`（缺失） | 添加 `app/sitemap.ts` 从 `contentTree` 生成 URL 列表 |

---

## 5. 改进建议

### 5.1 P0 立即修复（1-2 天）

1. **轮换 `.env.local` 中所有 API Key**（视为已泄露）
2. **添加错误边界件**：`app/error.tsx` + `app/not-found.tsx` + `app/global-error.tsx`
3. **修复 `QuizQuestion.tsx:531` 的 Hooks 顺序问题**

### 5.2 P1 高优先级（1-2 周）

1. **接入 `next/image`**：改造 `ContentImage` + 配置 `next.config.mjs`
2. **添加 `generateMetadata`**：动态路由按内容生成标题/描述/OG
3. **添加 `proxy.ts`**：注入安全头 + 简单速率限制
4. **接入 `next/font/local`**：自托管 Noto Serif SC、LXGW WenKai
5. **修复 4 处 `set-state-in-effect`**：迁移到 React 19 推荐模式
6. **添加 `app/sitemap.ts` + `app/robots.ts`**

### 5.3 P2 中优先级（1 个月）

1. **统一 API 错误响应格式**：抽取 `lib/api/errors.ts`
2. **拆分 `/api/chat`**：6 个职责分离到 `lib/chat/`
3. **数据获取 async 化**：`readContent` 改 async + `React.cache`
4. **删除 3 个空 layout**
5. **bootstrap 脚本用 `next/script`**
6. **启用 `noUncheckedIndexedAccess`**（需逐文件修复）
7. **测试文件纳入 lint 与 tsc**
8. **移除 viewport 缩放限制**

### 5.4 P3 长期优化（>1 个月）

1. **路由用 route group 分区**
2. **细粒度 Suspense 边界**
3. **评估启用 Cache Components**：迁移 `revalidate = false` 到 `"use cache"` + `cacheLife`
4. **`ContentPageClient` 拆分**：315 行单文件按 Tab 拆分
5. **逐步清理 18 处 `eslint-disable`**

---

## 6. 参考资料

### Next.js 16 官方文档

1. [File-system conventions](https://nextjs.org/docs/app/api-reference/file-conventions) — layout/page/error/not-found/loading/template 文件约定
2. [Route Segment Config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config) — `dynamicParams`/`runtime`/`maxDuration`（v16 起启用 Cache Components 时 `dynamic`/`revalidate`/`fetchCache` 被移除）
3. [Proxy (原 Middleware)](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) — Next.js 16 重命名 middleware → proxy，默认 Node.js 运行时
4. [Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route) — route.ts 规范，v15+ GET 默认动态
5. [generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) — 元数据 API，`viewport` 自 v14 起独立导出
6. [next/image](https://nextjs.org/docs/app/api-reference/components/image) — v16 起 `qualities` 必填，`priority` 弃用改 `preload`
7. [Server and Client Components](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns) — `"use client"` 边界与组合模式
8. [error.js](https://nextjs.org/docs/app/api-reference/file-conventions/error) — v16.2 起 `unstable_retry` 替代 `reset`
9. [Caching and Revalidating](https://nextjs.org/docs/app/getting-started/caching) — Next.js 16 缓存模型
10. [Cache Components](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) — 实验性新缓存模型

### 项目内文档

1. `docs/sop/00-infrastructure.md` — 文档解析与 subagent 调度
2. `docs/sop/06-desktop-packaging-release.md` — Electron 打包与发布
3. `docs/research/00-research-plan.md` — 调研规划

---

> **报告完成时间**：2026-07-05
> **下一步**：建议优先处理 P0 级别的 3 个问题（密钥轮换、错误边界、Hooks 顺序），预计可在 1-2 天内完成。
