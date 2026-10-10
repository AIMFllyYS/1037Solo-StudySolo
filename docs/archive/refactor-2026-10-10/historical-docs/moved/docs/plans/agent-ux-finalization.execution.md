# Agent 页面 UX 收尾 · 实施记录

日期：2026-09-21
分支：`feat/agent-ux-finalization`（基线 `origin/dev` @ `b6a42b27`）
方案与需求拆解见同目录 [`agent-ux-finalization.md`](./agent-ux-finalization.md)。

---

## 1. 需求 → 落点对照

| # | 用户要求 | 实现 | 证据 |
|---|---|---|---|
| 1 | 搜索了哪个笔记 / 搜了什么内容都要有来源显示 | `SourceRound`（query + 来源）+ 右上角来源框 + 「来源」页签按轮次列出 query | 截图：来源页签显示 4 轮、每轮带搜索词 |
| 2 | Agent 自动出题，参考 Perplexity | `createQuiz` 在 Agent 面不再渲染折叠答题卡，改开右栏 `quiz-dock` 窗；对话里只留一条瘦行 | 截图：右栏出题窗 + 「已出题 · 2 题 / 在右侧作答」 |
| 3 | 顶部 Answer / Links / Images 可切换 | `AgentCenterTabs`（回答 / 来源 / 图片，带计数徽标） | 截图：顶部三页签 |
| 4 | 生成 HTML / 图片仍在对话里跑 | 回答页签只**隐藏**不卸载 ChatPanel；生成类工具卡一个没动 | — |
| 5 | 来源框固定在右上角 | `AgentSourceDock`（浮层）→ 右侧固定栏 → `AgentSourcePanel`（占宽的浮层卡片，最终；见第 8 节） | 截图：右栏收起时右上角出现「来源 · 8」 |
| 6 | 拉开右侧面板时来源框自动隐藏 | `hidden={isMobile \|\| !agentDockCollapsed \|\| centerTab !== "answer"}` | 截图：右栏展开后来源框消失 |
| 7 | 点来源框 → 右侧拉出面板，右导航 + 核心页两栏 | 复用 `openSourceTrace` → `source-trace-viewer`（`DocumentWorkspace`），目录按轮次分组 | 截图：来源面板 4 组 + 正文 |
| 8 | 出题直接在右侧面板 | 同上（自动开右栏、每 quizId 只自动弹一次） | 截图 |
| 9 | 划词 → 右侧拉出复用 Agent 的窗口 | `floating-chat` 在 Agent 下本就 dock；本轮补窗口标题「划词 · …」并在标题写入处保住前缀 | 标签条显示「划词 · …」/「Selection · …」 |
| 10 | i18n：默认中文，设置页可切中英文 | `lib/i18n`（93 key，zh 为真相源）+ `settings.locale` + 外观页语言分段控件 | 截图：切 English 后 Answer / Links / Images / Projects |
| 11 | 左栏项目名称右侧常显「+」 | `AgentConversationSidebar` 的 `agent-project-new-chat-*` 由 `opacity-0 group-hover` 改为常显 | 截图：「细胞生物学」行右侧的 + |

## 2. 新增模块

| 模块 | 职责 |
|---|---|
| `lib/i18n/` | `Locale` / zh·en 词典 / `translate` / `useT` / `syncDocumentLocale`。zh 是形状真相源，en 走 `satisfies` |
| `lib/stores/agentCenter.ts` | 中央区当前页签（回答 / 来源 / 图片），不落盘，换对话回回答 |
| `lib/agent/sessionImages.ts` + `lib/hooks/useSessionImages.ts` | 会话级图片收集（图搜 / 笔记配图 / 已生成），纯函数与订阅分离以便 node:test |
| `lib/hooks/useSessionSources.ts` | 会话级检索轮次（`rounds` / `sources` / `total`），返回稳定引用 |
| `lib/quiz-dock/open.ts` | 出题窗唯一入口（幂等 + sessionStorage 去重，刷新不重弹旧题） |
| `components/agent/AgentCenterTabs.tsx` | 顶部分段开关 |
| `components/agent/AgentSourcePanel.tsx` | 右上角来源框（**终版**：占真实宽度的浮层卡片；初版是 `AgentSourceDock` 浮层，见第 8 节） |
| `components/agent/AgentLinksPane.tsx` / `AgentImagesPane.tsx` | 来源 / 图片两个页签 |
| `components/agent/sourceRoundLabel.ts` | 轮次标题 → `trace.tool.<tool>.label` 的映射（与思考链工具卡片同一句话；早期的 `agent.sources.round.*` 已删） |
| `components/quiz/QuizRunner.tsx` | 从 ChatQuizCard 抽出的作答主体，对话卡与右栏窗共用 |
| `components/quiz/AgentQuizWindow.tsx` | 右栏出题窗图层 |

主要改动文件：`AgentChatCenter.tsx`（组装三页签 + 来源框）、`lib/chat/traceSources.ts`（`SourceRound` 与会话级聚合）、
`components/chat/SourceTraceViewer.tsx` + `components/window/DocumentWorkspace.tsx`（按轮次分组）、
`lib/stores/windowManager.ts` + `components/window/DeferredWindowLayers.tsx` + `WindowTypeIcon.tsx`（`quiz-dock` 类型）、
`components/chat/toolCards/createQuizCard.tsx`（Agent 瘦行 + 自动开窗）、`components/chat/FloatingChatWindow.tsx`（划词窗标题）、
`components/layout/AgentConversationSidebar.tsx`（常显 +、i18n）、`lib/stores/settings.ts`（locale）。

## 3. 关键决定与理由

1. **回答页签只隐藏、不卸载 ChatPanel**：ChatThread 的划词容器 ref 是挂载时绑定的，卸载再挂载会让
   `SelectionPopover` 错过新节点（ChatPanel 里原有注释已写明这个坑）。
2. **词典以中文为真相源**：现有文案全是中文，迁移只做「字面量搬进字典」；`en.ts satisfies LocaleMessages`
   保证中英 key 集合一致，漏翻在 typecheck 阶段就报错。
3. **i18n 只覆盖 Agent 面**：全应用全量迁移是机械但巨大的后续工作，本期不做（见第 6 节）。
   为并行开发方便，`TranslateKey` 允许任意字符串：先引用未落地 key 不会编译失败，运行时回退中文并开发期告警。
4. **来源轮次标题只有一个来源**：`SourceTraceViewer` 的兜底就是工具展示名（`trace.tool.<tool>.label`），
   与思考链里的工具卡片同源。曾经为了绕开措辞分歧，调用方会在打开面板前把 `agent.sources.round.*` 的文案
   贴进 `round.label` —— 那套同义 key 与本层一起删了；`label` 字段保留给显式覆盖用。
5. **出题自动开窗用 sessionStorage 去重**：刷新页面重放历史消息时不会把旧题重新弹出来（与「刷新不自动弹出历史窗口」的既有语义一致）。
6. **划词前缀加在窗口标题而不是会话标题**：会话标题会被 `/api/chat-title` 自动改写，贴在那里等于白贴。

## 4. 验证

| 闸门 | 结果 |
|---|---|
| `pnpm typecheck` | 通过（0 错） |
| `pnpm test:unit`（node:test） | 1443 通过 / 0 失败 |
| `pnpm test:react`（vitest） | 165 文件 / 665 用例全绿 |
| `pnpm lint:eslint` | 0 error / 88 warning（历史噪声，仓库口径「只看 exit code 与 error」）；**本次改动涉及的 16 个文件单独跑 eslint 为 0 问题** |
| `pnpm lint:knip` | **失败，但与本次改动无关**：在 HEAD（`git stash` 后）跑 `npx knip` 得到完全相同的 3 个未使用文件 + 14 个未使用导出 + 1 个未使用类型，exit 1。既有基线问题。 |
| `pnpm build` | 通过（prebuild 闸门链 + `next build` 全绿） |
| 真浏览器验收 | `http://localhost:35349/agent`，见第 5 节 |

### 4.1 顺手修掉一个阻塞闸门的 flaky

`pnpm build` 连续两次在 prebuild 的单测步挂掉：`lib/ai/sdk/heartbeat.test.ts`
（`expected >=2 heartbeats, got 1`）。单独跑 3/3 通过 —— 是**测试写法**的问题而不是产品缺陷：

测试原本用 `await sleep(35)` 等两个 10ms 心跳周期。事件循环被占住时（`run-unit-tests.mjs` 单进程并行跑全部
`.test.ts`，本分支又新增了一个测试文件），一个 tick 只会跑一次 interval，等再久也只拿到 1 个心跳。

改法：判据从**时钟**换成**真实数据** —— 读到第 2 个心跳再放行首 chunk。断言一字未改，
语义（首 chunk 前有心跳、首 chunk 后停止）完全保留，结果确定。这是纯测试加固，不碰 `lib/ai/sdk/heartbeat.ts`。

## 5. 浏览器验收步骤与结果

用 `agent-browser` 在真实 `next dev`（35349）上逐项走查。**AI 请求需要登录**（当前是访客），
所以来源 / 出题 / 划词三项用**注入 IndexedDB 的合成会话**驱动（`gailvlun-db/keyval` 的 `chat-manifest` + `chat-session:<id>`），
其余项用真实交互。

| 项 | 结果 |
|---|---|
| 顶部三页签（回答 / 来源 8 / 图片 2） | ✅ 徽标计数正确，切换生效 |
| 右上角来源框（右栏收起时出现） | ✅ 「来源 · 8」+ host / 笔记标题 chip |
| 右栏展开后来源框自动隐藏 | ✅ |
| 点来源框 → 右侧来源面板 | ✅ 目录按 4 个检索轮次分组，每组带搜索词 |
| 来源页签 | ✅ 4 轮 × 各自来源，标题 + 路径/URL |
| 图片页签 | ✅ 分组网格，点击开 Lightbox |
| 出题进右栏 | ✅ 自动开 `quiz-dock`，对话里只剩「已出题 · 2 题 / 在右侧作答」 |
| 划词 → 解释 | ✅ 右栏新增标签「划词 · …」，会话落进「划词摘录」项目 |
| 设置 → 外观 → 语言 → English | ✅ `<html lang>` / `data-locale` 变 en，页签变 Answer / Links / Images，侧栏变 Projects / Recents |
| 左栏项目「+」常显 | ✅ |

## 6. 已知边界（不在本期）

- **i18n 只覆盖 Agent 面**：Studio / Class / 内容页 / 设置详情仍是中文硬编码。基础设施已就位，
  后续按模块把字面量搬进 `lib/i18n/messages/zh.ts` 即可（`en.ts` 漏 key 会被 typecheck 拦下）。
- **设置浮层仍在中央**（`AgentSettingsOverlay` 是居中 dialog），没进右栏 —— 属 `agent-right-panel-unification` 的第二阶段。
- **右栏内的笔记正文没有划词助手**：`SelectionPopover` 目前只挂在对话容器上，右栏文档里划词暂无动作。
- **来源框的最终形态是「占真实宽度的浮层卡片」**（见第 8 节）：看起来像浮层，但它是一条实打实的列，正文会让开，因此不存在与正文叠的问题；移动端仍隐藏。
- `pnpm lint:knip` 的既有基线失败需要单独一轮清理，不属于本分支。

---

## 7. 第二轮：非正文界面全量汉化（同日追加）

用户追加口径：把**所有非正文、非侧边栏板块**都补上 i18n。
「正文 / 侧边栏」被明确定义为 **Studio 的章节名称与全部正文内容** —— 那部分文本量巨大且没有翻译价值，**不在范围内**。

### 7.1 覆盖范围与规模

| 命名空间 | key 数 | 覆盖 |
|---|---|---|
| `settings.*` | 366 | 设置页全部：通用 / 外观 / 模型 / Agent 能力 / Skills / 数据与账户、API 分组、生图、能力端点、账号弹窗、快捷键设置 |
| `window.*` | 425 | 右侧面板里的**业务窗口**：来源查看器、笔记编辑器 / 笔记库 / 课堂便签 / 闪卡引用、项目文件、记忆收件箱、浏览器、画布、测验界面 |
| `panel.*` | 191 | 面板与窗口外壳：右栏本体、标签条、窗口 chrome、文档阅读器外壳、用量 / 计费 / 额度 / 存储 |
| `trace.*` | 175 | **思考链与工具展示**：步骤状态、折叠标题、工具名与摘要、消息外壳、欢迎页、可视化降级卡、21 个工具的展示元数据 |
| `menu.*` | 143 | 菜单与浮层：模型菜单、思考力度、历史、右键菜单、输入区与命令面板、划词助手、快捷键浮层、模式切换 |
| `app.*` | 18 | 应用级外壳：顶栏、加载态、灯箱、账户条 |
| `agent.*` | 93 | 第一轮已完成的 Agent 面 |
| **合计** | **1411 × 2** | zh / en 两侧 key 集合逐字一致（由 `en.ts satisfies LocaleMessages` 与 `index.test.ts` 双重锁死） |

> 上表是第二轮结束时的快照（保留作历史）。2026-09 代码清洗后的实测值是 **1424**：
> 删掉 36 条死 key / 同义重复 key（21 条零引用 + 3 条轮次同义 + 12 条动作词同义），
> 新增顶层 `common.*` 4 条；其余差额来自该轮之后新增的 `share.*` 等命名空间。

### 7.2 关键改动（不只是搬字符串）

1. **`ToolPresentation` 改成 key 字段**：`label` / `settingsLabel` / `description` → `labelKey` / `settingsLabelKey` / `descriptionKey`，类型 `I18nKey`（type-only import，不会把 i18n 拖进工具模块）。
   21 个 `presentation.ts` 全改，字段打错即编译错误。这是「调用了什么工具」能被翻译的根。
2. **词典分片**：`lib/i18n/messages/parts/{zh,en}/<namespace>.ts`，六个命名空间各自一份文件。
   分片是为了让六路并行迁移各改各的文件 —— 单文件词典在并行编辑下必然丢更新。`zh.ts`/`en.ts` 只做合并。
3. **纯数据模块改成 key 形式**：`lib/keyboard/shortcuts.ts`、`lib/theme/appearance.ts`、`lib/sync/usage.ts`、`lib/notes/selectionAssistant.ts`、`lib/stores/agentProductPicker.ts`。
4. **窗口标题在开窗时就翻好，不把 key 存进 windowManager**：窗口标题会经通用 chrome（`WindowTaskbar` / `AgentDockTabs` / `OverflowMenu`）**原样渲染**，
   存 key 会让标签条直接显示 `panel.addMenu.document`。代价是切语言后已开的窗要重开才更新标题，这个取舍是有意的。
5. **`buildTrace` 的 `t` 是可选第三参**（缺省按 store 当前语言取词），避免打断不在清单里的既有调用方；`agentProcessingLabel` 的 `t` 改成必填。

### 7.3 闸门（第二轮）

| 闸门 | 结果 |
|---|---|
| `pnpm typecheck` | 通过（0 错） |
| `pnpm test:unit` | 1444 / 1444 |
| `pnpm test:content` | 2157 / 2157 |
| `pnpm test:react` | 全绿 |
| `pnpm lint:eslint` | 0 error（94 warning，历史噪声基线内） |
| `pnpm build` | 通过 |

### 7.4 浏览器验收（切到 English）

| 项 | 结果 |
|---|---|
| 设置页六个分节 + 语言行 | ✅ General / Appearance / Models / Agent capabilities / Skills / Data & account |
| 顶栏 / 左栏 / 顶部分段 | ✅ New chat / My assets / Scheduled / Plugins / PROJECTS / RECENTS / Answer / Links / Images |
| **思考链工具展示** | ✅ `Searched notes / done / Found 3 notes`、`Searched the web / done / 2 sources`、`Searched images` |
| 消息外壳 | ✅ `Took 8s` / `Web search on` / `Activity` / `Done` / `Cited notes · 4` / `Web sources · 2` / `You might also ask` |
| 右侧面板窗口标题 | ✅ `Sources · 8` / `Quiz · <卷面名>` |
| 出题窗 | ✅ `Question 1 / 2` / `Single choice` / `Basic` / `2 pts` |
| 正文与题目本体 | ✅ 保持中文（正确：那是内容，不是界面） |

### 7.5 第二轮**有意不做**的（附理由，第三轮可挑）

1. **`components/shared/directives/**` 的卡片外壳**（约 20 条）：概念卡 / 记忆卡 / 事件卡 / 时间轴 / 因果链 / 推导过程 / 核心要点 / 历史地图。
   它们渲染在笔记与答案**正文里**，正是用户划定「正文不动」的那一类 —— 而且其中 `CauseEffect` 的 `因：/原因：/果：/结果：/影响：` **是解析模型输出的前缀**，翻了会直接打断解析。
2. **`lib/stores/**` 的窗口标题 / toast / 错误串（约 50 条）：技术上可做，但它们跨 store 层，且 `lib/stores/settings.ts` 为了避开 store ↔ i18n 循环导入（该文件只依赖 `@/lib/i18n/types`）**不能**直接 `translate`。
   要收这一批得先换机制（warning 存 code，或让 i18n 提供一个不反依赖 settings 的 translate）。
3. **`lib/hooks/` 的账户条与图片附件提示（8 条）**、**`lib/chat/` 的若干 info/错误串**、**`lib/notes/` 的阻止原因**：同属 store/hook 层，同上。
4. **`lib/quiz/types.ts` 的 `TYPE_LABELS`**：经核实它是**喂给模型的上下文**（`quizExplain` 的 seed → `sendMessage`），界面侧已在 `QuizQuestion` 的渲染点走词典。**不翻是对的。**
5. **交互演示目录（`components/interactives/registry.ts`，约 35 条 title/description）**：属内容数据。
6. **登录 / 人机验证**（`components/auth/**`）：用户没有点名，且只在退出登录时可见，本轮跳过。

### 7.6 一处需要你知道的机制遗留

`lib/stores/settings.ts` 的 `settingsLoadWarning`（设置页顶部告警横幅）**本轮没翻**：
该文件第 18 行明确「只依赖 `@/lib/i18n/types`，避免 store ↔ i18n 运行时循环导入」，所以它拿不到 `translate`。
同理 `lib/context/estimateFullContext.ts` 必须保持零依赖（`app/api/chat/route.ts` 会 import 它），它的 `formatContextCacheValue`（命中 / 未命中）也没翻。
两处都要先解决机制问题，不适合顺手塞进来。

---

## 8. 演进记录：来源框的三种形态（第三轮追加）

需求 5「来源框固定在右上角」前后落地过三版，前两版的产物已经不在代码里，但**验收结论仍然有效**
（每一项验收的都是"右上角有一块来源框 + 右栏展开时让位"这个行为，三版都满足）：

| 版本 | 形态 | 产物 | 结局 |
|---|---|---|---|
| v1 | 浮在正文之上的浮层卡片（`position:absolute; top; right`，会压住正文） | `components/agent/AgentSourceDock.tsx` | 已删除 |
| v2 | 右侧固定栏（Perplexity 口径，占满一列） | 复用 `AgentSourceDock` 的位置 | 已改回 |
| v3（最终） | **看起来像浮层卡片（圆角 + 阴影 + 可拖动改大小），实际占真实宽度** | `components/agent/AgentSourcePanel.tsx` | 当前 |

保留这条记录是因为 v3 是**反直觉**的：它长得像浮层，所以很容易被后来者当成"绝对定位、会压正文"而"修"回 v1；
判断口径写死在 `lib/stores/agentCenter.ts` 的 JSDoc 里 —— **尺寸可调 ⇒ 像浮层；占真实宽度 ⇒ 不是浮层**。
