# Agent 左栏 / 我的资产 / 项目文件 · 落地记录

配套规划：[`agent-sidebar-assets.md`](./agent-sidebar-assets.md)（含三项已确认口径与边界表）。
分支：`feat/agent-right-panel-unification`；起点 `6289c40e`，终态提交见文末。

## 附一 · 外壳：左栏提到布局层（`feat(agent-shell)`）

**改法**

| 落点 | 改动 |
|---|---|
| `components/layout/AgentShell.tsx`（原 `AgentWorkspace.tsx`） | 签名改为接 `children`：左栏（分栏 Panel、吸附、折叠、拖拽骨架、`--agent-left-width` 观测）原样保留，中央区变成路由插槽 |
| `app/agent/layout.tsx`（新） | `/agent/**` 共用同一个左栏 |
| `components/agent/AgentChatCenter.tsx`（新） | 原 `ChatPanel hideHeader emptyLayout="agent"` 槽位 |
| `lib/hooks/useAgentChatContext.ts`（新） | 外壳与页面共用同一份 chatContext（只带科目 + 学年） |
| `app/agent/{scheduled,plugins}/page.tsx` + `AgentPlaceholderPage`（新） | 两个占位页：明写「未开发」，不摆假开关、不放假数据 |

**关键决定**：`#notes-panel` 锚点从对话组件内部挪到外壳的中央区。窗口全屏（`fullscreenTarget="notes"`）要量它，而 `/agent/assets` 这类子路由里没有 ChatPanel——锚点若留在对话组件里，这些页面上全屏会量不到矩形。

**实测**（Playwright，1440×900，`http://localhost:35349`）

```
/agent            sidebar=true  main=true  notesPanelOnMain=true  chatPanel=true   dock=true
/agent/scheduled  sidebar=true  main=true  notesPanelOnMain=true  placeholder=定时任务
/agent/plugins    sidebar=true  main=true  notesPanelOnMain=true  placeholder=插件市场
console errors: []
```

## 附二 · 左栏 Codex 化 + 项目体系（`feat(agent-sidebar)`）

**左栏结构**：固定头（标题 / 全局搜索 / 折叠）→ 固定四行导航（新对话 / 我的资产 / 定时任务 / 插件市场）→ 滚动区（Projects + Recents）→ 固定底（头像设置 + 归档开关）。滚动容器带 `data-agent-scroll`，是会话列表哨兵的 IntersectionObserver `root`。

**拆出的组件**（`components/agent/`）：`AgentNavRows`、`AgentSectionHeader`、`AgentSessionList`（10 条/批 + 哨兵）、`AgentSessionRow`（含内联重命名）、`AgentPanelMenu`（右键菜单 + 删除二次确认）。纯逻辑放 `lib/agent/projectViews.ts`（系统项目按 `kind`、用户项目按 `folderId`、Recents 收未归组的 main 会话、归档独立）。

**两个已核实缺陷（本次修掉）**

1. **云端拉取会丢项目（P0）**：`lib/sync/engine.ts` 的两处 `saveManifest` 手写字段，漏了 `folders`。任何一次 `pullAndPushAll` 或远端 tombstone 都会把用户项目整批清空，会话的 `folderId` 全变悬空 —— 左栏表现为「项目没了、会话也没了」。
   修法：manifest 收敛成唯一构造入口 `chatStorage.buildManifest` / `manifestFrom`（store 侧 `manifestOf` 委托），并把 `version: 2` 字面量从 store 与引擎里全部清掉（`tests/agentNavStructure.test.ts` + `lib/storage/chatStorage.manifest.test.ts` 双重钉死）。
2. **移动会话后没同步**：`moveSessionToFolder` 缺 `scheduleCloudUpsert('chat-session')`，换设备看不到归属。已补，并且系统项目里的会话（note / floating）不允许改挂（归属由来源决定）。

**云端同步新增 `chat-project`**

- 客户端：`lib/sync/{types,payload,engine,usage}.ts`；负载只有 `{id,name,createdAt,updatedAt,system?}`，上限 32 KB。
- 数据库：`supabase/migrations/0007_sync_chat_project_kind.sql`（kind 约束 + 重建字节上限函数）。
- 降级：`isSyncUnknownKindError` 命中时只提示一次「云端还不认识项目名这类数据，已改为只保留本机」，本次会话不再重试该 kind —— 迁移没跑也不会刷屏、不影响其它同步。

**迁移状态：`0007` 已在云端执行（2026-09-20，见文末运维待办与「云端迁移实测」）。**

**云端迁移实测**（Supabase 项目 `jlahwwnjbhqfnsicdjsx` = StudyReview-Platform）

| 检查 | 迁移前 | 迁移后 |
|---|---|---|
| `sync_documents_kind_check` | 7 个 kind（无 `chat-project`） | 8 个 kind，含 `'chat-project'` |
| `sync_documents_enforce_bytes()` | 无 `chat-project` 分支 | 命中 `chat-project` 且含 `32768` |
| `public.schema_migrations` | 0001–0006 | 0001–**0007**（7 条 checksum 与本地文件逐一相符） |
| 触发器 `sync_documents_byte_limits` | 在 | 在（重建后仍在） |

外加两条功能证据：

1. **事务内探测**：以真实 `user_id` 插一行 `kind='chat-project'` → 成功（约束与 32 KB 触发器都放行）→ `rollback`；事后 `leftover = 0`，没有留下任何行。
2. **客户端真跑通**：迁移记录写入后约 10 秒，云端出现两行 `chat-project`（`project-note` / `project-floating`）——用户本机已登录的客户端把两个系统项目推了上来，整条链路（客户端新 kind → 约束 → 行）就此验证，不再需要那条降级提示。

## 附三 · 我的资产（`feat(agent-assets)`）

| 层 | 落点 | 说明 |
|---|---|---|
| 纯函数 | `lib/agent/assetCatalog.ts` | 六类来源 → `AssetItem[]`；筛选 / 排序 / 计数 / 角标文案 |
| 路由 | `lib/agent/assetHref.ts` | `/agent/assets/{kind}/{id}`；非法 kind → `notFound()` |
| 聚合 hook | `lib/hooks/useAgentAssets.ts` | 任一来源未水合就返回 `null`（骨架），不用半份数据渲染 |
| 本地导入记录 | `lib/stores/imports.ts` | 只存路径与元数据；同路径/同网址只更新不追加 |
| 云角标 | `lib/sync/status.ts` 的 `hasCloudRow` | 读最近一次拉取快照；`null` = 没对过账 → 不显示角标 |
| 页面 | `components/agent/AgentAssetsPage.tsx` / `AgentAssetCard.tsx` / `AgentAssetDetail.tsx` | 标签 + 视图切换 + 搜索 + 排序；卡片跳详情；详情复用既有渲染件 |

**写入点**（只记「用户意图」的三处）：输入框附件（`useImageAttachments.addFiles`）、加号菜单「添加文件」、加号菜单「打开网址」。图片不记（那是对话附件，记进来会把资产页刷满）。

**实测**（Playwright 走真实交互：加号菜单建笔记 + 打开网址，再点左栏「我的资产」）

```
标签：全部 3 | 笔记 2 | 闪卡 0 | 长文本 0 | 可交互 0 | 文件 0 | 网址 1
列表/橱窗切换：assets-list / assets-grid 均渲染；localStorage 记住选择
搜索 lecture/example：过滤正确；无结果给「没有匹配…」+ 清空搜索
详情：点击卡片 → /agent/assets/note/example-user-note，左栏保留，data-asset-kind=note，正文由 NoteRenderer 渲染（含 KaTeX）
console errors: []（详情页直连与点击两条路径都验过）
```

## 附四 · 输入框项目 chip（`feat(composer)`）

- `components/chat/composer/ProjectPickerChip.tsx`：默认 `No Projects`；菜单给最近项目（≤5）、添加新项目、不使用项目。
- 位置：`.chat-input-editor-row` 里、发送键左侧（输入框右下角）；样式 `.chat-input-project-chip`（容器查询 ≤520px 只留图标）。
- 门控：只有 Agent 中央对话渲染 —— `ChatPanel` 传 `showProjectPicker={emptyLayout === "agent"}`，划词浮窗 / 题目解析 / 手机迷你聊天 / 笔记窗一律不带项目归属。
- 语义：选中项目既改「下次新建对话的落点」，也把当前这条会话挂过去；空白会话同样直接挂。

**实测**：`/agent` 空对话页右下角出现 chip，显示当前项目名「我的项目」（截图 `s5-project-files.png` 可见）。

## 附五 · 项目文件（`feat(project-files)`）

| 层 | 落点 | 要点 |
|---|---|---|
| 解析 | `lib/project/parse.ts` + `pdfText.ts` | 文本/md/html/docx 复用 `fileToDocumentAttachment`；pptx 复用 `parsePptxSlideBytes`；pdf 走 pdfjs 文本层（与 `PdfDocumentPane` 同一份 worker 资源） |
| 切片 | `lib/project/slice.ts` | 标题优先（`#`~`###`）；无标题按 2500 字窗口 + 200 重叠；单片封顶 4800；片数封顶 60；同时产出「隐藏索引 md」 |
| 目录/携带 | `lib/project/catalog.ts` | 目录 ≤ 64 KB（超了从尾部裁切片并标 truncated）；正文 ≤ 48 KB 默认全带，否则只带勾选片 |
| 存储 | `lib/stores/projectFiles.ts` | 三步写入 `beginImport → finishImport/failImport`；重启时把 `parsing` 标成 error，不假装还在跑 |
| 教材软链接 | `lib/project/studioRefs.ts` | 只记 path；检索跨全部科目的导航树 |
| 窗口 | `components/project/ProjectFilesWindow.tsx` + `ProjectFilesLayer.tsx` | 左树右正文；`ManagedWindowType` 新增 `project-files`，一个项目一个窗 |
| 入口 | `WindowTaskbar` 的加号菜单顶部组（仅 Agent） | 没有选中项目时：优先最近有对话的项目，一个都没有才建「我的项目」 |
| 工具 | `lib/ai/agent/tools/{getProjectFiles,readProjectSlices}/` | 目录看索引；切片读正文；未携带给「点带入对话」的可执行提示；studio-ref 指回 `getSection(path)` |

**为什么是「目录 + 按需切片」**：服务端工具读不到浏览器 IndexedDB，仓库既有范式（`userNotes` / `flashcards`）就是「请求体注入目录 + 服务端检索」。项目文件沿用同一条路：目录每次上行，正文只在携带范围内上行。因此**文件内容不上云、也不离机**。

**实测**（Playwright：加号菜单 → 项目文件 → 导入一份 md → 拦截 `/api/chat` 看真实请求体，不打模型额度）

```
menu has project entry: True
window opened: tree=True  carry=还没有可带入的内容  empty=True
after import: tree='MD 组胚讲义.md'  carry='已全部带入（3 片 · 50 字）'
request: projectFiles=1  projectSlices=3
         fileName=组胚讲义.md
         sliceIndex=['上皮组织','单层上皮','复层上皮']
         sliceIds=['slice-1','slice-2','slice-3']
console errors: 仅探针自己制造的 500 与未登录的 401
```

## 与规划的三处偏差（都是落地时更优的选择）

1. **资产路由与页面一起落在阶段 3**，阶段 0 不先放空壳页 —— 少一次「先建后改」的反复。
2. **视图偏好不在 effect 里 setState**（`react-hooks/set-state-in-effect` 会拦，也会级联渲染）：改成 `useIsClient()` + 渲染期读 localStorage。
3. **「重新解析」变成「重新导入」**：解析后不保留 `File` 句柄，凭同路径/同名的重新导入触发覆盖更新（去重规则写在 `beginImport` 里）。

## 质量门

| 门 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 |
| `pnpm run test:unit` | **1388 pass / 0 fail**（阶段落地 +45，BUG 修复轮 +11，后续三轮 +3） |
| `pnpm run test:react` | **150 文件 / 583 pass**（+5 文件 / +30 用例） |
| `npx eslint .` | 0 error（warning 90，基线 91） |
| `npx knip` | 未用文件 3 / 未用导出 14 / 未用类型 1 —— 与基线一致（两轮新增的导出都有消费者） |
| `pnpm run check:encoding` | 3575 个 Markdown 全部合法 UTF-8 |
| `git diff --check` | 0 |

## 门记录（末次全量运行）

```
npx tsc --noEmit                 → 0
pnpm run test:unit               → tests 1388 / pass 1388 / fail 0
pnpm run test:react              → Test Files 150 passed / Tests 583 passed
npx eslint .                     → 0 errors, 90 warnings（基线 91）
npx knip --no-progress           → Unused files 3 / exports 14 / types 1（与基线一致）
pnpm run check:encoding          → 3575 个 Markdown 均为合法 UTF-8
git diff --check                 → 0
```

本轮新增/改写的测试：`lib/agent/projectViews.test.ts`（6）、`lib/agent/assetCatalog.test.ts`（6）、
`lib/storage/chatStorage.manifest.test.ts`（4）、`lib/project/slice.test.ts`（6）、`lib/project/catalog.test.ts`（6）、
`tests/agentNavStructure.test.ts`（5）、`tests/agentAssetsStructure.test.ts`（6）、`tests/agentProjectFilesStructure.test.ts`（6）、
`components/layout/AgentShell.test.tsx`（5）、`components/layout/AgentConversationSidebar.test.tsx`（8）、
`components/agent/AgentAssetsPage.test.tsx`（6）、`components/agent/AgentAssetDetail.test.tsx`（3）、
`components/project/ProjectFilesWindow.test.tsx`（3）、`components/chat/composer/ProjectPickerChip.test.tsx`（5）。


## 附六 · 七个 BUG 的深度修复（2026-09-20，第二轮）

### 1. 侧边栏开关归位到顶栏左上角（与 Studio 同款）

**根因**：顶栏那个开合按钮被 `{!agentMode && <button …>}` 挡掉了；Agent 只能先在左栏头部收起、再用**中间浮出来的**「展开对话栏」按钮打开。

**改法**：
- `AppShell` 顶栏按钮对两种模式都渲染，加 `data-testid="sidebar-toggle"` 与 `aria-label/aria-pressed`（位置与 Studio 完全一致：LOGO 左侧）；
- `AgentShell` 删掉悬浮按钮与 `PanelLeftOpen` 依赖；「展开回到上次拖到的宽度」改由 `[sidebarCollapsed]` 那次翻转来记（`pendingLeftRestoreRef`）——收起动作现在来自顶栏。

**实测**：开关在 `x=12,y=8`；点它收起 → 面板 319→0；再点 → 回到 319；中间不存在 `[aria-label="展开对话栏"]`。

### 2. 在「我的资产」等页面点新对话 / 点对话没反应

**根因**：`handleNewChat` / `handleSelect` 只改 store（切会话、建会话），**不导航**；人还站在 `/agent/assets`，中央区当然不会变成对话。

**改法**：左栏加 `goToChat()`（`pathname !== "/agent"` 时 `router.push("/agent")`），三条入口都先走它：新对话、点会话（含划词会话）、项目菜单「在此新建对话」。

**实测**：在 `/agent/assets` 点「新对话」→ pathname 变 `/agent`；点会话行 → 先回 `/agent` 再切会话。

### 3. 右侧工作区按对话隔离，且默认收起

**根因**：`agentDockCollapsed` 是全局单值（还从 localStorage 恢复），窗口列表也是全局一份 —— A 对话开的文档会出现在 B 的右栏里。

**改法**（三层）：
1. **窗口带归属**：`ManagedWindow.sessionId` 在 `openWindow` 时由外壳注入的 `setWindowSessionProvider` 打标（不直接 import chatHistory，避免 windowManager → chatHistory → artifacts → windowManager 的循环依赖）；
2. **只有当前对话的窗口可见**：判定收敛到 `lib/window/sessionScope.ts`，四处消费同一函数 —— `useManagedWindowSurface`（可见性/可交互）、`RightPanel`（活动窗口与空态）、`WindowTaskbar`（右栏标签条）、`AgentDockHost`（自动选活动窗口）；未打标的窗口始终可见（Studio 打开的老窗口不受影响）；
3. **每个对话一份记忆**：`lib/window/agentDockSession.ts`（内存表）+ `useAgentDockPerSession`（挂在 AgentShell）。切会话或离开对话页时记下「收起？全屏？在看哪个窗口」，切回来按记忆恢复；没有记忆（新对话、刷新后）→ 默认收起。非对话页（资产/定时/插件）强制收起且**不覆盖**记忆 —— 从资产页回来看到的仍是离开时的样子。

另外：`agentDockCollapsed` 初始值改 `true`，`hydrateLayout` 不再从 localStorage 恢复它（否则刷新后又弹出来）。

**实测**（Playwright 真点）：冷启动右栏宽 0；A 对话开笔记窗 → 宽 288 + 1 标签；切到 B → 宽 0、0 标签、看不到 A 的窗口；切回 A → 宽 288 + 同一标签。

### 4. 收起时内容不跟着重排（只让面板真实变窄）

**根因**：左栏内容宽度 = 面板宽度，收起动画逐帧变窄 → 文字每帧重排（之前只在**拖拽**期盖骨架屏遮丑，顶栏按钮那一路根本没有遮）。

**改法**：内容包一层定宽容器，宽度取 `max(当前面板宽, 最近一次舒适宽)`（写进 `--agent-left-content-width`，由 ResizeObserver 更新），外层 `aside` 加 `overflow: hidden`。收起于是变成**裁切**而不是重排：文字不动、面板真实变窄。同时把「拖拽中不记录舒适宽度」扩成「拖拽中 + 收起中都不记录」—— 否则收起动画会把冻结宽度本身越缩越小（第一版实测缩到了 82px）。

**实测**：收起前 面板 319 / 内容 319；收起后 面板 0 / **内容仍 319**；展开回 319。

### 5. 深色配色 A-B-A → B-A-A

**实测原值**（深色）：左栏 `#0c0e13`（lowest）、中间 `#191c20`（low）、右栏 `#131318`（`--bg-panel`）。

**改法**：新增两个变量；浅色下等于各自原来的颜色（浅色**零变化**），深色下在 `[data-agent-shell]` 里改成：

```css
:root { --agent-sidebar-bg: …-lowest; --agent-content-bg: …-low; }
html:not([data-theme="light"]) [data-agent-shell] {
  --agent-sidebar-bg: var(--md-sys-color-surface-container-low); /* 左栏 = 原中间色（B） */
  --agent-content-bg: var(--bg-panel);                          /* 中间 = 面板色（A） */
}
```

左栏背景改读变量；中间列（`[data-agent-slot="main"]`、`.chat-panel`）与两个页面组件（资产页 / 详情页）统一读 `--agent-content-bg`；右栏本来就是面板色，不动。

**实测**：左栏 `rgb(25,28,32)`、中间与右栏都是 `rgb(19,19,24)` —— 正好 B-A-A。

### 6. 删除项目二次确认

**根因**：会话删除有二次确认，项目删除是「点了就删」。

**改法**：`AgentPanelMenu` 增加 `pendingDeleteProjectId` 与确认块（`data-testid="project-delete-confirm"`，文案写明「里面的对话会退回 Recents（对话本身不删）」）；菜单动作里的 `deleteProject` 去掉，改由确认块回调；左栏加 `handleDeleteProject`。

**测试**：RTL 断言「第一次点不调 deleteFolder、确认后才调用」；契约测试锁住确认块文案与两个回调。

### 7. 资产页：卡片更大、默认收起右栏、骨架跟上视图

**改法**：
- 卡片 132→188 高、图标 36→44，圆角 / 字号 / 内距一起放大；网格列宽 176→**260**、间距 12→16
  （1440 宽下从 4 列约 258px 变成 3 列约 349px，单卡明显舒展）；
- 页面内距 `px-4 py-3` → `px-5 py-4`；
- 骨架从「4 根细条」换成为**按当前视图**渲染的骨架（橱窗 8 张卡片骨架 / 列表 10 行骨架），加载期给 `aria-busy`；
- 右栏默认收起：由第 3 条的「非对话页强制收起」覆盖（资产 / 定时 / 插件都吃到）。

**实测**：冷开 `/agent/assets` 抓得到 `[data-testid="assets-skeleton"]`（aria-label=资产加载中）；卡片实测 188 高 × **349 宽**（3 列）。

### 8. 骨架懒加载：约 1 秒最小时长（资产页 + 详情页）

**根因**：本机 IndexedDB 往往几十毫秒就把五份数据都喂回来了 —— 骨架一闪而过、内容突然出现，比「等一下」还跳。

**改法**：新增 `lib/hooks/useMinimumSkeleton({ durationMs = 900, ready })`，返回「现在是否仍然显示骨架」：
数据没就绪 → 一直 true（该等就等）；数据就绪但没到下限 → 仍然 true（刻意的平滑）；两者都满足 → false。
实现上把 setState 放在定时器回调里，避开 `react-hooks/set-state-in-effect`（effect 体内同步 setState 会被拦）。
资产页与详情页各接一条：骨架版式跟着视图走（橱窗 8 张卡片骨架 / 列表 10 行骨架），详情页给「图标 + 标题 + 操作按钮 + 正文块」的骨架；
另删掉了详情页里那条已经不可达的旧骨架分支。

**实测**：进资产页时骨架可见 **1025ms**；点卡片进详情页，详情骨架可见 **1190ms**（含路由切换），随后都换成真内容，无 console 报错。

### 10. 中间对话不贴满左右面板（Codex 式空隙 + 一栏居中）

**要的效果**：中央对话不再顶住左栏/右栏，两侧留出合适的空隙；宽屏时正文收进一栏、居中。

**改法**（纯 CSS，作用域锁在 Agent 外壳）：
```css
[data-agent-shell] .chat-panel {
  --agent-chat-inline: clamp(20px, 2.6vw, 44px);   /* 两侧空隙，随窗口微调 */
  --agent-chat-max: 920px;                          /* 宽屏时的可读宽度 */
}
[data-agent-shell] .chat-messages { padding-left/right: var(--agent-chat-inline) !important; }
[data-agent-shell] .chat-messages-sizer { width: min(100%, var(--agent-chat-max)) !important; margin-inline: auto; }
[data-agent-shell] .chat-panel:not(.chat-panel--welcome) .chat-input-container { inset-inline: var(--agent-chat-inline); max-width: var(--agent-chat-max); margin-inline: auto; }
```

几个必须踩准的点：
- 消息是**虚拟列表**（`.chat-messages-sizer` 里放绝对定位的行），所以要把定宽/居中加在 sizer 上（行是它的 `width:100%` 子元素，跟着走），
  而不是给 `.chat-message` 加 max-width —— 那样只会让每条消息自己变窄、整体仍贴左；为此在 `ChatThread` 里给 sizer 加了 `chat-messages-sizer` 类；
- 输入框原本 `inset-inline: 12px` 且绝对定位：加 `max-width` + `margin-inline: auto` 后与正文同宽同中线（左+右都定位时 auto 外边距会居中），
  容器查询的宽度也跟着变成「正文宽度」，项目 chip 的窄屏收起逻辑自动跟着走；
- `padding-left/right` 用了 `!important`：有跳转点时会内联写 `padding-right: 18px`，那 18px 在 Codex 式留白下会把右间隙吃掉；
- 欢迎页那份输入框自带 `max-width: 780px; margin: auto`，用 `:not(.chat-panel--welcome)` 排除，不重复处理；
- 加载/报错横幅、「跟随最新输出」按钮也一起对齐到这条中线。

**实测**（1440×900，Playwright 量矩形）：
| 场景 | 面板宽 | 正文栏宽 | 左右间隙 |
|---|---|---|---|
| 左栏展开 | 1119px | 920px | 99px / 99px（输入框同宽同中线） |
| 左栏收起 | 1438px | 920px | 259px / 259px |

Studio 的对话（不在 agent 外壳里）padding 仍是 12px/18px，未受影响；无 console 报错。

### 9. 切标签时卡片「滑到新位置」（重排动画）

**要的效果**：从「全部」切到「笔记」这类标签切换，留下的卡不是被瞬间重排，而是彼此挪着位过去 —— 有移动的连续感。

**改法**（framer-motion 的 layout 动画，仓库已在用同一套）：
- `lib/motion.ts` 新增共享常量：`LAYOUT_REFLOW`（spring，stiffness 420 / damping 36 / mass 0.7 —— 够快又不拖尾）与
  `cardSwapVariants`（进出场只做淡 + 微缩，**位移完全交给 layout**，两套位移一起上会互抢、看起来就是抖）；
- 资产页的卡片外层统一换成 `motion.div`：`key` 仍是 `kind-id`，所以同一张卡在两次筛选之间**是同一个 React 节点**，
  framer-motion 才有旧位置可对照、才能滑；外面套 `AnimatePresence mode="popLayout"`，
  退场的卡先脱离文档流，剩下的立刻开始重排（否则会先卡一下再动）；
- 网格容器与列表容器本身也带 `layout`，容器尺寸变化一并动画；两种视图共用同一个渲染器，切视图也是滑过去；
- 尊重系统设置：`useReducedMotion()` 为真时不加 layout、不做进出场，退回静态列表。

**实测**（Playwright 在页面内用 rAF 逐帧采样卡片矩形）：从「全部」（5 张）切到「笔记」（3 张），
`asset-cell-note-example-user-note` 位移 **418px**，**55 帧里出现 25 个不同的中间位置**（轨迹从 (705,369) 平滑到新槽位），
另外两张笔记卡本来就在最前、保持不动 —— 正是「该动的动、不该动的不动」。无 console 报错。

### 本轮新增 / 更新的测试

| 文件 | 覆盖 |
|---|---|
| `tests/agentShellControls.test.ts`（新，7 项） | 七条的源码契约：顶栏开关、冻结点、B-A-A 变量、跳转、二次确认、会话隔离四处消费、骨架 |
| `lib/window/sessionScope.test.ts`（新，4 项） | 窗口归属判定与筛选 |
| `lib/window/agentDockSession.test.ts`（新，1 项） | 每对话记忆表 |
| `lib/hooks/useAgentDockPerSession.test.tsx`（新，3 项） | 默认收起 / A-B 互不干扰 / 非对话页不强占记忆 |
| `components/layout/AgentShell.test.tsx` | 改为断言「中间没有展开按钮」+ 内容定宽容器 |
| `components/layout/AgentConversationSidebar.test.tsx` | 新增「非对话页点新对话/会话要跳回」；项目删除改二次确认 |
| `components/window/ManagedWindow.test.tsx` | 停靠用例显式打开右栏（默认已改为收起） |

**本轮门（末次全量）**：`tsc` 0 · `test:unit` 1387/0 · `test:react` 150 文件 / 583 通过 · `eslint` 0 error / 90 warning ·
`knip` 3/14/1（基线） · `check:encoding` 3575 合法 · 浏览器验收 13/13 + 6/6 + 4/4 + 3/3 + 6/6 PASS。

## 运维坑（本轮踩到，记下来）

**Next dev 的 `.next` 缓存被写坏会让整个 dev server 空转。** 现象：进程 CPU 疯涨（实测几分钟烧掉 2 万+ CPU 秒、内存 4GB），
`/agent`、`/login`、连 `/api/health/search` 全部超时，但日志停在「Ready」不再输出编译进度。
触发路径：在 dev server 正在编译时强杀它（本轮排查重启时连续做了几次）。
**处置**：`Stop-Process` 掉监听 35349 的进程 → `Remove-Item -Recurse -Force .next`（gitignored 的构建产物）→ 重启 `pnpm dev`。
冷缓存下首屏要等编译：`/api/health/search` 约 21s、`/agent` 约 12s，之后就正常了。

## 运维待办

1. ~~**`0007` 迁移还没在云端执行**~~ → **已于 2026-09-20 执行完毕**。
   实际路径不是 `pnpm db:migrate`（它要 `SUPABASE_ACCESS_TOKEN` 环境变量，仓库里没有），而是用**已登录的 Supabase CLI**
   （`supabase projects list` 能列出项目，说明登录态在）走管理 API：
   ```powershell
   supabase db query --linked --project-ref jlahwwnjbhqfnsicdjsx --file supabase/migrations/0007_sync_chat_project_kind.sql
   # 记账（checksum 用仓库同一套 sha256，保证 db:migrate:status 不会报漂移）
   supabase db query --linked --project-ref jlahwwnjbhqfnsicdjsx "insert into public.schema_migrations (version, name, checksum) values ('0007','sync_chat_project_kind','<sha256>') on conflict (version) do update set name = excluded.name, checksum = excluded.checksum"
   ```
   注意：`--project-ref` 必须和 `--linked` 一起用（CLI 的硬性要求），单独传 ref 会报错。
   后续迁移照这个路径走即可；`pnpm db:migrate:status --compare` 需要额外提供 `SUPABASE_ACCESS_TOKEN` 才能跑。
2. 项目文件是纯本机数据：换设备 / 清 IndexedDB 后需要重新导入（这也是「不上云」的代价，已在窗口里写明）。
3. 本轮的三个新入口都写「本地导入记录」：如果用户大量导入文件，「我的资产 → 文件」会变长——目前没有上限，后续可按 `createdAt` 分页。