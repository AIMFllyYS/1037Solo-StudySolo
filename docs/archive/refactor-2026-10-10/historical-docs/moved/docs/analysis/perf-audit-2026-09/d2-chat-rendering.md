# D2 聊天渲染管线

> 范围：SSE → `readUIMessageStream` → 60ms 节流 → `updateMessage` → `ChatThread`/`ChatMessage`/`MessageContent` 全链路渲染成本。

## 板块总结

主流路径的工程化防线大体正确：虚拟化、兄弟消息引用相等、memo 边界、查看器 dynamic+idle 挂载都在。**但管线正中央是纯 O(n²)**：每个 60ms tick，`MessageContent` 对累积全文跑完整 unified 管线（micromark + remark×5 + rehype-raw/parse5 + sanitize + KaTeX + highlight），且 react-markdown 9.x 每次渲染无条件重建 processor 并重解析——无分段缓存/增量解析；思考流期间 reasoning 步骤还内嵌第二份 `MessageContent`，同 tick 双管线。三个放大器：`updateMessage` 每写重建 `sessionsMeta`（侧栏/项目 chip/历史层每 tick 全量重渲）、`AgentChatCenter` 三个派生 hook 每 tick 全扫会话 parts、`ArtifactCard` 自带 SSE 完全绕过节流。另有浮窗/移动端内联 `onFollowUpClick` 击穿 `ChatMessage` memo 的个例。

## 发现清单

### [P0-1] 流式期整条消息每 tick 全量重跑 unified 管线 — `components/chat/MessageContent.tsx:285-308`、`react-markdown@9 lib/index.js:163-167`

- **现状**：`parseChatContent(renderedContent)` 在累积字符串变化时全量重算 → `rendered` useMemo（`:296-308`）把**所有** block 重建为新元素树；每个 markdown block 走 `renderMarkdownWithSvg`（`:119-164`）→ `<ReactMarkdown>`。react-markdown 9.0.3 每次执行 `createProcessor(options)`（`:241-255`）+ `processor.parse` + `runSync`（`:164-166`）——children 逐字相同只要父级 re-render 也全量重跑：processor 构造 + micromark + remark-gfm/math/directive + `remarkDirectives` + `remarkCalloutSoftBreaks` (+`remarkSoftBreaks`/`remarkInlineCitations`) + remark-rehype + rehype-raw(parse5) + rehype-sanitize + **rehype-katex（每 math 节点一次 `katex.renderToString`）** + rehype-highlight + `post()` 全树 visit + toJsxRuntime。
- **影响（量化）**：消息长 L、流式写入 K 次，总成本 ≈ O(L×K) ≈ O(L²)。KaTeX 是大头：理科回答 20-50 公式常见，`renderToString` 约 1-5ms/个 → **单 tick 50-250ms**，远超 16.6ms 帧预算；`useStreamingText`（`useStreamingText.ts:8`）只把 >8KB 降到 100ms、>40KB 降到 200ms——≤8KB 仍每 60ms 全解析，且**降频不降单次成本**。思考链内嵌第二份 `MessageContent`（`ReasoningTraceStep`）同 tick 双倍。插件数组本身稳定（`sharedRemarkPlugins`/`sharedRehypePlugins` 模块级、`remarkPlugins` useMemo `:289-294`）但 react-markdown 内部照旧重建 processor，这份稳定没换来收益。
- **方向**：①分段渲染——`renderBlocks` 每个子树包 `React.memo` 的 `<MarkdownBlock content>`，content 相等整段跳过（须先把「已完成前缀」与「增长中尾块」拆开，尾块独立 ReactMarkdown）；②KaTeX 密集场景做内容寻址缓存 `Map<tex,html>`；③processor 级 memo 或换增量解析。
- **验证**：Profiler 记录每 tick `ReactMarkdown` 执行次数与 `runSync` 耗时；基线 = 每 tick 仅尾块重解析。

### [P1-2] `updateMessage` 每写重建 `sessionsMeta`，侧栏/历史层每 tick 全量重渲 — `lib/stores/chatHistory.ts`（updateMessage 路径）

- **现状**：updateMessage 内 `sessionsMeta` 重算 `preview`/`messageCount`/排序 → 新数组引用 → 所有订阅 `sessionsMeta` 的组件（历史面板、项目 chip、SessionList）每 tick 重渲。
- **影响**：流式 16 次/秒 × N 个订阅组件；`persistManifest` 已门控（仅 artifactIds 变化写盘，`chatHistory.ts:483-485`）但**内存态数组仍每 tick 新建**。
- **方向**：meta 更新按「轮边界/标题/preview 真变化」门控；或将 preview 更新挪到流结束（`finally` 已 flush）。
- **验证**：流式中 React DevTools 计数 SessionList 渲染次数。

### [P1-3] `AgentChatCenter` 派生 hook 每 tick 全扫会话 parts — `components/chat/AgentChatCenter.tsx`（token tracker、citations、traceSources 等三个派生）

- **现状**：三个 useMemo/hook 依赖会话 messages，每 tick 遍历全部已加载消息 parts 聚合。
- **影响**：O(会话 parts)/tick；500 消息 × 平均 6 parts ≈ 3000 part 扫描 ×16/s——单项不大但与 P1-2 叠加构成「每 tick 全量税」。
- **方向**：增量聚合（按 messageId 缓存已算部分）或挪到流结束算一次。
- **验证**：Performance trace 中 hook 耗时。

### [P1-4] `ArtifactCard` 自带 SSE 通道绕过节流 — ArtifactViewer 相关组件

- **现状**：artifact 生成走独立 SSE，其渲染不经过 `streamUiThrottle`，HTML/代码块高频重渲。
- **影响**：大 artifact 流式期间重渲频率不受 60ms 约束。
- **方向**：接入同一节流设施或按帧 rAF 合批。
- **验证**：artifact 流式期渲染计数。

### [P2-5] 浮窗/移动端内联 `onFollowUpClick` 击穿 `ChatMessage` memo — FloatingChatBody / MobileMiniChat 调用点

- 每次渲染新建回调 → memo 失效 → 兄弟消息跟随重渲（ChatPanel 路径因引用稳定而不受影响）。
- **方向**：稳定引用（useCallback 或 data-attribute 委托）。

### [P2-6] `useChatReady` 裸 `useChatHistory.subscribe` 无 selector — `lib/hooks/useChatReady.ts:8-16`

- `useSyncExternalStore(subscribe=store.subscribe)`：每次 store set（含每 tick）都跑 getSnapshot。返回 boolean 不重渲，但 N 实例 × O(1) 评估仍在（ChatPanel、FloatingChatBody、MobileMiniChat 多处实例化）。
- **方向**：换 `useChatHistory(s => ...)` selector。

### [P2-7] `LazyVisible`/流式观察器的逐 child 重挂 — `components/ui/LazyVisible.tsx` + `ReasoningTraceStep.tsx:32` 第二实例

- observeChildren 断开-重挂可简化为只对容器 observe（scrollHeight 变化已覆盖）；优于裸 rAF 的现状不必动，只去重挂。
- **验证**：流式中 observer 回调计数。

### [P2-8] base64 图片/附件渲染路径健康 — `ChatImage.tsx:44-56`、`chatHistory.ts:413`

- `loading="lazy" decoding="async"` 已有；`persistInlineAttachments` 把大附件换 IDB ref；markdown 残留 base64 概率低。仅记录。

## 已确认做对的防线（勿回归）

- `useChat` messages selector 按会话数组引用（`useChat.ts:58-61`），标量 selector（`:64-66`）；`sendMessage`/`handleFollowUpClick` 引用稳定 → ChatPanel 路径每 tick 仅流式那条重渲。
- `sharedRemarkPlugins`/`sharedRehypePlugins`/`mdComponents`/`directiveComponents` 模块级单例（`plugins.ts:14-54`、`MessageContent.tsx:67-88`）。
- `streamUiThrottle` trailing 合并 + `finally` flush（`executeChatRequest.ts:38-39,83-84`）。
- 折叠即卸载：`VizFold:27`、`WebSourceFold:84-103`、`AgentTrace bodyMounted:155-167`、`AgentTraceStep:75-84`。
- 查看器 15 层全部 `next/dynamic ssr:false` + idle 闸门（`DeferredWindowLayers.tsx:8-48`）。
- SDK 原地改 parts 的意外收益：`useMemo([parts])` 流式期不重算 citations/traceSources（`ChatMessage.tsx:84-93`）——但这也意味着流式期数据滞后、靠结束时 `parts.map`（`consumeStudyStream.ts:245`）补算；属偶然正确，**重构时勿当契约依赖**。

## 实施期建议补的护栏

- 自动化计数：`ReactMarkdown` 执行次数/`processor.runSync` 耗时打点（CI mock 记数）。
- `data-render-count` 或 why-did-you-render 基线：**每 tick 渲染数 = 1 条流式消息 + 其尾块**。
