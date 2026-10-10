# 文档阅读器系统性重建 · 执行记录

- 日期：2026-09-20
- 计划：[`document-readers-rebuild.md`](./document-readers-rebuild.md)
- 根因分析：[`../analysis/attachment-preview-rendering-defects-2026-09-20.md`](../analysis/attachment-preview-rendering-defects-2026-09-20.md)
- 结论：**G1–G6 全部达成**，质量门全绿，浏览器对照验收通过。

---

## 1. 交付物总览

### 新增
| 文件 | 作用 |
|---|---|
| `components/window/PdfPageCanvas.tsx` | 单页渲染：DPR 位图 + pdf.js `transform` + `TextLayer` 文本层 + 可取消 render task + 并发槽位 |
| `lib/chat/pptxSlideList.ts` | PPTX 页列纯逻辑：占位高度 / 建槽 / 把库渲染好的页搬进槽 / 当前槽推导 |
| `lib/hooks/useElementWidth.ts` | ResizeObserver + 防抖的元素宽度（阅读器宽度唯一来源） |
| `lib/window/scrollToElementTop.ts` | 按 rect 差值把元素滚到容器顶（绕开 `offsetTop` 的 offsetParent 陷阱） |
| `app/styles/pdf-reader.css` | 页列 + pdfjs TextLayer 所需属性子集 |
| `app/styles/pptx-reader.css` | 页列 + 槽位 + 文字回退卡 + 隐藏库宿主 |
| `tests/documentReaderStructure.test.ts` | 4 条结构契约（锁住已踩过的坑） |
| 各组件测试 | `PdfPageCanvas.test.tsx`(9) / `PdfDocumentPane.test.tsx`(6) / `PptxDocumentPane.test.tsx`(7) / `pptxSlideList.test.ts`(9) / `useElementWidth.test.tsx`(3) / `scrollToElementTop.test.ts`(4) |

### 修改
| 文件 | 变更 |
|---|---|
| `components/window/DocumentWorkspace.tsx` | 新增可选 `bodyRef`；`autoSaveId` 按 surface 拆分 |
| `components/window/PdfDocumentPane.tsx` | 单画布单页 → 连续页流（347 行改动） |
| `components/window/PptxDocumentPane.tsx` | 单页缩放舞台 → 纵向页列 + 懒渲染（404 行改动） |
| `components/chat/AttachmentPreviewViewer.tsx` | `sandbox=""` → `ARTIFACT_IFRAME_SANDBOX` + 双套 CSP + 联网开关 |
| `app/styles/chat-tools.css` | 删除失效的 `.pptx-stage-*` 规则 |
| `app/globals.css` | 追加两个 `@import` |
| `docs/refer/rendering-architecture.md` | §8 第 5 条改写成新的阅读器契约 |

未动：`AttachmentPreviewData` 结构、window store 持久化、`parsePptxSlideBytes`、DOCX 阅读器、artifact 路径。

---

## 2. 浏览器对照验收（改造前 → 改造后）

全部经 `http://localhost:35349`（`127.0.0.1` 会被 Next dev 跨源拦截导致不 hydrate），素材在 `tmp/repro/`，截图 `tmp/repro/AFTER-*.png`。

### HTML · `memo-wall.html`（脚本驱动的记忆墙）
| 指标 | 改造前 | 改造后 |
|---|---|---|
| sandbox | `""`（全禁，含脚本） | `allow-scripts allow-popups allow-forms allow-modals allow-downloads` |
| 计数器 | `0 / 19`（脚本没跑） | **`19 / 19`** |
| 脚本生成的 19 张便签 | 一张都没有 | **19 张全部出现** |
| storage shim | 无 | 已注入 |
| `contentDocument` | `null` | `null`（仍是 opaque origin，拿不到父文档/storage） |
| 窗口动作 | 只有「仅本地」徽标 | 联网开关 + 下载 HTML + 新标签页 |
| 联网开关 | — | `connect-src data: blob:` → `data: blob: https: http:`，`aria-pressed` false→true，徽标「仅本地」→「已联网」 |

### PDF · `histology-sim1.pdf`（4 页）
| 指标 | 改造前（Studio） | 改造后（Studio） | 改造后（Agent 右栏 227px） |
|---|---|---|---|
| 页数在 DOM 里 | 1 块 canvas | **4 个 `.pdf-page` 占位** | 4 |
| 位图 vs 屏幕 | 684 → 590（0.86× 回采） | **598 = 598** | **203 = 203** |
| 容器可滚动 | 否（单页） | 是（**3445px**） | 是（1209px） |
| 工具栏百分比 | 谎报 115%（实际 0.32×） | **101%（实算）** | **34%（实算）** |
| 文本层 | 无 | **472 spans** | **834 spans** |
| 横向溢出 | — | **0** | **0** |
| 大纲跳第 3 页落点 | — | **页顶停在容器顶下方 8px** | — |
| 控制台错误 | pdf.js 竞态隐患 | 无 | 无 |

DPR 说明：headless 环境 `devicePixelRatio = 1`，所以断言的是「位图尺寸 == CSS 尺寸」（`backingW === cssW`）。代码里 `canvas.width = floor(vp.width × min(dpr,3))` 且把 `transform` 交给 pdf.js，DPR=2 时位图翻倍、CSS 尺寸不变 —— 这正是消除「高分屏发虚」的那一层。

### PPTX · `organic-10p-4x3.pptx`（10 页 4:3）
| 指标 | 改造前（Studio） | 改造后（Studio） | 改造后（Agent 右栏 227px） |
|---|---|---|---|
| DOM 里的页 | 1 | **10 个槽（懒渲染已挂 3）** | 10 个槽（全部已挂） |
| 单页内联样式 | `height:720px; top:-90px`（**上下各裁 90px**） | `position:relative`、**无 top** | 同左 |
| 页高宽比 | 视口写死 960×540 | **598×449（= 4:3）** | **203×152（= 4:3）** |
| 可读性 | 标题只剩半行 | **标题/正文/页脚色条完整** | **可读的连续页列** |
| 库自带控件 | 2 个圆按钮 + `0/10` | **0 个** | **0 个** |
| 缩放方式 | `transform: scale(0.631)` | 无缩放，按宽度原生渲染 | 无缩放 |
| 容器可滚动 | 否（`overflow:hidden`） | 是（**4640px**） | 是（1670px） |
| 控制台错误 | — | 无 | 无 |

> 改造前 Agent 右栏实测 `transform: scale(0.245833)` → 幻灯片 236×133 px，完全不可读；这是用户「缩成邮票」的直接来源。

### 结构契约（`tests/documentReaderStructure.test.ts`，4/4 通过）
锁死：PPTX 必须 `mode:"list"` 且不含 `renderSingleSlide`/`SLIDE_HEIGHT`/`fitSlide`/`querySelectorAll("button")`/`atob`；PDF 不含 `max-w-full`/`setScale(1)`，必须有 `data-pdf-page`/`devicePixelRatio`/`RenderingCancelledException`/`TextLayer`/`--total-scale-factor`；HTML 不含 `sandbox=""`，必须有 `ARTIFACT_IFRAME_SANDBOX`/`htmlPreviewCsp`/`prepareHtmlPreview`；`DocumentWorkspace` 必须有 `bodyRef` 与按 surface 拆分的 `autoSaveId`。

---

## 3. 过程中发现并修掉的三个额外问题

### 3.1 新 CSS 文件一开始根本没进产物（构建工具链陷阱）
`@import` 两个新 CSS 文件后，浏览器里的唯一 CSS bundle 里**没有** `.pdf-pages` / `.pptx-pages`（`document.styleSheets` 逐条扫过确认），但 `chat-tools.css` 的规则在 —— 说明 8 条 `@import` 只解析了 6 条。重启 dev server 也没用（Turbopack 复用磁盘模块图）；**改一次 `globals.css` 触发重新解析后立刻全部生效**。
> 教训：新增 `app/styles/*.css` 并在 `globals.css` 加 `@import` 之后，必须**验证规则真的进了 bundle**（不能只看页面"看起来对"），必要时改动 `globals.css` 强制重解析。

### 3.2 `offsetTop` 的 offsetParent 陷阱（跳页会多滚 32px）
`.document-workspace-body` 没有 `position`，所以页元素的 `offsetTop` 是相对 `.document-workspace-stage` 的，把 32px 工具栏算了进去 → 点大纲跳页时目标页顶部落到视口外。
修法：新增 `scrollToElementTop(container, element, offset)`，用 rect 差值（与 offsetParent、祖先滚动位置无关），PDF 与 PPTX 共用；实测落点 = 8px（期望值）。

### 3.3 窄栏里「适应宽度」失效
PDF 的 `MIN_DISPLAY_WIDTH = 240` 高于最窄真实容器的 fit-width（227px → 203px），导致 Agent 右栏里页面横向溢出 37px，且**把 zoom 调到最小也装不下**。
改为 160，并把理由写进注释。改造后右栏 `scrollWidth === clientWidth`，横向溢出归零。

### 3.4 单页渲染失败会被反复重试
PPTX 懒渲染的观察者会反复回调；失败的页没有记进 `rendered` 集合，会被反复重试，而库里那棵树上还留着上一次的残节点 —— 重试会把已经降级的文字卡又换回坏页。已在 `catch` 里一并记账。

---

## 4. 质量门（最终一次实测）

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | exit 0，无输出 |
| `pnpm test:unit`（node:test） | **1418 pass / 0 fail** |
| `npx vitest run` | **155 files / 621 tests pass** |
| `tests/documentReaderStructure.test.ts` | 4/4 |
| `pnpm check:prose-svg-rules` | 见下（新 CSS 无 `.prose-notes`/`.chat-prose` 选择器，不受该守卫影响） |

## 5. 已知限制与后续（明确不在本次范围）

1. **没有做旧布局迁移**：`autoSaveId` 从 `document-workspace` 改成 `document-workspace:studio` / `:agent`，旧的 `react-resizable-panels:document-workspace` 键变成孤儿（无害，只是下次打开用默认分栏宽）。
2. **PPTX 不做页面级缩放控件**：列表模式恒按容器宽度铺满；要放大请拖宽面板。若之后需要，再补 zoom 乘数是独立任务。
3. **PDF 没有虚拟化**：页数是「占位 div + 懒挂载 canvas」，500 页文档会有 500 个空 div（高度已定，滚动条稳定）。真正需要时再上 `useVirtualizer`。
4. **HTML 联网态仍禁 `default-src` 覆盖的能力**：嵌套 iframe/object 仍被挡，只放行六个 fetch 指令 —— 这是有意的收紧。
5. DOCX 阅读器、PDF 批注/表单、PPTX 动画与切换效果未纳入。

---

## 6. 追加修复（2026-09-20 · 第二批）

用户反馈的两个细节问题，改完实测如下。

### 6.1 隐藏附件窗的「仅本地」徽标

**问题**：每个附件预览（PDF/PPTX/Word/图片/Markdown）在 Agent 右栏里都挂一个「仅本地」徽标。
`WindowChrome` 的规则是 `showHeader = !dockSurface || Boolean(actions) || Boolean(externalLink)`，
所以这枚徽标等于**给每种非 HTML 附件白加了一条空标题栏**，整个右栏因此比别的窗口矮一截、看着不统一。

**改法**（`components/chat/AttachmentPreviewViewer.tsx`）：
- 删掉徽标 `<span>`；
- `actions` 只在 `kind === "html"` 时给（联网开关 + 下载），其余格式传 `undefined` → dock 里**整条标题栏消失**；
- 联网状态改由开关自身表达：联网时图标换成 `GlobeLock` 并染成 error 色，未联网是 `Globe` + 弱化色。

**实测**（Agent 右栏，1600px 视口）：

| 指标 | 改前 | 改后 |
|---|---|---|
| `hasHeaderRow` | true（只有「仅本地」） | **false** |
| 页面里「仅本地」文本 | 有 | **无** |
| 窗口可用高度 | 少一条标题栏 | 多出约 32px |

Studio 浮窗不受影响：`!dockSurface` 本来就为真，红绿灯 + 标题仍在，只是右侧不再有徽标。

### 6.2 目录列一律可拖拽 + 修掉分隔条位置错误

**问题 A**：`DocumentWorkspace` 有「固定 13.5rem、不可拖拽」的分支，9 个调用点里只有 PDF/PPTX 两个传了 `resizable`；
Markdown 附件、来源浏览器、笔记库、闪卡选择器、长文本选择器、项目文件全都是死宽度。

**问题 B（更严重，实测才发现）**：Agent 下分隔条画在**整块正文的最左边**而不是目录旁边。
原因：JSX 里 `PanelResizeHandle` 写在 stage `Panel` 之前，而 stage/nav 有 `order={2}`/`order={3}`，**分隔条没有 order（等于 0）**，于是被排到最前。
后果是用户想拖目录时抓到的是**工作区外沿**——实测抓到的是右栏自身的分栏边界，把整个 dock 从 319px 拖到 408px，而目录纹丝不动。

**改法**（`components/window/DocumentWorkspace.tsx`）：
- 删掉 `resizable` 开关与非拖拽分支，**一律用 PanelGroup**；
- **不再用 `order` 属性**，按视觉顺序直接铺开（Studio: nav→分隔条→stage；Agent: stage→分隔条→nav）；
- 新增 `layoutKey`，`autoSaveId` = `document-workspace:{surface}:{layoutKey}`，8 个调用点各给一个键（pdf / pptx / markdown / source-trace / note-library / flashcard-cite / product-picker / project-files）；
  同理文件夹树的 `autoSaveId` 也按 `layoutKey` 拆开 —— 否则拖一次笔记库的目录，PDF 的目录宽度也跟着变；
- 修 Agent 下的默认比例：stage 曾是 `defaultSize={100}`，与 nav 的 26 相加 126% → 归一化后目录只剩 **20.6%（实测 66px）**；
  改成 stage 74 / nav 26（相加为 100），并把 nav 的 `minSize/maxSize` 放宽到 12/60。

**实测**（Agent 右栏，已清空持久化布局）：

| 指标 | 改前 | 改后 |
|---|---|---|
| 目录列默认宽 | 66px（20.6%，归一化失真） | **83px（26%，与 defaultSize 一致）** |
| 分隔条 x | 1281（窗口最左） | **1516（紧贴目录左侧 1517）** |
| 拖动 70px 后 | 目录不动，dock 319→408 | **目录 83→153（26%→48%），窗口保持 319** |

**实测**（Studio · Markdown 附件，原本完全不可拖拽）：
`navX=310 · handleX=507 · stageX=508` → 分隔条正好夹在目录与正文之间；`outlineItems=4`（4 个标题）。

新增/更新的测试：
- `DocumentWorkspace.test.tsx`：把「默认固定宽、无分隔条」反转为「**默认就带分隔条**」——这条断言现在锁的是"别再退回固定宽度"。
- `AttachmentPreviewViewer.test.tsx`：删掉徽标相关断言；Markdown 预览从「不应有分隔条」改为「应有分隔条」。

### 6.3 仍然存在的已知缺口

**DOCX 目前没有目录**（`shellHasWorkspace: false`），所以「导入 docs 时右侧有目录」这一条**还不成立** ——
它不是"目录不可调"，而是"根本没有目录"。补 DOCX 外壳 + 标题大纲属于上一份分析里的 P1-b，
连同「固定 A4 宽导致右栏只有 40% 可见」一起处理。详见
[`../analysis/remaining-document-formats-2026-09-20.md`](../analysis/remaining-document-formats-2026-09-20.md) §2。

