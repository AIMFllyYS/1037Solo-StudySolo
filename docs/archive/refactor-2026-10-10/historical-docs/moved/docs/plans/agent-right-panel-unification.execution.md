# Agent 右侧工作区统一改造执行记录

> 与 `agent-right-panel-unification.md` 配套的短记录。只记录实际代码状态、验证结果和与规划的差异；不替代规划正文。
> 最近一次更新：2026-09-19，由接手 Agent 完成真实浏览器验收后重写。

## 基线与分支

- 日期：2026-09-19
- 实施分支：`codex/agent-right-panel-unification`
- 基线提交：`3445f3c8`
- 已核对：`master`、`dev`、`feat/glassmorphism-design-system` 均与基线一致；本任务分支已从该基线创建。
- 工作区**仍未提交、未推送、未合并、未部署**。
- 接手前工作区改动已保留：`docs/README.md`、`docs/design-snapshots/`、规划文档本身。
- 仓库内未发现 `AGENTS.md`。
- 本轮未使用 `git reset --hard` / `git checkout --` / `git clean`，未删除任何既有文件。
- 浏览器验收脚本与截图全部写在仓库之外（`C:\\Users\\AIMFl\\.codex\\visualizations\\2026\\09\\19\\agent-dock-acceptance\\`），仓库内没有新增临时文件。

## 阶段进度

| 阶段 | 状态 | 实际结果 |
|---|---|---|
| 0. 文档/笔记/iframe 小范围验证 | 完成（含真实浏览器） | 笔记编辑器、Markdown 附件（DocumentWorkspace）、source preview iframe 均已确认通过公共壳进入右侧工作区，切标签不重建。 |
| 1. 全部 managed 窗口接入 | 完成（含真实浏览器） | 既有 `ManagedWindow` 内容按展示策略自动选择浮窗 / Agent 桌面 dock / 窄屏 sheet；本轮实测覆盖笔记、附件文档、API 计费总览、AI 助手浮窗、source preview。 |
| 2. 独立业务弹层适配 | 完成（含真实浏览器） | Agent 设置、全局设置、账户信息、额度、快捷键帮助、登录已实测进入统一宿主并可真实关闭。 |
| 3. 附属层、窄屏、焦点与键盘 | 完成（真实浏览器 + 单测） | Esc 语义、Alt+W/Alt+M、最小化、收起/展开、移动 sheet、焦点归还全部实测；Lightbox / 画布全屏按"保持附属层"结论登记（见限制）。 |
| 4. 整体验收与清理 | 完成 | 全部测试、类型检查、ESLint、构建通过；完整 `pnpm run lint` 仍被既有 Knip 问题阻断（非本次引入）。 |

## 已落地的公共设计

- `lib/window/presentation.ts`：统一解析 `floating` / `dock` / `sheet` / `pending`，以及 dock 的可交互条件。
- `lib/window/agentDockRuntime.ts`：维护稳定 content host、managed/external/builtin 活动引用、收起状态、打开请求和外部 surface 元数据。
- `lib/window/dockTypingFocus.ts`（本轮新增）：非模态右栏的 Esc 焦点守卫，用 `useSyncExternalStore` 订阅 `focusin`/`focusout`。
- `components/window/AgentDockHost.tsx`、`AgentDockTabs.tsx`：右侧宿主、统一标签、关闭和添加内容入口。
- `ManagedWindow` / `WindowChrome` / `useManagedWindowChrome`：普通模式保持浮窗；Agent 桌面 portal 到 `#agent-dock-content`；移动端降级为右侧 sheet；dock 不再使用 fixed 几何/拖拽/浮窗 resize 外壳。
- `windowManager` / `windowActions`：同实例复用、最小化后重新选取可见活动窗口、真实关闭继续走业务清理契约；Agent 活动 surface 与窗口管理器同步。
- `RightPanel` / `AgentWorkspace` / `WindowTaskbar`：标签栏和内容区分离，内置 AI/视频/交互/浏览器与 managed/external surface 不重复叠外壳；收起保留宿主与内容身份。
- `WorkspaceSurface`：设置、登录、账号、额度、搜索、快捷键帮助等非 ManagedWindow 表面的薄适配器，负责 dock/sheet、外部标签、关闭和焦点归还。
- 笔记编辑器和课堂便签只在真正前台且 dock 展开时挂载重型编辑器。

## 本轮（接手后）修复的真实问题

1. **右侧工具栏溢出，收起按钮被挤出视口（真实浏览器发现，1440×900）**
   内置工具标签条（含浏览器收藏夹固定标签，宽度可达 454px）此前是 `shrink-0`，会把窗口标签和 `收起右侧面板` 按钮推到 x=1538（视口 1440）之外，导致**收起按钮点不到**。
   修复：`RightPanel` 的工具栏按"是否存在窗口坞标签"分配空间——有坞标签时内置条改为 `min-w-0 shrink basis-auto max-w-[45%]`（可横向滚动），否则 `flex-1`；窗口标签容器相应在 `flex-1` / `shrink-0` 之间切换。
2. **添加内容按钮会被标签滚动带走**
   修复：`AgentDockTabs` 拆成"可滚动 tablist + 固定 addContent"，标签再多也不会把「＋」滚出可视区。
3. **窄 dock 下窗口动作按钮与"扩展右侧工作区"重叠（真实浏览器发现，dock 宽 230px）**
   业务 `actions` 是 `min-width:auto` 的 flex item，会同时溢出自己的容器并盖住 dock 扩展按钮，导致「删除这篇笔记」等动作点不到。
   修复：`WindowChrome` 把 `actions` 放进 `min-w-0 overflow-x-auto` 区域，外链与 dock 扩展按钮 `shrink-0`，右侧整组限制为 `max-w-[calc(100%-6rem)]`。窗口控制始终可点，业务动作可横向滚动到。
4. **前台 Esc 会关掉右栏文档（规划 §7.4 要求但此前未实现）**
   实测：焦点在中央对话输入框时按 Esc，会命中 overlay 栈把右侧笔记关掉。
   修复：新增 `useDockTypingFocusGuard`；`ManagedWindow`（dock）与 `WorkspaceSurface`（dock）在"焦点位于右栏之外的输入框"时不注册前台关闭浮层。行为与 `KeyboardShortcutProvider` 现有的输入框保护规则一致。Sheet（移动端）不受影响。
5. **窄屏 sheet 关闭后焦点丢到 body，且缺少模态语义**
   修复：`ManagedWindow` 在 `sheet` 展示下记录打开前的焦点，关闭时归还；sheet 根节点补 `role="dialog"` + `aria-label`。

## 覆盖清单

### ManagedWindow（17 种类型，公共壳自动分流）

| 类型 | 本轮浏览器实测 | 说明 |
|---|---|---|
| user-note-editor | 是 | dock 内编辑标题/源码草稿，切标签、收起/展开、跨视口都保留正文 |
| user-note-library | 是（移动端 sheet） | 390×844 下为整屏 sheet，无 dock 控件 |
| source-preview | 是 | 强制内嵌路径下 iframe 在 dock 内；同 URL 重复打开只有一个标签 |
| attachment-preview | 是 | 上传 Markdown → DocumentWorkspace 在 230px 窄 dock 内不越界 |
| billing-dashboard | 是（Ctrl+4） | 宽内容在窄 dock 内不越界，工具栏仍可达 |
| floating-chat | 是（Ctrl+I） | 在 dock 内渲染，不产生 body 浮窗；Alt+W/Alt+M 生效 |
| artifact-viewer / document-viewer / note-citation-viewer / source-trace-viewer / image-gen-viewer / record-preview / membership-sponsor / flashcard-cite-picker / agent-product-picker / memory-proposal / quiz-explain | 否 | 需要 Agent 会话产物、课堂录音或本地文档数据；沿用同一公共壳与关闭分发，本轮未做浏览器实测（见限制） |

- 覆盖结果：**所有 managed 类型都走同一个公共展示策略和关闭分发**，没有为任何业务组件复制 Agent 版本；只有笔记/课堂便签保留"仅前台挂载重编辑器"的薄适配。
- 真实关闭：标签叉号 → `closeManagedWindow(win)` → 业务 store 清理（实测删除笔记后 windowManager 记录与标签同时消失，无空标签）。

### 独立业务 surface（非 ManagedWindow）

| 入口 | 状态 | 实测结果 |
|---|---|---|
| AgentSettingsOverlay（顶栏"设置"） | 已接入 | dock 内全宽渲染，独立标签，标签叉号走原 `onClose`，无残留标签 |
| GlobalSettings（左下用户菜单"设置"） | 已接入 | 使用 page 变体填满 dock，无浮窗外壳 |
| UserQuotaPanel（用户菜单"额度"） | 已接入 | dock 内渲染，关闭后无标签 |
| AccountDialog（设置内"查看账户"） | 已接入 | 与其他 surface 并存为两个标签；dock 下不再显示自带关闭头 |
| LoginOverlay（设置内"登录"） | 已接入 | 登录表单填满 dock（不再居中浮窗），原 `openLoginOverlay`/`onClose` 未改 |
| SpotlightDialog / GlobalSearch | 已接入 | 通过 `WorkspaceSurface` 复用搜索正文；本轮未在浏览器逐一打开（快捷键帮助已实测同一条适配路径） |
| ShortcutHelpOverlay（Ctrl+Shift+/） | 已接入 | dock 内渲染，Esc 关闭的是它而不是后台笔记 |

### 保持附属层语义（未改成标签）

| 表面 | 结论 |
|---|---|
| 删除确认 | 实测 `role="alertdialog"` + `aria-modal="true"`，portal 到 body，**不进入 dock、不新增标签**，按钮顺序仍为 取消 → 删除 |
| 输入上限提示 | 实测 `role="alertdialog"`，非 dock、无新标签 |
| 图片 Lightbox | 代码未改动，仍是 body portal 的模态层（`useOverlayRegistration` priority 90、锁 body 滚动）。本轮没有可触发的带图消息，未做浏览器实测 |
| CanvasFullscreenPortal | 代码未改动，注释已说明必须 portal 到 body（祖先 `contain:layout` / `transform` 会吃掉 fixed）。**保持全屏附属层是有意设计**，不是待统一的标签 |
| 人机验证 `HumanChallengeDialog` | 代码未改动，仍是认证流程内的局部模态层；需要后端下发验证挑战才能触发，本轮未实测 |
| 下拉菜单/右键菜单/tooltip/模型选择 | 未改动，仍锚定触发点 |

## 已执行验证（本轮实际命令与结果）

| 命令 | 结果 |
|---|---|
| `pnpm run test:react` | 通过：144 个文件 / **534** 个测试（上一轮 530，本轮新增 4 个针对新行为的测试） |
| `pnpm run test:unit` | 通过：232 个文件 / **1311** 个测试 |
| `pnpm exec tsc --noEmit --incremental false` | exit 0 |
| `git diff --check` | exit 0 |
| `pnpm run lint:eslint` | exit 0：**0 errors / 92 warnings**（与基线一致，均为既有规则警告） |
| `pnpm run build` | 通过：Turbopack 编译成功，1337/1337 静态页面生成完成 |
| `pnpm run lint` | **exit 1**：ESLint 0 error/92 warning 通过；Knip 阶段报 3 个未使用文件、14 个未使用导出、1 个未使用导出类型、5 条配置提示——全部为既有问题（含 `SelectionAssistantGuard.tsx`、`useFlashcardCitations.ts`、`useUserNotes.ts`、`lib/workspace/agentDock.ts: agentFullscreenPanelId`；后者在基线 `HEAD` 就已无人引用）。本轮新增文件/导出未被 Knip 标记 |

### 本轮新增的回归测试

- `components/window/ManagedWindow.test.tsx`
  - 焦点在 dock 之外的输入框时，dock 窗口不注册前台 Esc；焦点回到 dock 内部后重新注册
  - 移动端 sheet 关闭后焦点归还触发按钮
- `components/window/WorkspaceSurface.test.tsx`
  - external surface 在同样的输入框焦点条件下不抢前台 Esc
- `components/window/WindowChrome.test.tsx`
  - dock 模式下业务 actions 位于可横向滚动区域，窗口控制（关闭/收起标签/扩展）与其并列，不再互相覆盖

这些是行为断言（overlay 栈成员、activeElement、DOM 兄弟关系），不是类名断言。

## 真实浏览器验收（Playwright + Chromium，黑盒）

### 环境

- 开发态：`pnpm dev`（端口 35349），脚本访问 **`http://localhost:35349/agent`**。
- 生产态：`pnpm run build` 后 `pnpm start`（端口 35349），脚本访问 `http://127.0.0.1:35349/agent`，复跑核心流程 + 控制台巡检。
- **重要环境结论（不是产品 bug）**：Next 16 开发服务器默认阻止非同源 dev 资源（`/_next/webpack-hmr`）。用 `127.0.0.1` 访问 dev 时页面 SSR 正常但**不会 hydrate**，所有点击都无反应——上一轮"添加内容菜单打不开"即由此产生。改用 `localhost` 后单击即开菜单（脚本一次点击成功）。生产构建两种主机名都正常。

### 桌面 1440×900（脚本 flow1 / flow2 / flow3 / flow5 / flow6）

全部通过的关键结论：

1. 单击「添加内容」→ `aria-expanded=true` + `role="menu"` 出现（一次点击）。
2. 新建笔记 → 编辑器出现在 `#agent-dock-content` 内，有统一标签。
3. 改标题 + 切「源码」+ 写 Markdown 草稿 → 草稿进入正文。
4. 切到内置「动画讲解」→ 笔记节点 **同一 DOM 节点仍在**（`sameNode:true`），`display:none`，草稿文本仍在 DOM；标签 `aria-selected=false`。
5. 切回笔记标签 → 标题与草稿逐字保留。
6. 收起右侧面板 → 面板实测宽度 0，`data-agent-dock-host` 仍在、`data-dock-collapsed=true`、标签记录仍在、笔记节点身份未变、草稿保留。
7. 收起状态下按 Esc → 不关闭隐藏内容。
8. 展开 → 笔记恢复显示，草稿不变。
9. 焦点在笔记内按 Esc → 关闭笔记；焦点在中央输入框按 Esc → **不关闭**笔记。
10. Agent 设置 → dock 内全宽 surface + 标签；切回笔记标签时设置 surface 只是隐藏不销毁；标签叉号关闭后无残留标签、无空标签。
11. 额度 / 全局设置 / 快捷键帮助（Ctrl+Shift+/）→ 同样的 dock surface 行为；Esc 关闭的是当前 active 的快捷键帮助而不是后台笔记。
12. source preview：同 URL 连续打开两次 → 只有一个标签；iframe 元素身份与文档状态（写入的 DOM 标记）在切标签后仍保留，即**切标签不重载 iframe**；关闭后 ManagedWindow、标签、iframe 同时消失。
13. AI 助手浮窗（Ctrl+I）在 dock 内渲染，不产生 body 浮窗；Alt+W 只关闭当前 active 标签；Alt+M 最小化后窗口保留标签但退出内容区，Esc 不会误关最小化窗口，点标签可还原。
14. 窄 dock（把分栏拖到最小，实测面板宽 230px）：Markdown 附件以 `document-workspace` 渲染且不超出内容区；文档宽度 229 = 内容区宽度；页面无横向溢出；Ctrl+4 的 API 计费总览同样不越界，`收起右侧面板` 仍可点。
15. 登录 / 账户信息作为 external surface 与设置并存为标签，宽度等于 dock 宽度；关闭当前 external 标签后 dock 回落到内置工具页，剩余标签可再次激活，最后关闭不留孤儿。
16. 删除确认：`alertdialog` + `aria-modal`，不在 dock 内、不新增标签、取消在前删除在后；取消保留笔记，确认后笔记窗口与标签一起消失。
17. resize handle：右侧面板从 403 → 552，dock 内容宽度跟着变（551 = 内容区 551），工具栏控件都在视口内，页面无横向溢出。
18. 浏览器缩放等效宽度：125%（1152px）与 80%（1800px）下均无横向溢出，`收起右侧面板` 与「＋」都在视口内。
19. 控制台巡检（生产构建，走完笔记/内置标签/收起展开/设置/iframe/额度）：**0 个 console error、0 个 pageerror**；只有 1 条既有 Chromium 警告（source preview 的 `sandbox="allow-scripts allow-same-origin"` 提示，来自未改动的 `SourcePreviewViewer`）。

### 移动端 390×844（脚本 flow4，`is_mobile` + touch）

- 移动端 `/agent` 会被 AppShell 重定向到上一次 Studio 路径，页面上**不存在** `[data-agent-dock-host]`（符合"不能假设右侧 DOM 一定存在"）。
- 从移动端 UI 打开笔记库窗口 → `[data-surface="sheet"]`：`position:fixed`、x=0、宽 390、高 844，页面无横向溢出。
- sheet 内**没有**"收起当前标签""扩展窗口""拖拽缩放窗口"等桌面控件；根节点带 `role="dialog"` 与标题。
- 关闭后 sheet 卸载，焦点回到触发按钮（实测 activeElement 为 BUTTON）。
- 桌面 → 390px：右侧宿主消失，同一篇笔记转为 sheet，正文逐字保留；回到 1440px 后应用按既有规则停在 Studio 路由（笔记以浮窗继续存在），通过模式切换器回到 Agent 后笔记重新 dock（`position:relative`，无浮窗），标签与草稿都在。

### 截图

截图目录：`C:\\Users\\AIMFl\\.codex\\visualizations\\2026\\09\\19\\agent-dock-acceptance\\`

- `01-add-menu.png` 添加内容菜单
- `02-note-dock.png` / `03-note-draft.png` 笔记 dock + 草稿
- `04-builtin-tab.png` 内置标签下笔记被隐藏
- `06-collapsed.png` / `07-expanded.png` 收起与展开
- `09-settings-dock.png` Agent 设置在 dock
- `11-quota-dock.png` / `12-global-settings-dock.png` 额度与全局设置
- `13-shortcut-help-dock.png` 快捷键帮助
- `14-iframe-dock.png` / `17-iframe-dock.png` source preview iframe
- `19-mobile-sheet.png` 移动端 sheet
- `20-narrow-after-desktop.png` / `21-back-to-desktop.png` 跨视口往返
- `22-resized-panel.png` 手动拖拽分栏
- `23-zoom-125.png` / `23-zoom-80.png` 缩放等效宽度
- `24-narrow-doc-dock.png` 窄 dock 里的 DocumentWorkspace
- `25-narrow-billing-dock.png` 窄 dock 里的宽内容
- `26-delete-confirm.png` 删除确认
- `27-login-dock.png` / `28-account-dock.png` 登录与账户
- `29-floating-chat-dock.png` / `30-minimized-dock.png` AI 浮窗与最小化
- `31-input-limit.png` 输入上限

## 浏览器未能执行的项目及原因

1. **artifact-viewer、image-gen-viewer、document-viewer、note-citation-viewer、source-trace-viewer、record-preview、membership-sponsor、flashcard-cite-picker、agent-product-picker、memory-proposal、quiz-explain**：需要真实 Agent 会话产物、课堂录音或本地文档/产物数据。本轮没有可用的会话与仓库数据，未做交互实测；它们与已验证类型共用同一公共壳、同一条 `closeManagedWindow` 分发。
2. **图片 Lightbox**：只有在聊天消息里点图片才会打开，本轮没有带图会话。
3. **画布全屏（CanvasFullscreenPortal）**：只能从 Agent 产物画布进入，同上。
4. **人机验证（HumanChallengeDialog）**：需要后端下发验证挑战，本轮没有可用凭据。
5. **额度面板数值、登录/验证码真实请求**：没有测试账号与验证码通道，只验证了容器、标签、关闭与焦点，没有提交真实认证请求。
6. **真实手机软键盘遮挡**：Playwright 无法弹出移动端软键盘，只验证了 390×844 的布局、可视高度与控件可达性。
7. **刷新页面恢复语义**：本轮未测；`windowPersist` 行为未改动。
8. **Electron/`<webview>` 分支**：`SourcePreviewViewer` 在 Electron 走 `WebviewSite`，本轮只在 Chromium 里跑了 iframe 分支。

## 仍存在的限制

1. **编辑器"源码/渲染/分栏"模式选择是组件局部 state**：Agent↔Studio 或 dock↔sheet 切换（组件被重新挂载）后会回到默认的"渲染编辑"。**正文草稿不会丢**（已在浏览器实测），但模式选择、选区、完整撤销栈不保证保留。
2. **iframe 在不同展示形态之间（dock→sheet→dock）会被重新创建**：本次实测证明"同一 dock 内切标签不重载 iframe"（元素身份与文档状态均保留）；跨展示形态切换时 React 会重建 portal 内容，iframe 内部状态无法导出，未做保留承诺。
3. **窄 dock 的取舍**：右侧面板最小 16%（1440px 下约 230px），低于笔记编辑器声明的 460px 最小宽度。公共壳保证了"控制按钮始终可点、业务动作可横向滚动"，但没有为业务组件做窄栏专用布局；没有采用 `min-width:520px` 撑破页面的做法。
4. **DocumentWorkspace 的"窄栏目录折叠"未实现**：规划 §9.2 建议把左侧目录折叠成按钮/抽屉。实测 230px 下 DocumentWorkspace 仍能完整落在内容区内、页面不横向溢出，因此本轮只做了公共壳修复，没有改业务组件。
5. **移动 sheet 未加 `aria-modal`**：sheet 覆盖整屏但应用没有焦点陷阱，加 `aria-modal="true"` 会与真实行为不符；本轮只补了 `role="dialog"` + `aria-label` + 焦点归还。另外 `KeyboardShortcutProvider` 在移动端直接 return，移动端本来就不响应 Esc。
6. **依赖输入框保护而非通用焦点优先级**：Esc 的抑制条件是"焦点在右栏之外的输入框"，不是规划 §7.4 设想的完整"嵌套确认 → 有焦点表面 → 工作区"优先链。已覆盖真实风险（打字误关文档），其余焦点场景仍走既有 overlay 栈。
7. **`pnpm run lint` 仍 exit 1**：Knip 既有问题（见上表），未做无关删除。
8. **开发态必须用 `localhost` 访问**（Next 16 dev 跨源保护），否则页面不 hydrate；这只影响本地验收脚本，不影响产品。

## 与原规划的重要差异

- 没有让 `windowManager.openWindow` 调用 DOM 测量式 `placeAgentDockWindow`；Agent dock 使用 stable host portal，窗口几何只作为普通模式和模式切换的恢复数据。
- 规划中的统一壳落地为 `AgentDockRuntime + AgentDockHost + WorkspaceSurface` 三个薄层，而不是引入新的大型窗口框架或把所有表面强行改成一种 store。
- 移动端明确使用 sheet；桌面 dock 收起时保留宿主和内容身份，区分收起、最小化和真实关闭。
- 没有实现规划 §13 提到的 `agentDockEnabled` 开发开关：Agent 桌面 dock 就是默认展示策略，回退靠代码层而非运行时开关（未做可运行时切换的降级通道）。
- 没有实现规划 §9.2 的"按可用工作区宽度自动降级（并排 → 覆盖抽屉/单页）"：目前只有"移动断点 → sheet"这一条硬分界，桌面窄栏一律留在 dock 内。
- 增加了一处规划未写明的公共能力：`lib/window/dockTypingFocus.ts`（非模态右栏的 Esc 焦点守卫）与 sheet 关闭后的焦点归还。
- 修复了规划未预见、但真实浏览器暴露的工具栏溢出与窄栏动作重叠问题（见上文"本轮修复的真实问题"1–3）。

---

# 第二轮：按用户评审返工（2026-09-19 晚）

用户看过第一轮成果后指出两个方向性错误，本轮先纠正再重做 Agent 外壳。

## A. 撤回「把弹层搬到右侧」的错误改造

用户原话："不要把任何弹窗都复刻到最右侧，也要根据功能来""既然在页面的左下角放置了一个设置按钮或者用户按钮……它为什么要给我放在右侧？""只写一套代码，设置 import 就可以了"。

因此**撤销**第一轮把独立弹层接入右侧工作区的做法，恢复它们原本的左侧锚定 / 居中模态，Agent 模式与其它模式共用同一套实现：

| 文件 | 处置 |
|---|---|
| `components/layout/GlobalSettings.tsx` | 恢复为左下用户按钮锚定的弹出面板（`git show HEAD` 逐字还原） |
| `components/layout/UserQuotaPanel.tsx` | 同上，恢复左锚定额度面板 |
| `components/layout/AccountDialog.tsx` | 恢复居中对话框 |
| `components/auth/LoginOverlay.tsx`、`LoginForm.tsx` | 恢复居中登录浮层，撤回 `showClose` 参数 |
| `components/chat/AgentSettingsOverlay.tsx` | 恢复页面正中设置层 |
| `components/keyboard/ShortcutHelpOverlay.tsx` | 恢复居中快捷键面板 |
| `components/search/SpotlightDialog.tsx`、`GlobalSearchButton.tsx` | 恢复 Spotlight 模态，撤回 Agent 分支 |
| `components/window/WorkspaceSurface.tsx`(+test) | **删除**（该适配器只服务于已被否定的方向） |
| `lib/window/agentDockRuntime.ts` | 移除 `externals` / `registerExternal` / `unregisterExternal` / `activateExternalSurface` |
| `AgentDockTabs`、`RightPanel`、`AgentDockHost`、`windowManager` | 同步移除 external surface 分支 |

右侧工作区现在只承载「文档 / 产物 / 网页等 ManagedWindow 内容」（即用户说的"新增打开的文档或 Agent 输出的内容"），不再承载业务弹窗。

## B. 按用户给的四张 Agent 截图重做外壳

参考 DSH / Codex / ChatGPT 桌面端的共同结构：左栏不常驻、由顶栏按钮从左侧弹出且顶部与顶栏平齐、三栏各自有头部。

| 需求 | 落地 |
|---|---|
| 1(a) 顶栏不再有“＋” | Agent 顶栏只剩 `StudySolo · Agent` + 右侧 `全屏` `左侧面板` 两个按钮；Agent 模式不再注入 WindowTaskbar |
| 1(b) 全局搜索移到左侧导航 | 顶栏移除 `GlobalSearchButton`，搜索入口放进左侧面板头部 |
| 1(c) 不再显示面包屑 | Agent 模式下不渲染 subject/category/item 面包屑 |
| 2(a) 去掉全屏左侧的收起按钮 | Agent 模式不再渲染 `收起顶部导航栏` |
| 2(b) 最右侧新增面板按钮 | `全屏` 右侧新增面板开关（PanelLeft 图标），成为左栏唯一开关（Agent 下同时移除顶栏左侧 ☰，避免两个入口歧义） |
| 2(c) 面板从左侧弹出、顶部与导航栏平齐 | 新增 `components/layout/AgentLeftPanel.tsx`：`position:fixed; left:0; top:0; height:100dvh`，实测 y=0 = 顶栏 top |
| 3(a) 不含内置工具页 | 左侧面板不渲染 动画讲解/可交互/浏览器 |
| 3(b)(c) 只有一个“＋” | 面板内唯一“＋”= `AddContentButton showUrlField={false}`；"新对话"改用笔形图标，不再是第二个加号 |
| 3(d) 显示正常对话 / 划词助手对话 | 复用 `AgentConversationSidebar`（未复制第二份） |
| 4(a) 右键菜单 | 面板空白处右键 → 新建对话 / 新建文件夹；对话右键 → 归档 / 移动到文件夹 / 删除；文件夹右键 → 重命名 / 删除 |
| 4(b) 渐进式披露 | 正常对话与划词对话默认各显示前 5 条，其余用「···」展开（`SESSION_PREVIEW_LIMIT = 5`） |
| 5 对话归档 | `SessionMeta.archived` + `chatHistory.archiveSession`，归档后从默认列表移出；面板底部（访客右侧）新增归档入口，可查看/返回 |
| 6 设置与额度不再放右侧 | 由 A 段撤回达成，仍在左下用户按钮的二级菜单里 |

配套：新增文件夹能力（`ChatFolder` 写进 manifest 的 `folders`、`SessionMeta.folderId`，旧数据缺省为空）、`归档/文件夹` 全部走 `saveManifest` 持久化；`AddContentButton` 的菜单注册进 Esc 浮层栈（priority 62），保证 Esc 先关菜单而不是误关左侧面板。

## C. 本轮验证

- `pnpm run test:react`：143 文件 / **536** 测试通过（新增：左栏不常驻、面板默认不弹出、渐进披露、右键新建文件夹、归档后移出列表等）
- `pnpm run test:unit`：1311 测试通过（同步更新了 `tests/appModeChrome.test.ts` 里对 `data-agent-slot="conversations"` 的源码断言）
- `pnpm exec tsc --noEmit --incremental false`：exit 0
- `git diff --check`：exit 0
- `pnpm run lint:eslint`：0 error / 92 warning（与基线一致）
- `pnpm run build`：编译成功，1345/1345 静态页面
- 真实浏览器（Playwright，`http://localhost:35349/agent`，1440×900）`flow7.py` 全部 16 项通过，截图 `32-topbar.png`、`33-left-panel.png`、`34-left-panel-plus.png`、`35-panel-context-menu.png`、`36-folder-created.png`；另复跑第一轮 `flow1.py` 的 21 项 dock 断言，无回归。

## D. 本轮仍待确认 / 未做

1. **面板按钮位置的确认**：需求 2(b) 写的是"右侧面板按钮"，但 2(c) 与第 3 节说的是"从左侧弹出的左侧面板"。本轮按后者实现（按钮在顶栏最右、面板在左侧）。若按钮本意是开关**右侧**工作区，只需把 `toggleAgentPanel` 换成右栏 collapse/expand。
2. **文件夹内的对话拖动排序**、文件夹嵌套、归档批量管理未做。
3. 左侧面板目前默认关闭、状态不持久化（每次进入 Agent 都是收起状态）。
4. 归档对话只是从列表移出，仍在本地 manifest 里；没有单独的"归档管理页"。

---

# 附：hydration mismatch 修复（用户实测报错，方案 A）

## 症状与定性

用户报告 `Hydration failed because the server rendered HTML didn't match the client`，差异落在 `ChatInput` 的「联网搜索」开关上。
**与右侧工作区改造无关**：`git diff HEAD -- components/chat/ChatInput.tsx lib/stores/settings.ts components/chat/ChatPanel.tsx` 为空，最后一次改动 `ChatInput` 的提交是 `ae621137`（2026-09-17，早于基线）。

## 根因

- `lib/stores/settings.ts:235` — `load()` 在服务端直接返回 `DEFAULTS`；
- `lib/stores/settings.ts:489-490` — `useSettings = create(...)` 在**浏览器模块初始化时同步读 localStorage**；
- 于是「本机设置 ≠ 默认值」的用户，首帧客户端渲染与服务端 SSR 不一致；
- 触发点是把设置值在首帧直接渲染的组件。

## 实测爆破半径（逐项播种，非默认值）

| 设置 | 修复前 | 修复后 | 引爆点 |
|---|---|---|---|
| `defaultSearch: true` | ❌ | ✅ | `ChatInput` 联网搜索开关 |
| `defaultThinkingEffort: "high"` | ❌ 文本 | ✅ | 「深度思考·High」文案 |
| `selectedModelId: gpt-5.6-sol` | ❌ 文本 | ✅ | `ModelMenu` 模型按钮文案 + `ChatInput` |
| `showRightPanelTabBar: false` | ❌（/ 与 /agent） | ✅ | `RightPanel` 工具栏整行 + `ChatPanel` 头部按钮 |
| 其余 9 项设置 / theme / academicYear / browser | ✅ | ✅ | 当前渲染分支未直接使用 |

## 修复（方案 A：定点 + 通用小工具）

新增 `lib/hooks/useHydratedSetting.ts`：用 `useSyncExternalStore` 的 **server snapshot** 让首帧（含 hydration）返回服务端默认值，水合完成后自动切回本机值。既消除 mismatch，也不需要在水合后于 effect 里 setState（符合仓库既有约定）。

改造点：`ChatInput`（`defaultSearch` / `defaultThinking` / `defaultThinkingEffort` / `selectedModelId` / `customApiGroups`，其中三个开关改为「本机默认 + 用户覆盖」派生，交互语义不变）、`ChatPanel`（`showRightPanelTabBar`）、`ModelMenu`（`selectedModelId` / `customApiGroups`）、`RightPanel`（`showRightPanelTabBar`）。

新增回归测试 `lib/hooks/useHydratedSetting.test.tsx`：同进程内先用默认值 `renderToString`，再把 store 改成"本机值"并 `hydrateRoot`，断言 `onRecoverableError` 未被触发且水合后值生效。**做过反证**：把 server snapshot 换回客户端值后该测试立刻失败。

## 验证

- 浏览器（dev `localhost` 与 production `127.0.0.1` 各跑一遍）：6 个播种场景（含"全部叠加"）hydration 报错全部为 0，且水合后本机值正确生效（联网搜索=on、深度思考·High）。
- 全量逐项扫描：14 个场景全部 0 报错。
- `pnpm run test:react`：144 文件 / 537 测试通过（新增 1 个回归测试）。
- `pnpm run test:unit`：1311 通过。`tsc` exit 0。`git diff --check` exit 0。`pnpm run lint:eslint`：0 error / 92 warning（与基线一致）。
- `pnpm run build`：通过，1337 静态页面。
- 回归：第一轮 dock 流程 21 项、第二轮外壳流程 16 项，均无失败。

## 仍存风险（方案 B 待评估）

任何**新增**的"把持久化设置渲染进首屏"的代码都会重新引入同类问题；目前靠 `useHydratedSetting` 逐个接入。
`ChatInput` 里 `const settingsSnapshot = useSettings()`（整 store 订阅）仍参与 `readPlanModeGate / resolvePlanMode`，只是 `planMode*` 字段当前不在 `Persisted` 里，尚未引爆。彻底做法（方案 B）是让 settings store 首帧恒为 DEFAULTS、水合后统一应用本机快照。

---

# 附二：hydration 根因修复（方案 R2）+ 自动化护栏（R3）

上一节（附一）用 `useHydratedSetting` 逐点隔离了 5 处渲染，本节把根因修掉并补上护栏。

## R2：settings store 改为「默认值起手 + 水合后应用」

`lib/stores/settings.ts`

- store 初值改为 `{ ...DEFAULTS, hydrated: false }`，**模块初始化不再读 localStorage**；
  服务端与客户端首帧因此完全一致。
- 新增导出 `hydrateSettings()`（幂等）：读取本机配置并应用，然后触发桌面端密钥水合。
- 新增 `pickStoredOverrides()`：只挑出「盘上确实与默认值不同」的字段做**加性合并**。
  这样即便水合发生在一次早期写入之后，也不会把刚改的字段冲回旧值；
  正常路径下与「整份覆盖」等价。
- `setter` 包装：任何写入之前若尚未水合，先 `hydrateSettings()`，
  避免这次修改被随后的水合冲掉、或把 DEFAULTS 落到盘上。
- `persist()` 兜底：未水合直接返回，绝不覆盖盘上配置。
- `settingsLoadWarning` 单独随水合一起带上（它不属于持久化字段，否则恢复流程的警告会丢）。

`components/layout/AppShell.tsx`：在既有的根 `useLayoutEffect`（已调 `hydrateLayout/hydrateMode`）里加 `hydrateSettings()`。
AppShell 在 `app/layout.tsx` 里包住所有路由，因此每条路由都会触发。

**收尾**：删除了 `lib/hooks/useHydratedSetting.ts` 及其测试，`ChatInput` / `ChatPanel` / `ModelMenu` / `RightPanel`
的 5 处调用恢复为普通订阅——store 自身已保证首帧等于服务端默认值，不需要第二套机制。

顺带修掉同类问题：`ChatInput` 的 `planMode` 初始化器原先也用 `useSettings.getState()`（新 ESLint 规则抓出来的），
改为「设置派生值 + 用户覆盖」。

## R3：让这类问题以后能被自动发现

| 护栏 | 位置 | 覆盖 |
|---|---|---|
| store 契约测试（始终运行） | `lib/stores/settings.hydration.test.tsx` | ①模块初始化不读本机设置（`vi.resetModules` + 动态 import 断言 `hydrated=false` 且值等于 DEFAULTS）；②`renderToString` + `hydrateRoot` 无 `onRecoverableError`，水合后才切到本机值；③水合前写入不会丢盘上其它配置 |
| ESLint 规则（始终运行） | `eslint.config.mjs` → `no-restricted-syntax` | 禁止 `useState(() => useSettings.getState()…)` / `useAppMode.getState()…`；已用探针文件反证会报错 |
| 真实浏览器检查（需手动跑） | `scripts/check-hydration.py` + `pnpm run check:hydration` | 用「非默认设置」种子打开 `/` 与 `/agent`，断言 0 条 hydration 报错；无 Playwright 时打印 SKIP 并非静默通过 |

契约测试做过反证：把 store 改回「初始化即读 localStorage」，测试立刻失败。

## 验证（本轮实跑）

- `pnpm run test:react`：144 文件 / **539** 通过（新增 3 个 store 契约测试，更新 `settings.persist.test.tsx` 使其显式模拟水合）。
- `pnpm run test:unit`：1311 通过。
- `pnpm exec tsc --noEmit --incremental false`：exit 0；`git diff --check`：exit 0。
- `pnpm run lint:eslint`：**0 error / 92 warning**（与基线一致，本轮新增的告警已全部清掉）。
- `pnpm run build`：通过，1337 静态页面。
- `pnpm run check:hydration`：dev（`localhost`）与 production（`127.0.0.1`）**各 6 个场景全部 hydration=0**，且水合后本机值正确生效（联网搜索开、深度思考·High）。
- 浏览器回归：第一轮 dock 流程 21 项、第二轮外壳流程 16 项，无失败。

## 已知取舍

1. **首帧会短暂显示默认值**：改过设置的用户在「SSR HTML 首次绘制 → 水合完成」之间会看到默认值
   （模型芯片、联网搜索/深度思考开关、右栏工具栏行等约 5 处）。这是本方案与「服务端拿不到 localStorage」的必然代价；
   若要连这点闪动也消掉，需要像 `theme` 那样把关键值放进 `app/layout.tsx` 的预绘制内联脚本或改用 cookie 快照。
2. `lib/stores/browser.ts` 仍是「模块初始化同步读 localStorage」的同类例外，目前靠消费方 `useIsClient()` 兜住，
   未纳入本次改造。
3. 计划模式的 `planMode*/agentPlanMode` 字段目前不在 `Persisted` 里，`readPlanModeGate` 实际恒为默认值；
   已顺带改成水合安全的写法，等设置页补上这些字段后无需再改。

---

# 附三：按用户逐条纠正重做外壳（左右彻底捋清）

用户明确指出上一轮把左右搞反了，并给出 5 条权威口径：

| # | 口径 | 处置 |
|---|---|---|
| 1 | 右侧面板**通到窗口最顶**（比顶栏高、与顶栏最上沿平齐），**从左侧拉出** | 右侧工作区改为顶层布局里与「顶栏 + 主区」并列的一列；实测 `y=0, h=900`（视口 900），左边界 951，顶栏只覆盖 x=0..950 |
| 2 | **顶栏最右按钮控制右侧面板**（此前被我接成了左侧导航） | `data-testid="agent-dock-toggle"`，aria-label「展开/收起右侧工作区」，改的是 `rightCollapsedByProfile` |
| 3 | 左侧导航栏**结构固定**，可自由压缩、可收起 | 删除上一轮的 `AgentLeftPanel` 覆盖式抽屉与 `agentPanelOpen`；左栏恢复为 PanelGroup 常驻列（`agent-conversations`，14%–40% 可拖、可收起），板块仍是 新对话 / 我的资产 / 正常对话 / 划词助手对话 |
| 4 | 动画讲解 / 可交互 / 浏览器**在 Agent 里必须没有** | `RightPanel` 新增 `hideBuiltinTabs`：Agent 右侧工作区不再渲染内置栏目，收藏夹与浏览器设置一并消失 |
| 5 | **Agent 输出的东西进右侧面板** | 右侧工作区只承载 ManagedWindow（文档/产物/网页）；实测新建笔记落在右栏列内 |

## 结构调整

- 新增 `components/layout/AgentDockColumn.tsx`：右侧工作区整列（`data-agent-slot="windows"` + `#right-panel` + `AgentDockHost > RightPanel hideAiTab hideBuiltinTabs showWindowDock`）。
- `AppShell` 新增 Agent 专用桌面外壳（`isAgentRoute`）：`PanelGroup[ 主列(顶栏 + children) | 拖拽条 | 右栏 ]`，`autoSaveId="studysolo-agent-shell-v1"`；右栏扩展控制器（`registerPanelControls`）与 store→面板同步 effect 都搬到这里。
- `AgentWorkspace` 回到「左对话栏 + 中央对话」，不再持有右侧窗坞；恢复「展开对话栏」按钮。
- `AgentConversationSidebar` 的收起按钮恢复控制左栏折叠（`setSidebarCollapsed`），标题回到「对话」。
- CSS：删掉左侧抽屉样式，新增 `.agent-dock-column` 从左侧拉出的进入动画（尊重 reduced motion）。

## 本轮浏览器实测发现并修掉的真实缺陷

新外壳最初漏掉了业务窗口挂载层（`DeferredWindowLayers` 等），右栏会出现**"有标签没正文"**：
新建笔记后只出现 tab、`[data-surface]` 为空。已在 Agent 外壳补回 `DeferredWindowLayers / AgentSettingsOverlay / LoginOverlay / PipPlayer / ToastHost`，
复测 `[data-surface="dock"]` 正常挂载在 `#agent-dock-content` 下。

## 验证

- 新增浏览器脚本 `flow8.py`：10 项断言全通过（通顶几何、顶栏按钮控制右栏、左栏常驻与板块、内置栏目消失、Agent 输出落位），截图 `40-agent-shell.png` / `41-dock-collapsed.png` / `42-agent-output-in-dock.png`。
- 回归：`flow1.py` 的 21 项 dock 断言无失败；`pnpm run test:react` 144 文件 / 538 通过；`pnpm run test:unit` 1311 通过；
  `tsc` 与 `git diff --check` 通过；`pnpm run lint:eslint` 0 error / 92 warning（与基线一致）；`pnpm run build` 通过（1337 页）。
- 同步更新 `tests/appModeChrome.test.ts` 与 `AgentWorkspace.test.tsx` 对新结构的断言。

## 说明

上一轮提交（`2881da61`）里的左侧覆盖面板方案已按本轮口径整体替换；`flow7.py` 是旧外壳的脚本，已不再适用。
---

# 附四：统一改造后的代码清洗（死代码退役 · 单一真相源）

用户要求「先系统性分析最近改动的相关板块，尤其是 Agent 板块，可能需要做一做代码清洗」。本轮只做清洗与由此暴露的缺陷修复，不新增能力。

## 分析证据

- 静态：全仓引用检索、`knip`、`git log -S` 逐个符号追溯「谁还在用、是谁引入的」。
- 关键追溯：`lib/workspace/agentDock.ts` 与 `useWestResizable` 来自基线提交 `644e9d1c`（第一版「右对齐浮窗盖住右栏」方案）；
  `git show 3445f3c8:lib/stores/windowManager.ts` 里 `openWindow` 仍在调用 `placeAgentDockWindow`，说明是本轮 `2881da61` 把它变成孤儿。
- 动态：`tsc` / `eslint` / `vitest` / `node --test` / Playwright 全量回归（见文末验证）。

## 一、死代码退役

| 对象 | 为什么死 | 处置 |
|---|---|---|
| `agentDock.ts` 的 `placeAgentDockWindow` / `agentDockRect` / `fallbackAgentDockRect` / `ensureAgentRightPanelOpen` / `DockGeometry` / `agentFullscreenPanelId` | Agent 右栏改为稳定宿主 portal 后，没有代码再为窗口计算「看起来在右栏」的屏幕坐标；基线里的唯一调用点已在 `2881da61` 移除 | 整模块连同 `agentDock.test.tsx` 删除（`lib/workspace/` 目录随之消失） |
| `resolveWorkspaceFullscreenRect`（同一模块） | 它的 Agent 分支只在「浮窗铺右栏」形态下有意义；dock 窗口的全屏已被「扩展右侧工作区」取代，没有调用方 | 两个调用方（`toggleManagedFullscreen` / `useFullscreenTrack`）改用 `lib/constants/layout.resolveFullscreenRect`；`defaultTargetFor` 去掉 `isAgentWorkspace() → "right"`，`useFullscreenTrack` 去掉 `isAgentWorkspace()` 观测分支 |
| `ManagedWindow` 的「Agent 浮窗加宽」握把 + `useWestResizable` | presentation 判定保证 Agent 只可能是 dock / sheet / pending，`floating && isAgentWorkspace()` 不可达 | 删除握把、`onWestResizeStart` 接线与 `lib/hooks/useWestResizable.ts` |
| `RightPanel.hideAiTab`（含 `agentFallbackTab` 与两处 `hideAiTab` 分支） | 生产唯一调用方 `AgentDockColumn` 始终同时传 `hideBuiltinTabs`，该 prop 只剩测试在用 | 收敛为单一 `hideBuiltinTabs` |
| `WindowTaskbar.partitionTaskbarWindows` 的 `host` 形参 | 函数体里是 `void host`，纯占位 | 删形参，更新 3 处测试调用 |
| `WindowChrome.className` | 声明了但没有任何调用方传 | 删 prop 与拼接 |
| `AgentConversationSidebar` 的 sr-only「关闭归档视图」按钮 | 无引用、无行为（归档开关已在底部工具栏） | 删除，连 `ArchiveRestore` 一起 |
| `AgentConversationSidebar` 的 `isCollapsed` 分支 | 组件只在左栏展开时挂载，该值恒为 false | 收起按钮直接 `setCollapsed(true)` |

## 二、修掉的真实缺陷（清洗过程中暴露）

1. **右栏收起内置栏目时，正文仍会挂载内置栏目。** `hideBuiltinTabs` 此前只清空标签条，
   正文区仍按 store 里的 `rightTab` 渲染。复现：在 Studio 把当前 tab 停在「动画讲解」→ 切到 Agent，
   右栏会渲染 `VideoTab`（正是用户第 4 条口径里「不应该有的东西」）。
   现在只有「当前允许且可见」的 tab 才挂正文（`renderedTab`），并补了单测与浏览器断言。
2. **Agent 右栏开合与 Studio 档位右栏串味。** `rightCollapsedByProfile[layoutProfile]` 是 **Studio 内容页档位** 的 key，
   而 `/agent` 的 `layoutProfile` 是上一次 Studio 路由留下的（`setActiveRoute` 只在内容页写）：
   在 Agent 收起右栏会按「上次访问的档位」写进 Studio 记录；Studio 收起 full 档右栏后进 Agent，
   首帧预绘制 CSS（`html[data-right-collapsed-full] [data-layout-profile="full"] #right-panel`）还会把 Agent 右栏压成 0 宽。
   现在 Agent 右栏有独立状态：`ui.agentDockCollapsed` + LS `gailvlun-agent-dock-collapsed` + `data-agent-dock-collapsed`
   + 独立 CSS 规则；Agent 外壳不再挂 `data-layout-profile`（那是内容页档位语义）。
   右栏「收起」按钮的落点由外壳注入（`RightPanel.onCollapse`），不再自己写档位。
3. **Alt+Enter 在 dock 窗口上是「假全屏」。** `toggleFullscreenActiveWindow` 会真的 `setFullscreen`：
   dock 形态不消费 `fullscreen` 几何，唯一可见副作用是把窗口标记成全屏并最小化其它全屏窗——静默改状态。
   现在 Agent 里与右栏绿点同语义：`togglePanelExpand()`。
4. **「当前展示哪个窗口」有两份真相。** `agentDockRuntime.active` 与 `windowManager.activeWindowId` 各自维护，
   `setActiveWindow()` 只更新后者（会让右栏标签与正文脱节），点击窗口/标签时又要成对调用。
   现在唯一真相源是 `activeWindowId`；删除 `active` / `setActive` / `activateManagedSurface` / `activateBuiltinSurface` /
   内置表面类型，以及 `windowManager.syncAgentDockAfterWindowChange()`（`activeWindowId` 的选取逻辑已覆盖它）。
   新增 `lib/window/useManagedWindowSurface.ts` 统一解析 presentation / 可见性 / 可交互 / portal 宿主 / Esc 抑制，
   `ManagedWindow` 与两个笔记窗（此前各自手写一遍「是否是最前的 dock 窗」）都改读它。

## 三、陈旧文档与注释

- `AgentConversationSidebar` 头注释里「由 AgentLeftPanel 以覆盖式抽屉承载」——该组件在附三已删。
- `ChatInput` 注释里的 `useHydratedSetting`——该 hook 在 `2881da61` 已删，改为现行「默认值 + `hydrateSettings()`」契约。
- `docs/plans/agent-right-panel-unification.md` 顶部加「落地状态」横幅：本文件是改造前分析，
  并列出已替换/退役的设计（`WorkspaceSurface`、`placeAgentDockWindow` 一系、`hideAiTab`、`useHydratedSetting`）。

## 四、明确不做（留待决策）

- `FullscreenTarget` 仍保留 `"right"` 目标：本轮只是没有生产方，作为通用能力留着（`resolveFullscreenRect("right")` 仍在）。
- Agent 里 `AgentConversationSidebar` 与右栏标签条各有一个「添加内容」`＋`（左栏那个在左栏收起时仍可用，右栏那个在输出落点旁）：
  功能重叠但各有覆盖场景，属产品取舍，未擅自删。
- `knip` 报的 3 个未使用文件 / 12 个未使用导出、`lib/stores/browser.ts` 同步读 localStorage、`ChatInput` 整店订阅等基线问题不在本轮范围。
- `flow1.py` 是旧外壳脚本（既依赖 dock 里的「动画讲解」内置 tab，也假设页面上只有一个「添加内容」），已被 `flow8.py` / `flow9.py` 取代。

## 五、验证

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | 0 error / 91 warning（基线 92；少的一条是本次删除的未用变量） |
| `knip` | 未使用导出 14 → 13（`agentFullscreenPanelId` 消失），其余与基线一致 |
| `pnpm run test:react` | 143 文件 / 538 通过（文件数 -1 = 删掉的 `lib/workspace/agentDock.test.tsx`；新增 3 条断言抵消） |
| `pnpm run test:unit` | 1311 通过 |
| 浏览器 `flow9.py`（新增） | 9 项全过：两套折叠状态互不影响、收起只写自己的 key、收起时 Alt+Enter 不响应、Alt+Enter 扩展右栏（489 → 662 → 489）、Studio full 档位状态仍生效、Studio 动画讲解 tab 不会跟着进 Agent、无页面异常 |
| 浏览器回归 | `flow8.py` 10 项全过（几何 / 顶栏按钮 / 左栏 / 内置栏目消失 / 输出落位） |

截图：`50-agent-dock-independent.png`（预置 Studio 三档全收起后 Agent 右栏仍展开）、`51-alt-enter-expands-dock.png`、`52-studio-video-tab-not-in-agent.png`。

本轮未改任何 AI 协议、存储格式或业务流程；未提交、未推送。
---

# 附五：交互细化（空态引导 · 统一横向缓动 · 全局显示 · 目录列改右侧）

用户第二轮口径（含一张 Codex 参考截图）：

1. 左上角不需要加号。
2. 右栏弹出后若是空白，应像 Codex 一样给出可点的入口引导。
3. 左右栏拉出/收起要统一成「文件夹展开那种缓动，只是方向换成横向」，全局统一。
4. 对话输入框没有文字时默认只占一行；右栏要有「全局」按钮，点击后除左侧面板外整块显示当前窗口，并提供「缩小」。
5. Agent 中央对话不再需要顶部导航栏（AI 助教的设置/历史/新对话，左侧对话栏已经全都承载了）。
6. 分隔线太粗：全局浅化（对齐 Codex 的细线）。
7. Agent 里的「选择笔记 / 选择闪卡」这类页面：内部导航列从左侧改到右侧，并且必须能收起；不能影响 Studio。

## 一、逐条落地

| 口径 | 实现 |
|---|---|
| 1 左上角不加号 | `AgentConversationSidebar` 头部只留「全局搜索 + 折叠侧边栏」，`AddContentButton` 移除；加号只剩右栏标签条（输出落点旁边） |
| 2 空态引导 | 新增 `components/window/AgentDockEmptyState.tsx`：右栏没有可显示窗口时给出 5 个已有入口（新建笔记 / 选择笔记 / 复习闪卡 / 导入长文本 / 导入可交互 HTML），点击走各自原有业务路径；窗口都收起时文案改为「窗口都收起来了」 |
| 3 横向缓动 | `html[data-panels-ready] [data-panel] { transition: flex-grow/flex-basis var(--duration-pane) var(--ease-decelerate) }`：Studio 左右栏、Agent 左对话栏与右工作区共用同一条 MD3 emphasized-decelerate（与文件树展开同一曲线）；`[data-resizing]` 拖拽中不参与，`prefers-reduced-motion` 关闭。**时长**：先是 `--duration-slow`(400ms)，用户反馈「比文件夹快、要慢 2~3 倍」后改为专用令牌 `--duration-pane: 1000ms` |
| 4 一行输入框 | `.chat-input-textarea` 的 `min-height: 32px` 就是一行；真正的毛病是 auto-grow 的**首帧错误测量**（见下） |
| 4 全局 / 缩小 | 右栏标签条右侧新增 `agent-dock-global`（`Maximize` ↔ `Minimize`）与 `agent-dock-expand`；全局态给外壳加 `data-agent-global`，用 CSS 把中央对话与顶栏让位、右栏铺满左侧对话栏之外的全部宽度；Alt+Enter 同语义 |
| 5 中央对话去顶栏 | `ChatPanel` 新增 `hideHeader`，`AgentWorkspace` 传入；Studio 右栏 / 手机 / 浮窗仍保留原来的顶栏与自动隐藏逻辑 |
| 6 分隔线浅化 | `--line-soft` 从「与 `--line` 同值」改为 `color-mix(... 42%, transparent)`，并把 5 个样式表里 **24 处** 单边 1px 分隔线（面板、顶栏、标签条、左右栏、文档窗内部）切到它；卡片/菜单/按钮描边仍是 `--line` |
| 7 目录列改右侧 | `DocumentWorkspace` 在 Agent 表面渲染时 `data-nav-side="right"`：正文在左、目录列在右、分隔线换边；`document-workspace-nav-toggle` 贴在正文边缘，可收起/展开目录列（收起后正文拿回宽度）。Studio、PDF/PPT/附件/来源追踪共用同一组件，行为不变 |
| 7 去掉窗口标题栏 | dock 窗口不再画标题与关闭/收起/扩展按钮（标签条已承担），只在有业务动作或外链时渲染一条动作行；`WindowChrome.className` 与 dock 专属按钮一并退场 |

## 二、过程中挖出的三个真问题

1. **空输入框实际占了 6 行。** auto-grow 只在 `[input]` 变化时量一次，而首帧那次测量发生在分栏还没算出宽度时：
   实测 `clientWidth=16px`、`scrollHeight=252`，于是写入 `min(252,150)=150px`，被 CSS `max-height:120px` 夹成 120px，之后再没人重算。
   修法：宽度 < 40px 时拒绝写入；用 ResizeObserver 按**宽度变化**重新量（左右栏一拖就重排换行）；JS 上限常量与 CSS `max-height` 对齐到 120px。
2. **预绘制「硬收拢」CSS 把缓动掐断。** `html[data-right-collapsed-*] … { max-width: 0 }` 是为了首帧不闪，但 `max-width` 不在过渡属性里，
   点「收起右侧面板」时面板在 55ms 内直接归零（追踪到的宽度序列：489 → 0，而内联 `flex` 直到 58ms 才变）。
   修法：这些规则只在 `html:not([data-panels-ready])`（挂载前）生效，挂载后交给分栏库的内联 flex 走同一条过渡。
3. **全局模式的左栏宽度变量有反馈环。** `--agent-left-width` 最初写在 `AgentWorkspace` 上，但消费方是它的**祖先**面板（CSS 变量只向下继承），
   取不到就退回 `15rem`；而观测器又会把自己驱动出来的宽度再写回去（228 → 240 → …）。
   修法：变量挂到 `<html>`，并在全局态停止回写。

## 三、缓动时长的实测对照

| 对象 | 曲线 | 走完 50% | 走完 | 备注 |
|---|---|---|---|---|
| 文件树分组收起（用户参照物） | framer-motion accelerate 400ms | 385ms | 468ms | 高度 36 → 0，先慢后快 |
| 右栏收起（改前） | CSS emphasized-decelerate 400ms | **93ms** | 409ms | 宽度 489 → 0，起步太快（用户说「过于快了」） |
| 右栏收起（改后） | 同曲线 `--duration-pane` 1000ms | 135ms | 987ms | 同为 489 → 0，整体慢 2.4 倍 |

另修掉一条 dev 警告：Agent 外壳的主面板补了 `defaultSize={66}`（react-resizable-panels 要求给默认尺寸，避免 SSR 后的布局抖动）。

## 四、验证

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `pnpm run test:react` | 143 文件 / 540 通过（新增 WindowChrome dock 契约与 DocumentWorkspace Agent 目录列断言） |
| `pnpm run test:unit` | 1311 通过 |
| 浏览器 `flow10.py`（新增） | 16 项全过：空框 32px（多行 72px、清空回 32px）、中央对话无顶栏、左栏无加号、空态引导 5 项、dock 窗口无标题/关闭/收起/扩展、全局态右栏 1212px 且左栏 228px 不变、全局态有「缩小」、缩小复原 489px、Alt+Enter 同语义、收起途中有横向缓动（489→82→0）、选择笔记目录列在右（sidebar x=1224 > stage x=952）、收起目录列正文 272→488、Studio 仍是左侧且无把手、`--line` ≠ `--line-soft`、无页面异常 |
| 浏览器回归 | `flow8.py` 10 项、`flow9.py` 9 项全过（两处断言按新语义更新：Alt+Enter = 全局/缩小；内置栏目判定改为查右栏按钮，不再用整页文本——空态引导里本来就有「导入可交互 HTML」） |

截图：`60-dock-empty-guide.png`（空态引导）、`61-dock-window-no-chrome.png`（窗口去掉标题栏）、`62-agent-global.png`（全局）、`63-picker-nav-right.png`（目录列在右）。

## 四、说明

- 全局态刻意**不移动 DOM**：窗口正文始终在 `#agent-dock-content` 里，只是用 CSS 把中央对话与顶栏让位，
  这样切进切出不会重挂 iframe/编辑器（草稿、生成、滚动位置都不丢）。
- 手机端抽屉本来就是横向缓动（`transform 280ms` 同一条 MD3 曲线），未改。
- 「全局」不落盘：刷新、右栏收起、窗口关闭都会自动退出，不会留下半个全局态。
---

# 附六：分栏尺寸的持久化契约（用户口径）

用户明确要求：**用户拖过的左/右栏宽度必须存进浏览器本地（localStorage），刷新或下次打开就用上次拖到的宽度；不落数据库。**

## 契约（实现必须遵守的优先级）

1. **用户拖拽记录 > 模式预设**：只要某一列被拖过，永远以 localStorage 里的记录为准，模式预设只在"这一列从未被拖过"时生效。
2. **程序绝不覆盖用户记录**：应用预设、收起/展开动画、"全局"模式都不得写用户的比例记录；收起时把当时宽度记进 `expandToSizes`，展开时原样恢复。
3. **按模式各自独立**：Agent 与 Studio（含 full / article / reference 三档）各有自己的 key，互不干扰。
4. 只走 localStorage，不碰数据库；不新增服务端字段。

现有 key（实测）：

| key | 作用 |
|---|---|
| `react-resizable-panels:studysolo-agent-shell-v1` | Agent 右栏 / 主区宽度 |
| `react-resizable-panels:studysolo-agent-layout-v2` | Agent 左对话栏 / 中央对话宽度 |
| `react-resizable-panels:gailvlun-layout-v2`（及 `-article` / `-reference`） | Studio 三档的左栏 / 正文 / 右栏 |
| `gailvlun-agent-dock-collapsed` | Agent 右栏是否收起 |
| `gailvlun-right-collapsed-by-profile` | Studio 三档右栏是否收起 |

## 实测（1440×900）

| 操作 | 结果 |
|---|---|
| 拖右栏分隔线到 45.1% → 刷新 | 45.1% ✅ 保持 |
| 拖左对话栏到 17.9% → 刷新 | 18% ✅ 保持 |
| 收起右栏 → 刷新 | 修复前：自己弹回 45.1%，并把 localStorage 的「收起」改写成展开 ❌<br>修复后：仍是收起（0%）✅；再展开回到上次拖到的 45.1%（而不是库兜底的 minSize 20%）✅ |

## 修掉的 bug：挂载瞬间把用户的「收起」改写成展开

根因：react-resizable-panels 在挂载并应用「上次保存为收起」的布局时，会误报一次 `onExpand`。时间线（MutationObserver + rAF 采样）：

```
t=6ms    html[data-agent-dock-collapsed]=true（预绘制脚本，正确）
t=131ms  右栏宽度 0（已按保存的收起布局渲染）
t=164ms  html 属性被改写成 false  ← 面板事件回写，用户意图被吃掉
t=368ms  右栏展开到 489px，localStorage 的 layout 被改写为 [66,34]
```

Studio 的两个面板本来就有 `sidebarPersistReadyRef` / `rightPersistReadyRef` 守卫（挂载后一个 tick 内不接受面板事件），Agent 这个外壳漏了。修法：`dockPersistReadyRef`，挂载后 500ms 内不接受面板回写（用户不可能在这段时间内拖动分隔线），水合完成前 likewise 不回写。

## 已知副作用（待用户决定是否处理）

Agent 的左对话栏与中央对话嵌套在一个分栏组里，其百分比是相对"剩余区域"算的。因此：

- 拖**右栏**分隔线 228 → 190px 时，**左栏像素宽度会被动变化**（15.8% → 13.2%）。

若要求"只拖右边、左边不动"，需要把左/中/右改成同一级的三个分栏（结构改动；Studio 不受影响，但左栏的历史宽度记录会重置一次）。

## 预设表落地（2026-09-19 补齐）

新增 `lib/constants/panelPresets.ts` 作为分栏默认尺寸的**单一真相源**；Agent 外壳、Studio 外壳、右栏「扩展」按钮全部从它取数：

| 预设 | 左 | 中 | 右 | 右栏点开后 |
|---|---|---|---|---|
| `agent` | 14% | 49% | 37% | 48%（「扩展右侧工作区」目标） |
| `studio:full` / `studio:reference` | 19% | 50% | 31% | 31% |
| `studio:article` | 19% | 50% | 0%（默认收起） | 31% |
| `studio:no-right`（首页 / 复习板） | 19% | 81% | — | — |

Agent 的左对话栏与中央对话共处一个嵌套分栏组，用 `nestedShares()` 把「占窗口」换算成组内百分比（14 / 49 → 22.2 / 77.8）。Studio 的数值与改造前**逐项相等**，只是从字面量搬进了表里。

实测（1440×900，清空 localStorage 的出厂状态）：

| 场景 | 实测 |
|---|---|
| Agent 出厂预设 | 左 14%（201px）/ 中 48.9%（705px）/ 右 37%（532px） |
| Studio 首页出厂预设 | 左 19% / 中 49.9% / 右 31%（与改造前一致） |
| 拖右栏到 47.1% → 刷新 | 47.4%（用用户记录） |
| 收起 → 刷新 | 仍是 0%（不再被改写）；再展开回到 47.4%（用户上次拖到的宽度） |

---

# 附七：右栏「全屏」重做 · 宽度变化期的骨架 · 左栏吸附收起

## 用户口径

1. Agent 模式点右栏的「全屏」时：右栏覆盖绝大部分区域，**中间 Agent 对话完全隐藏**，只保留左侧文件夹树，右边就是完整的右栏板块。
2. 收起右栏时，窄宽度下正文会被响应式压成竖排单字，很难看 → 参考 Studio 拖拽时的做法，**用骨架屏盖住**（顺带也是性能优化）。
3. 左侧对话文件夹树：被压到一定程度后**自动彻底收起**；收起时的软动画要**很快**。

## 一、右栏「全屏」重做

第一版把「全屏」做成了**某个窗口的属性**（`globalWindowId`）：没有活动窗口时按钮禁用，且要靠"跟随活动标签"维持。这轮改成**面板级状态** `dockGlobal`：

- 没有打开的窗口也能全屏（显示空态引导）；
- 切换标签就是切换全屏里显示的内容，不需要跟随逻辑；
- 右栏一收起自动退出，不落盘。

同时**删掉「扩展右侧工作区」按钮**（它只把右栏加宽到 48%、不隐藏对话）——点它很容易被理解成"全屏没生效"。现在右栏标签条只有一个 `Maximize ↔ Minimize` 按钮（aria-label「全屏显示这个板块」/「缩小到右栏」），键盘 Alt+Enter 同语义。

连带清理：`panelControls` / `registerPanelControls` / `togglePanelExpand` 这套面板命令句柄失去唯一消费方，整组删除；`useManagedWindowChrome.toggleFullscreen` 在 dock / sheet 下直接返回（dock 的全屏入口已上移到标签条）。

实测（1440×900）：全屏后 左 201px / 中 **0px** / 右 **1239px**、顶栏 `display:none`、窗口正文仍在 `#agent-dock-content` 内（1238px 铺满）；缩小回到 532px。

## 二、宽度变化期间用骨架屏盖住

复用 Studio 已有的 `ChatSkeleton`（GPU-only：只跑 transform/opacity）：

- **右栏**：`dockBusy` = 拖拽中 `isResizing` 或 收展动画期间（时长从 CSS `--duration-pane` 读出来 + 80ms 余量）→ `AgentDockColumn` 里盖一层 `.resize-loader`。
- **左栏**：拖拽分隔线期间（`onDragging`）在对话栏上盖同一层骨架。

顺带给 `.resize-loader` 加了 120ms 的软淡入（`prefers-reduced-motion` 下关闭）。

## 三、左栏吸附收起 + 快动画 + 记住宽度

- `Panel` 加 `collapsible collapsedSize={0}`：拖到 `minSize`(14%) 以下，分栏库吸附到 0 → `onCollapse` 把 store 切到「已收起」，出现「展开对话栏」把手。
- **吸附那一下要快**：`onCollapse` 期间给分组加 `data-pane-snap`，CSS 把缓动从 `--duration-pane`(1000ms) 切到 `--duration-normal`(250ms)；规则写在 `[data-resizing]` 之后才能压过它。
- **收起不再卸载面板**（原先是 `{!sidebarCollapsed && <Panel/>}`）：卸载会丢掉分栏库记的宽度，重新展开只能落到 `minSize`(127px)。现在面板常驻、宽度 0，展开回到用户上次的宽度（实测 201px）。
- 另记一份「舒适宽度」`lastWideWidthRef`：**只在非拖拽状态下记录**（否则往窄拖时会把好值覆盖成吸附点附近的 91px），展开时按它 resize（22.2%）。

## 四、验证

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| 浏览器 `flow11.py`（新增 8 项） | 全过：无窗口也能全屏（中 0 宽 / 左保留 / 顶栏隐藏）、按钮变「缩小到右栏」、缩小回到 532px、全屏里窗口铺满宿主、收起右栏期间有骨架且结束无残留、左栏压过阈值自动彻底收起（宽 0 + 把手）、拖左栏期间有骨架、再展开回到 201px、无页面异常 |
| 浏览器回归 | `flow8.py` / `flow9.py` / `flow10.py` 无失败 |
| 单测 | `AgentWorkspace.test` 的"收起"用例改为断言面板仍在（`data-collapsed` + 宽度 0），因为收起不再卸载 |

截图：`71-global-no-window.png`（无窗口也能全屏）、`72-global-with-window.png`、`73-left-snap-collapsed.png`、`74-icons.png`。

## 附七补记：图标与 F11 全屏的归属（用户澄清后）

- **只换图标**：右栏那个「全屏 / 缩小」按钮改用被删按钮的图标 `Maximize2` / `Minimize2`（⤢ / ⤡，上下对称的"打开"样式）。实测按钮 SVG 路径为 `M15 3h6v6 / m21 3-7 7 / m3 21 7-7 / M9 21H3v-6`。
- **F11 全屏与面板全屏是两回事**：
  - 右栏的「全屏」= 面板接管工作区（`dockGlobal`），保留不动；
  - 真正的网页全屏（Fullscreen API）抽成 `lib/hooks/useBrowserFullscreen.ts`，顶栏与 Agent 对话面板顶部共用一份实现；
  - 按用户口径 1(a)，Agent 里它只在**中间对话面板顶部**显示（顶栏右侧不再出现），Studio 顶栏照旧。
- **中间对话的骨架屏**：任何导致中间面板宽度变化的动作（切真全屏、拖左右分隔线、改窗口大小）都会盖一层 `ChatSkeleton`，
  260ms 后自动撤掉——避免宽度一变正文就重新折行、文字自动异位；骨架只跑 transform/opacity，顺带省掉这段的重排开销。

---

# 附八：Agent 通用化（上下文只靠注入 · 空对话欢迎页）

## 用户口径

1. **上下文设计**：Agent 是注入上下文的通用型助手，目前注入的只有教材大纲；**不把默认章节当成它的上下文**。
2. **页面展示风格**：新建对话时，中间不该再是「我是你的 X 助教 + 当前学习：Y + 试试这样问我」，
   而要像 ChatGPT 官网首页：**上方一句招呼、中间输入框、下方几条 iOS 风格的示例清单**（可点击）。

## 一、上下文：Agent 不再绑定「当前打开的那一章」

原先 Agent 的 `chatContext` 是照着当前页面拼的（科目 / 分类 / 内容项三段拼成 `currentTopic`），
于是每开一个新对话都默认绑在「概率论 / detail / 1.1」这一节上：

- 定位行会写进 system（【当前位置】… 内容项：1.1）；
- 参考材料会把该节全文当成「当前内容」注入；
- 空态还显示一枚「当前学习: probability detail 1.1」的胶囊。

现在判定收敛到一个函数 `isPageBoundContext()`（`lib/types/chat.ts`，分类 + 内容项齐全才算绑定页面），三处共用：

| 位置 | 变化 |
|---|---|
| `AgentWorkspace` 的 `chatContext` | 只带 `subjectId` + `academicYear`，`categoryId` / `itemId` / `currentTopic` 全空 |
| `buildLocationLine()` | 未绑定页面时**整行不输出**（不再拼出「分类： ｜ 内容项：」这种残行） |
| `FullContextManager.buildContext()` | 未绑定页面时跳过页面读取，参考材料只剩课程目录（教材大纲），`sources` 为空 |

科目本身保留：工具链默认检索范围、跨学年口径都靠它，去掉的只是「章节」。实测请求体
`categoryId / itemId / currentTopic` 全为 `""`，`subjectId` 与 `academicYear` 照旧。

工具侧跟着补了一处：`getCurrentPage` 在没有绑定页面时**直说「用户此刻没有打开任何小节页面」**，
不再回成「该页正文尚未生成（占位）」——后者会让模型以为有一页没写完的笔记，转而向用户解释一个并不存在的页面。
（`isSafeContentSegment("")` 本就为 false，所以读盘没有被放开的风险。）

## 二、空对话欢迎页

- 新组件 `components/chat/AgentWelcome.tsx`：
  - `welcomeGreeting(hour)` 按本机时间分档打招呼（早上好 / 中午好 / 下午好 / 晚上好 / 夜深了），
    时钟用 `useSyncExternalStore` 读（服务端快照为空），不参与服务端首帧；
  - `AGENT_WELCOME_EXAMPLES` 四条起手式，覆盖 Agent 真能做的事：整理复习提纲、出复习闪卡、
    做可拖动演示、联网查资料整理简报；点一下就等于把这句话发出去。
- `ChatPanel` 新增 `emptyLayout?: 'classic' | 'agent'`（默认 `classic`，Studio 右栏 AI 与手机端 AI 不受影响）。
  `agent` 时空对话进入 `.chat-panel--welcome` 版式：**问候语在上、输入框居中、示例清单在下**。

### 关键实现约束（踩过的坑）

1. **输入框必须是同一个实例**。`ChatInput` 在常规对话里是绝对定位贴底的浮层；欢迎页里它回到文档流，
   才会被夹在问候语与示例清单之间。做法是把它放在 JSX 里**固定的那一格**（问候语与转录区互换、示例清单挂在它后面），
   靠 `.chat-panel--welcome` 改 `position`——组件不重挂载，草稿不丢（单测直接断言发送前后 `textbox` 是同一个 DOM 节点）。
2. **转录区不卸载，只 `display:none`**。`SelectionPopover` 的 `data-selection-host` / 滚动监听是 ChatThread 挂载时绑定的，
   卸载再挂载会让它的 effect 错过新节点，Agent 里就再也划不中词。
3. **竖向居中用 auto 外边距而不是 `justify-content:center`**：面板不够高时前者能滚动，后者会把问候语裁掉。
4. **CSS 覆盖要写在基础规则之后**：`components/chat/ChatInput.layout.test.tsx` 按「文件里第一条 `.chat-input-container` 规则」取值，
   覆写写在前面会被它读成基础规则（本轮真的踩到）。顺手把该测试的选择器匹配收紧到**行首**，
   这样 `.chat-panel--welcome .chat-input-container` 这类覆盖写法与 `@media` 里的同名规则都不会再冒充基础规则。

## 三、验证

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .`（改动目录） | 0 error |
| `pnpm run test:react` | 146 文件 / 550 通过（新增 `AgentWelcome.test.tsx`、`ChatPanel.welcome.test.tsx` 共 6 例） |
| `pnpm run test:unit` | 1314 通过（新增 prompts / fullContext / getCurrentPage 各 1 例） |
| 浏览器 `flow12.py`（新增 7 项） | 全过：空对话进欢迎版式（问候语 + 4 条示例 + 左右栏都在）、问候在上/输入框中/示例在下、输入框不再贴底（离面板底 457px）、转录区隐藏但未卸载、点示例即发问、发送后回到贴底浮层、请求体不带默认章节、无页面异常 |
| 浏览器回归 | `flow8.py` / `flow10.py` / `flow11.py` 无失败 |

实测（1440×900，全新浏览器 profile）：问候语 `夜深了，想做点什么？`（top 305 / bottom 340），
输入框 358→443（`position: static`），示例清单 453→643（4 条，宽 705px）；
点第一条示例后：欢迎页类名消失、输入框回到 805→890（`position: absolute`）、转录区恢复显示。

截图：`80-agent-welcome.png`、`81-agent-after-send.png`。
---

# 附九：「新建对话」防连点（已有空白新对话就复用）

## 用户口径

点「新建对话」时，如果已经有一条新建出来的空白对话，再点就**不要再添加新的**——
防止连点 100 次莫名其妙多出 100 条。

## 一、为什么必须做（比"多几行垃圾"严重）

`lib/stores/chatHistory.ts` 有 `MAX_SESSIONS = 50`：超上限后每多建一条，**数组最旧的那条会话会连同它的消息与附件 blob 一起被删掉**
（`deleteSessionData` + `scheduleOrphanChatGc`）。所以连点不只是刷出空行，而是会把老的真实对话挤出去删掉。
另外 `createSession` 一调用就 `saveManifest` 落盘，空会话也会被持久化。

## 二、判定：什么算「已经有一条空白新对话」

`isBlankMainSession(meta)`：**main 类型**（排除 floating 划词窗 / note 笔记窗）、**未归档**、**messageCount === 0**。

用 `meta.messageCount` 而不是 `messagesById[id].length`：它写在 manifest 里，不依赖消息体是否已从 IndexedDB 加载回来。
否则切到一个正在加载的真实对话时会被误判成空白，点「新建对话」反而什么都不发生。

## 三、一个口子

新增 store action `startNewChat(context)`，四个入口全部改调它（规则只有一份）：

| 入口 | 原来 | 现在 |
|---|---|---|
| 左栏「新对话」按钮 | `createSession(chatContext)` | `startNewChat(chatContext)` |
| 左栏空白处右键菜单「新建对话」 | 同一个 handler | 同上 |
| 快捷键 `Ctrl/Cmd+Shift+N` | `createSession(currentChatContext())` | `startNewChat(...)` |
| Studio/右栏 AI 头部「新对话」、上下文超限横幅里的「新建对话」 | `createSession(chatContext)` | `startNewChat(chatContext)` |

`createSession` 原样保留：floating / note 会话，以及 `useChat` 里"发送时发现没有 active 会话才补建"的惰性路径，都不走这个守卫。

优先级：**脚下这条就是空白** → 原地不动（草稿、输入框实例都保留）；否则**复用列表里最近那条空白**；都没有才真的新建。

## 四、复用不能走 `switchSession`

`switchSession` 会先把 `_activeMessagesReady` 置 false，再从 IndexedDB 读一次消息体；
空白会话的消息体可能压根不在盘上（懒写还没刷、历史数据里就没有），读空会让 `sessionLoadState` 变 `'error'`，
而 `canSendNow` 只认 `'loaded'`——**发送会被静默挡掉**（点了发送没反应）。
所以复用分支直接按"已加载的空会话"接上：补 `messagesById[id] = []`、`sessionLoadState[id] = 'loaded'`、`_activeMessagesReady = true`，
并写一次 manifest（和真正新建时一样，刷新后仍停在新对话里）。

## 五、轻反馈

一次点击"什么都没发生"会像按钮坏了，所以：

- `blankChatPulse`：复用当前这条空白时 +1（只存在内存里，不落盘）；
- `ChatPanel` 订阅这个脉冲 → 聚焦输入框（`ChatInput` 新增 `focusSignal`，自增即 focus 一次，不碰草稿）
  ＋ 在输入框上方给一行提示「已经在一条新对话里了，直接说你想做什么就行。」，2 秒后自己消失。

订阅写在 `useEffect` 里的 store subscribe 回调中（不是在 effect 体内同步 setState），避开 `react-hooks/set-state-in-effect`。

## 六、验证

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | 0 error（91 warning，与基线一致） |
| `pnpm run test:unit` | 1320 通过（新增 `chatHistory.startNewChat` 6 例：连点复用 / 发过消息才新建 / 脚下是空白不跳走 / 人在真实对话里复用最新空白且可发送 / 归档与浮动笔记不算 / 未加载的真实对话不误判） |
| `pnpm run test:react` | 144 文件 / 551 通过（`AgentConversationSidebar` 断言改走 `startNewChat`；`ChatPanel.welcome` 新增 1 例：不新增会话 + 提示 + 聚焦 + 2 秒后退场） |
| 浏览器 `flow13.py`（新增 8 项） | 全过：开局无会话、首次点击建 1 条、**再连点 5 次仍是 1 条**、连点时有提示且焦点落到输入框、发出消息后会话带标题、有内容后再点真的新建、**快捷键连按 3 次也不涨**、无页面异常 |
| 浏览器回归 | `flow8.py` / `flow10.py` / `flow11.py` / `flow12.py` 无失败 |

截图：`83-blank-chat-hint.png`（连点 6 次后侧栏仍只有一条「新对话」+ 输入框上方的提示）、`84-new-chat-guard.png`。
---

# 附十：会话记录被清空的事故与修复（2026-09-19）

## 事故

用户 Edge 里的 Agent 会话记录全部消失。我把该 profile 的 IndexedDB 克隆出来直接读，确认不是显示问题：

| 键 | 内容 |
|---|---|
| `chat-manifest` | **只剩 1 条**空白会话（`新对话`，messageCount 0），activeSessionId 指向它 |
| `chat-session:*` | **只剩 1 个**（内容 `[]`）；原先 9 个有内容的会话正文已被删除 |
| 其它库 | artifacts 125KB / review-cards 78KB / skills 53KB / billing 36KB / user-notes / image-gen / documents **全部完好** |

即：**只有会话被清空**，其它数据没动。

## 根因链

1. **未水合就落盘**：`saveManifest` 写的是「内存里的 sessionsMeta」，而页面刚加载时它还是空数组。
   此时任何一条新建路径（左栏「新对话」/ 右键菜单 / `Ctrl+Shift+N` / 面板头部 / 划词浮窗 / 笔记窗 /
   云端拉取合并）都会把盘上真实的 N 条会话**覆盖成「只剩刚建的那一条」**（1 条、messageCount 0 —— 与实测到的 manifest 形态完全一致）。
2. **孤儿 GC 把 manifest 当唯一真相源**：`ensureChatHistoryBootstrap` 末尾会 `scheduleOrphanChatGc()`，
   而 `gcOrphanedChatKeys()` 会删除所有不在 manifest 里的 `chat-session:*`。于是覆盖发生后，
   其余会话的正文被**不可逆删除**。
   - 追加隐患：`readManifest()` 返回 null 时旧代码把 keep 集合当空集合，等于一次删光；
   - 追加隐患：存活会话正文读不出来时，它引用的附件会被当成孤儿删掉。
3. 触发时机：开发期我一边改文件一边让用户的页面热重载，重载后的**未水合窗口**（几十到几百毫秒）里
   用户正在连点「新建对话」——这条链路在此之前一直没有守卫，我这一轮的工作把命中概率抬高了。

## 修复（4 处守卫）

| 位置 | 变化 |
|---|---|
| `lib/stores/chatHistory.ts` | 新增 `persistManifest(state, manifest)`：**未水合一律不落盘**；12 个落盘点全部改走它 |
| 同上 `startNewChat` | 未水合时不新建、不落盘，返回 null，等 `ensureChatHistoryBootstrap()` 完成后再按当时的真实列表执行（失败则什么都不做） |
| `lib/sync/engine.ts` | `applyChatPayloadToZustand` / `forgetLocalSessionInZustand` 先 `await ensureChatHistoryBootstrap()` 再合并，未水合不写 |
| `lib/storage/chatStorage.ts` GC | ①读不到 manifest → **一个都不删**；②本轮孤儿数 > 3 → **整轮放弃**（宁留孤儿键）；③存活会话正文读不出来 → **不动任何附件** |

## 验证

`npx tsc --noEmit` exit 0；`npx eslint .` 0 error；`pnpm run test:unit` 1325 通过（新增 5 例：未水合不落盘、未水合 startNewChat 不新建不落盘、GC 无 manifest 不删、孤儿过多整轮放弃、keep 正文读不出不删附件）；
`pnpm run test:react` 144 文件 / 552 通过。

## 数据恢复

本地正文已被删除，原始 LevelDB 字节里只剩极少量残留（不足还原）。**唯一可用的恢复路径是云端**：
`chat-session` 的删除没有推 tombstone（GC 直接删键、不走 `scheduleCloudTombstone`），
所以云端行仍在；登录状态下刷新页面会触发 `scheduleCloudPull()` → `pullFromCloud()` →
本地查不到该会话 → `applySession(remote)` 把它整条写回来。

---

# 附十一：Agent 全屏键归位（顶栏 · 面板开关左侧 · 四角图标）

## 用户口径

> 我这个全屏按钮（截图里悬浮在第一条消息上方、带「全屏」提示的那个）是**错的**；应该在**中间对话顶部**，
> 就是那个控制面板/导航栏的按钮**左侧**；图标要和右侧的**完全不同**（要四个边框的那种）。

## 现象与根因

附七补记把「网页全屏（Fullscreen API）」做成了中间对话面板里的**悬浮键**（`absolute right-3 top-3`），于是：

- **位置错**：实测 1440×900，悬浮键在 `x 863..895 / y 60..92`，而顶栏的「右侧工作区开关」（`PanelRightOpen`）在
  `x 863..895 / y 8..40`——两键同列、上下差 52px；悬浮键正好压住对话正文第一行（正文从 `y=48` 起），
  看起来像个走错门的内容区控件。
- **图标重样**：悬浮键用 `Maximize2`（对角箭头），与右栏「面板全屏」（`RightPanel`）**一模一样**——
  屏幕上两个「全屏」长同一个样子，谁也说不清哪个是全屏网页、哪个是全屏面板。

## 改法

| 位置 | 变化 |
|---|---|
| `components/layout/AppShell.tsx`（TopBar） | 网页全屏键从「仅 Studio」改为**两模式共用**；Agent 里排在右侧工作区开关**之前**（= 它的左侧）：`[⛶ 全屏][▷\| 右侧工作区]`。补 `aria-label` / `aria-pressed` / `data-testid="browser-fullscreen"` |
| 图标 | 顶栏全屏 = 四角 `Maximize` / `Minimize`（SVG `M8 3H5…`）；右栏面板全屏保留对角 `Maximize2` / `Minimize2`（`M15 3h6v6…`）。两条路径不同，肉眼与代码都可区分 |
| `components/layout/AgentWorkspace.tsx` | 删掉悬浮键与 `useBrowserFullscreen` 依赖——对话面板里**不再有任何覆盖正文的按钮** |
| Agent 顶栏不吃 Studio 的收起态 | React 侧 `barCollapsed = !agentMode && topBarCollapsed`；首帧 CSS 侧 `globals.css` 改成 `html[data-topbar-collapsed="true"] header[data-topbar]:not([data-agent-bar])`，header 带 `data-agent-bar` |

最后一条是这次顺手补的坑：Agent 顶栏是**控件条**（全屏 + 右侧工作区开关都挂在上面），它自己根本没有「收起顶栏」入口。
而从 Studio 收着顶栏切到 Agent 时，那个会落盘的收起态会把 `h-0` 套上去，两个键一起消失（除了 Esc 没有别的退路）。

## 实测（1440×900，真实浏览器）

| 检查 | 结果 |
|---|---|
| 全屏键位置 | `x 827..859 / y 8..40`；工作区开关 `x 863..895` —— 同一行、间隙 4px、紧挨其左 ✅ |
| 不再压正文 | 对话面板上沿 60px 内的 `button` 数为 **0** ✅ |
| 真全屏 | 点击 → `document.fullscreenElement` 非空、aria-label 变「退出全屏」、键仍可见；再点退出 ✅ |
| 收起右侧工作区后 | 全屏键仍在（`x 1359`，开关 `1395`）✅ |
| Studio 不受影响 | 顶栏全屏键照旧（`x 1396`）、无面板开关；Studio 收着顶栏切 Agent → 顶栏高 48、两键都在 ✅ |
| 旧悬浮键 | `agent-chat-fullscreen` 全仓已无引用 ✅ |

浏览器回归 `flow14.py`：11/11 全过。截图 `99-agent-fullscreen-in-topbar.png`、`A2-agent-light-topright.png`。

## 质量门

`npx tsc --noEmit` 0；`npx eslint .` 0 error / 91 warning（基线）；`pnpm run test:unit` **1326**；
`pnpm run test:react` **144 文件 / 553 通过**。新增 2 例：
`AgentWorkspace.test`（面板里不再有悬浮全屏键）、`appModeChrome.test`（顶栏顺序 + 图标区分 + 首帧 CSS 排除 + 控件条不被收起态吃掉）。

## 运维备注（这次踩到的）

改了 `app/globals.css` 之后，**dev server 可能继续发旧 CSS**（chunk 名不变、内容还是旧的，重启也不一定刷）。
判断方法：直接拉一次 `/_next/static/chunks/*.css` 搜新选择器。它按**内容**失效，所以 `touch` 改 mtime 没用；
再落一次真实内容改动就会重编（本次即如此）。
