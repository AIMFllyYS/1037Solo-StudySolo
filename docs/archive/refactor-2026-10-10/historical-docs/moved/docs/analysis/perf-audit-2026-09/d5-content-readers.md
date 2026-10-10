# D5 内容页 · 文档阅读器 · 交互组件

> 范围：`[subject]/[category]/[id]` 内容页、PDF/DOCX/PPTX 阅读器、Quiz、笔记编辑器、interactives、全局内容数据加载。

## 板块总结

- 内容页主链「构建期 SSG + 服务端 `NoteRendererServer` 预渲染」设计正确——客户端不重复解析正文 Markdown，代价在构建期与页面负载体积。
- **最大风险在文档阅读器内存模型**：PDF/PPTX「全量占位 + 懒挂载 + 永不卸载」，已渲染页/幻灯片的 canvas、text layer、重 DOM 随浏览单调增长——长文档内存崩溃与滚动掉帧路径。
- PPTX 容器宽度每变 ≥8px（120ms 防抖后）即**整包重新 fetch + 解析 + 重建全部槽位**，分栏拖拽/右栏展开期间反复全量解析。
- Quiz 评分页一次性渲染全部题目 × 每题 6-12 个独立 ReactMarkdown（remark-gfm+math+directive + rehype-katex+highlight）实例——交卷瞬间主线程阻塞可达秒级。
- 笔记 split 模式每按键触发「Crepe 序列化 → store 更新 → 全文 TOC 扫描 → 完整 Markdown/KaTeX 预览重渲染」四连。
- 多处「看似虚拟化」实为「懒挂载不卸载」：`LazyVisible` 挂上永不摘；真虚拟化仅 `ChatThread`/`BillingDashboard` 两处；CSV/XLSX 行窗口化只在计划文档。

## 发现清单

### [P0-1] PDF 已渲染页永不卸载：canvas 位图随页数线性累积 — `PdfDocumentPane.tsx:223-252`、`PdfPageCanvas.tsx:80-91`（主代理复核 + 与 D7-P0-1 同根）

- **机制**：`IntersectionObserver` 命中即 `mountedPages.add(pageNumber)`（`:236-246`），**无移除分支**（`:223` 注释明示「挂上就不再摘」）；无 IO 环境退化为 `mountAll` 全量挂载。每挂载页 = `viewport.width × min(dpr,3)` 位图 canvas + 完整 text layer DOM。
- **量化**：单页位图 ≈ 宽×(宽×1.41)×dpr²×4B——dpr1 ≈ 3.6MB/页、dpr2 ≈ **14.5MB/页**、dpr3 ≈ 32.5MB/页。200 页滚到底：dpr2 ≈ **2.9GB** 常驻位图 + text layer DOM；zoom 变化触发**全部已挂载页**按新尺寸重渲（`:388-396`），峰值再翻倍。`MAX_CONCURRENT_RENDERS=3`（`:89`）只限并发不限驻留。
- **方向**：`mountedPages` 改有界 LRU（保留最近 ~15-20 页 canvas，远页回退占位 `is-placeholder`，`pageSizes` 缓存已使回流可控）；或对远页 `canvas.width/height=1×1` 释放位图保 DOM；text layer 随页回收。
- **验证**：Performance/Memory 录制 200 页滚动；`HTMLCanvasElement` 计数与 GPU 内存；`measureUserAgentSpecificMemory()` 前后对比。

### [P0-2] Quiz 交卷瞬间全量实例化所有题目 × 多 Markdown 管线 — `QuizScoring.tsx:123-149`、`QuizQuestion.tsx:181,228,345,357,370`、`QuizMarkdownBase.tsx:69-92`

- **机制**：`phase==='scoring'` 时 `results.map()` 同步渲染全部 `QuizQuestion`（无窗口化/分页）；每题 review 模式下为 stem、每选项、hint、参考答案、每条 scoring_criteria、explanation 各起一个 `QuizMarkdown`（独立 unified 管线实例）。
- **量化**：50 题 × 平均 ~8 个 markdown 实例 ≈ **400 个 ReactMarkdown 同步初始化**，每实例含 remark×3+rehype×2+katex——主线程阻塞估算秒级（与 D2-P0-1 同一管线成本模型）。
- **方向**：评分页分屏/分页渲染（首屏题+IntersectionObserver 逐步）；或 scoring 复用单 processor + 分段 memo；最少给 `results.map` 外层加 startTransition+骨架。
- **验证**：50 题交卷的 commit 时长与 Long Task 计数。

### [P1-3] PPTX 宽度 ≥8px 变化即整包重解析 — `PptxDocumentPane.tsx`（resize 处理 + `previewer.render` 全量路径）

- **机制**：容器宽度变化（防抖 120ms）→ 重新 fetch + `pptx-preview` 全量解析 + 重建全部 slide 槽位。分栏拖拽/右栏开合 = 连续触发。
- **量化**：每次重解析 = 整包 unzip + DOM 重建（MB 级 pptx 数百 ms 起）；拖拽期间每秒最多 ~8 次。
- **方向**：resize 只改 CSS 缩放容器（transform scale 或 CSS zoom），不重新解析；仅当跨越档位阈值才重渲；或渲染后按新宽度只重排不重建。
- **验证**：拖动分栏时 Network/CPU trace 中 previewer.render 调用次数。

### [P1-4] 笔记 split 模式每按键四连成本 — `MilkdownNoteEditor.tsx` + `UserNoteEditorWindow` split 分支 + `useToc`

- **机制**：每次按键 → Crepe 全量序列化 → store set → **全文 TOC 扫描** → **完整 Markdown/KaTeX 预览重渲染**。`useToc` 已用 `requestIdleCallback` 让路（`useToc.ts:168-184`）但预览重渲染仍在。
- **量化**：长笔记（数十 KB + 公式）下可感知输入延迟；KaTeX 公式多的笔记每键数百 ms。
- **方向**：预览端分块 memo（同 D2-P0-1 的分段渲染方案可复用）；TOC 扫描增量（仅变更段）；输入与预览解耦（预览 rAF/idle 合帧）。
- **验证**：长笔记连续打字的 input latency trace。

### [P1-5] `LazyVisible` 挂载后永不卸载——假虚拟化普遍 — `components/ui/LazyVisible.tsx` + 例题/交互/附件预览各使用点

- **机制**：IO 命中后 children 常驻（设计上为避免重渲染/保状态），但与 PDF 同构的「只增不减」心智遍布：例题列表、InteractiveTab 组件、附件预览。
- **影响**：长内容页浏览越深 DOM/组件树越大；多数组件代价远低于 PDF canvas（P1 而非 P0）。
- **方向**：统一「有界驻留」抽象（LRU mount set 或可配置 maxMounted）；与 D1 会话窗口化的区间模型共用思路。
- **验证**：长章节滚到底的 DOM 节点数/heap。

### [P1-6] `lib/stores/ui.ts` 静态吃 contentTree + nav/lectures JSON — 见 D4-P1-2（跨板块同根）

### [P2-7] Review 跳卡菜单一次建全部按钮 — `app/[subject]/review/page.tsx:416-441`

- `Array.from({length:count})` 建按钮，500 卡 = 500 按钮，仅菜单打开瞬间、有界。→ `useVirtualizer` 或分页网格。

### [P2-8] 附件水合/导出串行 — `chatStorage.ts:362-402`、`hydrateForRequest.ts:12-22` — 见 D1-P1-6

### [P2-9] `componentRegistry` 空壳死路径 — `lib/content/componentRegistry.tsx:5-40`

- `registry={}` 无任何注册方，`renderType==='component'` 恒显示未注册——非性能问题，列此防止误读文档。

### [P2-10] CSV/XLSX 行窗口化未落地 — 全库无表格阅读器；`useVirtualizer` 仅 `ChatThread.tsx:141`、`BillingDashboard.tsx:192` 两处

- 附件表格无专门阅读器，暂无现存问题；与 `remaining-document-formats-2026-09-20.md:284` 计划声明不符，落地时直接复用 `useVirtualizer`。

## 已确认做对（勿回归）

- `AnimatedCollapse` 收起后卸载 children（`:42-44,109-123`）。
- `useToc` requestIdleCallback + IO 跟踪（`:168-184`）。
- `FileTreeItem` hover/focus 120ms 延迟 + 会话级 Set 去重 prefetch（`:24-65`）。
- 讲稿 397KB 按需 import（`VideoTab.tsx:44-49`）。
- PDF 渲染并发闸=3（`:88-89`）、单页失败兜底（`PdfPageCanvas.tsx:118-124`）、worker/CMap/标准字体已配置（`:144-149`）。
- `rehype-highlight` 关自动检测+白名单（`plugins.ts:37-52`）。
- 全局正文搜索服务端分片+客户端分片并发+abort（`useProgressiveGlobalSearch.ts`+`bodySearch.ts`），非主线程全库扫。
- Milkdown 重编辑器仅最前可见窗口挂载（`UserNoteEditorWindow.tsx:64` `shouldMountHeavyEditor`），后台窗降级 `NotePreviewPane`。
- `ChatThread` 真虚拟化（`useVirtualizer`+overscan）。

## 未测项

- PDF/DOCX/PPTX 100/300/500 页真实 heap 与帧耗；Quiz 评分页 commit 时长；笔记 split 输入延迟；SSG 全量构建耗时。
