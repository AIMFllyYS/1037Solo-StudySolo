# Agent 页面 UX 收尾（来源 / 出题 / 顶栏 / i18n / 划词）

日期：2026-09-21
分支：`feat/agent-ux-finalization`（从 `origin/dev` @ `b6a42b27` 切出）
状态：**已实施**（落地记录见 [`agent-ux-finalization.execution.md`](./agent-ux-finalization.execution.md)）

> 参考设计：Perplexity（用户提供的两张截图）。**截图里的左栏是用户的 Perplexity 账号，不是本项目**；
> 只取它的信息架构（顶部 Answer / Links / Images 分段、右上角固定 Sources 框、点击后右侧抽屉出 Sources 面板）。

---

## 1. 需求（用户原话拆解）

| # | 需求 | 落点 |
|---|---|---|
| 1 | 联网搜索了哪个笔记、搜索了什么内容 → 都要有来源显示 | 来源数据模型补 `query` + 右上角固定来源框 + 右侧来源面板 |
| 2 | Agent 自动出题，参考 Perplexity | 出题移到右侧面板（不再在线性对话流里答题） |
| 3 | 顶部导航栏 Answer / Links / Images，顶部可微切换 | Agent 中央区顶部分段控件 |
| 4 | 生成 HTML / 图片仍在正常对话里跑 | Answer 页签 = 现有对话，不搬家 |
| 5 | 来源框固定在 Agent 对话界面右上角 | 演进：`AgentSourceDock`（浮层卡片）→ 右侧固定栏 → `AgentSourcePanel`（占宽的浮层卡片，最终） |
| 6 | 拉开右侧面板时，来源框自动隐藏 | 读 `agentDockCollapsed` |
| 7 | 点来源框 → 从右侧拉出面板（右导航 + 核心页两栏），复用现有来源设计 | 复用 `SourceTraceViewer` + `DocumentWorkspace`，按搜索轮次分组 |
| 8 | 出题直接在右侧面板 | `quiz-dock` 窗口 + 自动开右栏 |
| 9 | 划词助手：划选 → 右侧拉出复用 Agent 的窗口，Codex 式交互；复制 / 引用照旧 | `floating-chat` 在 Agent 下本就 dock；补齐拉出、标题、引用 |
| 10 | i18n：默认中文，设置页可切中英文 | `lib/i18n` + `settings.locale` |
| 11 | 左栏项目名称右侧加「+」（同 Projects 分割线右侧加号），点它在该项目下新建对话 | 已存在（`agent-project-new-chat-*`），改为**常显** |

## 2. 现状（已核实的事实，不是推测）

- Agent 外壳：`app/agent/layout.tsx` → `AgentShell`（左栏 + 中央插槽）；右侧工作区是顶层 `AppShell` 里与顶栏并列的一列
  （`Panel id="agent-shell-dock"` → `AgentDockColumn` → `AgentDockHost` → `RightPanel hideBuiltinTabs showWindowDock`）。
  右栏收起时 Panel 宽度 0，**宿主仍挂载**，所以 `resolveManagedWindowPresentation` 能返回 `dock`。
- 窗口形态唯一解析入口：`lib/window/useManagedWindowSurface.ts` → `resolveManagedWindowPresentation({agent, mobile, dockHostAvailable})`。
  Agent 桌面下所有 `ManagedWindow` Portal 到 `AGENT_DOCK_CONTENT_ID`（右栏内容宿主），**浮动聊天窗口也一样**——划词助手已经会 dock。
- 打开窗口会 `useAgentDockRuntime.requestOpen()`，`AgentDockHost` 收到后自动展开右栏。
- 窗口按对话隔离：`lib/window/sessionScope.ts`。`useFloatingChats.openWindow` 不传 `sessionId`，
  于是落成"打开时的那条对话"，会在该对话的右栏里显示。
- 来源：`lib/chat/traceSources.ts#collectMessageSources` 只从 `searchNotes.hits` + `webSearch.sources` 收集，
  **丢掉了 query**；渲染在 `FollowUpQuestions` 的「来源 · N」按钮 → `openSourceTrace` → `source-trace-viewer` 窗口
  （`SourceTraceViewer` + `DocumentWorkspace` 的目录/正文两栏——需求 7 说的"现有设计"就是它）。
- 出题：`createQuiz` 工具 → `components/chat/toolCards/createQuizCard.tsx` → `ChatQuizCard` 折叠卡，**在对话流里**。
- 划词助手：`components/notes/SelectionPopover.tsx` → 复制 / 解释 / 记录 / 笔记 / 追问 / 引用；
  解释与追问走 `useFloatingChats.openWindow`。
- i18n：**不存在**。全仓无 next-intl / react-i18next / locale 目录，文案硬编码中文。
- 左栏项目「+」：`AgentConversationSidebar.tsx` 已有 `agent-project-new-chat-<id>`，但 `opacity-0 group-hover:opacity-100`（悬停才现）。

## 3. 架构决定

### 3.1 i18n

```
lib/i18n/
  types.ts        Locale = 'zh' | 'en'; LOCALES; DEFAULT_LOCALE = 'zh'
  messages/zh.ts  中文词典（真相源，类型从这里推导）
  messages/en.ts  英文词典（satisfies 同一形状）
  index.ts        translate(locale, key, vars) / useT() / useLocale() / setLocale()
  dom.ts          syncDocumentLocale(locale) → <html lang> + data-locale
```

- 词典**按命名空间分组**的嵌套对象，key 形如 `agent.nav.answer`；取值走 dot-path，缺失回退中文并 `console.warn`（开发期）。
- 变量插值 `{count}` 形式。
- `useT()` 读 `useSettings(s => s.locale)`，返回**稳定引用**的 `t`（`useCallback` 依赖 locale）。
- 本期迁移范围 = **Agent 面**：Agent 左栏、中央顶栏、来源（框 / 面板 / 分组标题）、出题面板、划词助手、右栏外壳、设置页语言行。
  整套应用全量汉化→英文是机械但巨大的后续工作，本期不做，登记为后续（见第 6 节）。

### 3.2 中央顶栏（Answer / Links / Images）

- 新 store `lib/stores/agentCenter.ts`：`centerTab: 'answer' | 'links' | 'images'`，`setCenterTab`。不落盘；切对话时回 `answer`。
- 新组件 `components/agent/AgentCenterTabs.tsx`：Perplexity 式分段控件（图标 + 文案），置于中央区最顶。
- **Answer 页签必须保持 `ChatPanel` 常驻**（`display:none` 隐藏而非卸载）：
  `ChatPanel` 的注释明确写了 ChatThread 不可卸载（`SelectionPopover` 的容器 ref 绑在挂载时），卸载会导致 Agent 里再也选不中文字。
- Links 页签 = 本对话的来源清单（按搜索轮次分组，显示 **query**）；Images 页签 = 本对话的图片（`imageSearch` / `searchNoteImages` / `generateImage`）。
- 生成 HTML / 图片仍在 Answer 对话流里跑（需求 4）。

### 3.3 来源

- `lib/chat/traceSources.ts` 增补：
  - `SourceRound`：`{ id, tool, query, label, sources: TraceSource[] }`
  - `collectMessageSourceRounds(parts)`、`collectSessionSourceRounds(messages)`（跨消息、按轮次保序、按 key 去重）
  - `TraceSource` 增可选 `query?: string`、`roundId?: string`
  - `collectMessageSources` **保持原样**（兼容既有调用与测试）
- 来源框形态**改过三版，终版是 `components/agent/AgentSourcePanel.tsx`**：
  浮层卡片（初版 `AgentSourceDock`，`position:absolute; top; right`）→ 右侧固定栏 → **占真实宽度的浮层卡片**（终版：
  看起来是浮层，实际占掉对话列旁边的一列，正文让开而不是被压住）。
  三版都是「来源 · N」+ 前几个来源的 host / 标题 chip，点击 → `openSourceTrace()`（右栏面板）+ 展开右栏。
  **隐藏条件**（三版一致）：右栏已展开（`!agentDockCollapsed`）、没有来源、移动端、`centerTab !== 'answer'`。
- `SourceTraceViewer` 增分组渲染：目录里按轮次插分组标题（query 行），点分组标题可展开/收起（默认展开）。

### 3.4 出题（右栏）

- 新增窗口类型 `quiz-dock`（`lib/stores/windowManager.ts` 的 `ManagedWindowType` + `DeferredWindowLayers` 映射）。
- `components/quiz/QuizRunner.tsx`：从 `ChatQuizCard` 抽出的答题主体（纯作答 UI，无外壳）。
- `components/quiz/AgentQuizWindow.tsx`：`ManagedWindow` + `QuizRunner`，dock 到右栏。
- `lib/quiz-dock/open.ts`：`openAgentQuiz({ quizId, title, intent, questions, droppedCount })`（幂等：同 quizId 复用窗口）。
- Agent 模式下 `createQuiz` 结果不再渲染折叠答题卡，而是一条「已出题 · N 题 → 在右侧作答」的瘦卡片，点击开右栏；
  Studio 模式保持现有折叠卡（`useIsAgentSurface()` 判定）。
- 自动开右栏：Agent 对话里检测到新的 `createQuiz` 输出 → `openAgentQuiz`（设置 `agentQuizInDock` 默认 `true` 可关）。
- `ChatQuizCard` 的既有测试保持通过（内部改为复用 `QuizRunner`）。

### 3.5 划词助手

- 现状已经 dock（复用 `floating-chat` + `FloatingChatBody`）。本期补齐：
  1. 划词「解释 / 追问」后右栏一定被拉出（`requestOpen` 已有；验证并补测试）；
  2. 窗口标题在 Agent 下用「划词 · <选中片段>」而不是固定「AI 解释」；
  3. 复制 / 引用照旧（`SelectionPopover` 不动逻辑）。

### 3.6 左栏项目「+」

`opacity-0 group-hover:opacity-100` → 常显（`text-[var(--ink-faint)]`，hover 提亮），与 Projects 分割线右侧那个加号一致。

## 4. 不做（本期范围外）

- 全应用 i18n 全量迁移（只做 Agent 面 + 基础设施）。
- 多文档并排、右栏拖拽停靠、刷新恢复标签。
- Perplexity 式的「Computer / Artifacts / Customize」导航改名。

## 5. 验收

- 三套测试（`pnpm test:unit` / `test:content` / `test:react`）+ `typecheck` + `lint:eslint` + `build` 全绿。
- 真浏览器（`http://localhost:35349/agent`）逐项截图验收：顶栏三页签、来源框与自动隐藏、来源面板分组、右栏出题、划词出窗、中英文切换、项目「+」。

## 6. 后续（登记，不在本期）

- i18n 全量迁移剩余界面（Studio / Class / 内容页 / 设置详情）。
