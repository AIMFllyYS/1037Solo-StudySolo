# Agent 左侧栏体系化改造 + 我的资产 / 项目 / 项目文件（规划）

日期：2026-09-20
基线：`feat/agent-right-panel-unification`，起点提交 `6289c40e`（工作区干净）
状态：方案 + 落地记录分离——本文只写规划，实际落地与实测见 [`agent-sidebar-assets.execution.md`](./agent-sidebar-assets.execution.md)。

**已确认的三项口径（用户选择）**

1. 资产「跳到新页面打开」= **站内详情页** `/agent/assets/[类型]/[id]`：左侧栏保留，中央区整块换成详情页；HTML 演示额外给「在新标签页打开」。
2. 资产页数据范围 = **以本机为准 + 同步角标**（仅本机 / 已同步 / 来自云端）。
3. 项目文件 v1 解析 = **txt / md / html / markdown + pdf + docx + pptx**（复用仓库已有本地解析），不做 OCR、不做表格。

## 1. 目标与总验收

1. 左栏顶部（标题 + 全局搜索 + 折叠）与底部（头像/设置 + 归档）保留；中间是「固定四行导航（新对话 / 我的资产 / 定时任务 / 插件市场）+ 一起滚动的 Projects 与 Recents」。
2. 我的资产是站内新页面：顶部标签（全部 / 笔记 / 闪卡 / 长文本 / 可交互 / 文件 / 网址 + 计数）、最右视图切换（橱窗 / 列表）+ 搜索 + 排序；橱窗不预览，点击进详情页。
3. Projects：两个系统项目「笔记记录」（`kind: note`）与「划词摘录」（`kind: floating`）不可删、可重命名且重命名同步云端；用户可自建项目；会话右键可重命名 / 移动到项目 / 归档 / 删除（删除二次确认，真删云端行）。
4. Recents = 未归项目的 `kind: main` 会话，一次 10 条、滚到底自动续 10 条。
5. 空对话页输入框右下角新增项目 chip，默认 `No Projects`，可选最近项目 / 新建项目。
6. 右栏「+」菜单顶部新增「项目文件」组（仅 Agent）：文件只在本机解析成「隐藏索引 md + 切片」，Agent 用 `getProjectFiles` / `readProjectSlices` 读；可软链接引用 Studio 教材。

## 2. 已核实的现状与约束

| 事实 | 位置 | 对方案的影响 |
|---|---|---|
| Agent 页整页 = `AgentWorkspace`，左栏与中央 `ChatPanel` 同处一个组件 | `components/layout/AgentWorkspace.tsx` | 先把左栏抽到**布局层** |
| 模式判定只看首段：`/agent/*` → agent | `lib/constants/app-mode.ts` | 子路由天然属于 Agent，右栏无需改 |
| 移动端 `/agent/*` 会被重定向回 Studio | `components/layout/AppShell.tsx` | 新页面只需桌面 |
| 「我的资产」原本打开笔记库浮窗 | `AgentConversationSidebar.tsx` → `openNoteLibrary` | 侧栏入口改路由；浮窗留给「+ → 选择笔记」 |
| 侧栏已有 folders / 重命名 / 移动 / 右键菜单 / 归档 | `lib/stores/chatHistory.ts` | 项目体系复用这套 |
| 会话列表是「前 5 条 + 还有 N 个」 | `AgentConversationSidebar.tsx` | 改成 10 条/批 + 滚动续载 |
| **云端回收站路径丢 folders**：`engine.ts` 两处 `saveManifest` 手写字段 | `lib/sync/engine.ts:595,617` | P0：云端拉取一次就把项目清空，会话 `folderId` 全变悬空 |
| 移动会话后没有同步 | `lib/stores/chatHistory.ts` `moveSessionToFolder` | 同批修 |
| 云同步 kind 是数据库枚举 | `supabase/migrations/0003,0005` | 项目名同步需要新 kind + `0007` |
| 个人数据不进工具执行环境，随请求体注入目录 | `lib/ai/agent/tools/_shared.ts`、`lib/chat/buildChatRequestBody.ts` | 项目文件同范式：索引进请求体、正文按需携带 |
| Studio 引用已有成熟形态 | `lib/chat/{composerIntent,attachedFilesContext}.ts` | 教材软链接直接复用 |
| 本地解析现状：文本/docx 有，pdf/pptx 只做预览 | `lib/ai/imageUtils.ts`、`lib/chat/parsePptx.ts`、`components/window/PdfDocumentPane.tsx` | pdf 需新增文本层抽取 |

## 3. 阶段划分（与提交一一对应）

| 阶段 | 内容 | 提交 |
|---|---|---|
| 0 | 路由与外壳：`app/agent/layout.tsx` + `AgentShell` + 占位页 | `feat(agent-shell)` |
| 1+2 | 左栏重排 + 项目体系 + `chat-project` 云同步 + 丢项目修复 | `feat(agent-sidebar)` |
| 3 | 我的资产（聚合层 / 橱窗 / 列表 / 详情）+ 本地导入记录 | `feat(agent-assets)` |
| 4 | 输入框项目 chip | `feat(composer)` |
| 5 | 项目文件（本地索引 + 切片 + 窗口 + 两个工具） | `feat(project-files)` |
| 6 | 定时任务 / 插件市场占位页 | 并入阶段 0 提交 |

### 3.1 外壳（阶段 0）

- `AgentWorkspace` → `AgentShell`，签名改为接 `children`；中央区成为路由插槽，`#notes-panel` 锚点挂到中央区（子路由也要有它，窗口全屏才量得到）。
- 新增 `lib/hooks/useAgentChatContext.ts`：外壳与各页面共用同一份对话上下文（Agent 不默认注入当前页）。

### 3.2 左栏与项目（阶段 1+2）

- 结构：固定头 → 固定四行导航 → 滚动区（Projects + Recents）→ 固定底。
- 项目 = 会话分组：`ChatFolder` 扩 `system/updatedAt`，`SYSTEM_PROJECTS` 两个固定 id；成员由 `kind`（系统项目）或 `folderId`（用户项目）决定。
- 同步：新增 `chat-project` kind（32 KB）+ `0007` 迁移；迁移未跑时降级为「只留本机 + 提示一次」。
- **manifest 只保留一个构造入口**：`buildManifest` / `manifestFrom`（store 侧 `manifestOf` 委托），手写字段的路径全部消灭。

### 3.3 我的资产（阶段 3）

- 聚合纯函数 `lib/agent/assetCatalog.ts`：六类 → `AssetItem[]`（含 `origin` 角标）；`assetHref` 负责详情路由。
- 导入记录 `lib/stores/imports.ts`：**只存路径与元数据、不落正文、不上云**；三个入口写入（输入框附件、加号菜单文件、加号菜单网址）。
- 详情页复用既有渲染件（NoteRenderer / FlipCard / 长文 / 沙箱 iframe），未知 id 给空态，kind 非法 404。

### 3.4 项目文件（阶段 5）

- 解析：`lib/project/parse.ts`（文本/docx 复用 `fileToDocumentAttachment`、pptx 复用 `parsePptxSlideBytes`、pdf 走 `pdfText.ts` 的 pdfjs 文本层）。
- 切片：`lib/project/slice.ts` 纯函数 —— 标题优先、超长二次窗口切（2500 字 + 200 重叠）、片数封顶 60。
- 携带：`lib/project/catalog.ts` —— 项目正文 ≤ 48 KB 默认全带，超预算只带勾选片；目录上限 64 KB。
- 工具：`getProjectFiles`（目录）与 `readProjectSlices`（切片正文；未携带给可执行提示；studio-ref 指回 `getSection(path)`）。

## 4. 边界与失败模式

| 场景 | 期望行为 |
|---|---|
| 未水合就新建/切项目 | 沿用 `persistManifest` 闸门，绝不基于空列表落盘 |
| 云端拉取 | 必须带 `folders` / `activeProjectId`（P0 已修 + 单测钉死） |
| `folderId` 悬空 | 当未归组落 Recents，不丢会话 |
| 迁移未执行 | 项目名只留本机 + 一次提示，不刷屏 |
| 项目文件超限/解析失败 | 该文件标 error + 原因，其余照常 |
| 切片未携带 | 工具返回下一步，不静默空回 |
| 浏览器没有绝对路径 | 只显示文件名，隐藏「用系统打开」 |

## 5. 假设与不做的事

**假设**：项目 = 会话分组（复用 `folders`）；「笔记记录」= `kind:note`、「划词摘录」= `kind:floating`；Recents 只收未归项目的 `kind:main`；资产页不列对话；项目文件内容不上云。

**不做**：Studio 侧栏与 Studio 资产页；移动端 Agent 三栏；定时任务/插件市场的真实功能；文件内容上云或跨设备共享；xlsx/CSV/图片 OCR；虚拟滚动；共享与协作。