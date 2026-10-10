# D7 内存 · 资源生命周期 · CSS

> 范围：blob/object URL 生命周期、observer/timer 清理、图片链路、content-visibility/contain、长会话内存画像、合成层。

## 板块总结

资源生命周期管理**整体明显好于一般水平**：composer 图片附件 `createObjectURL`/`revokeObjectURL` 配对完整、PDF `pdf.destroy()` 与 PPTX `previewer.destroy()` 在卸载/换源路径调用、绝大多数 observer/timer/listener 对称 cleanup、`MAX_SESSIONS=50`+`MAX_LOADED_SESSIONS=3` 硬上限、persist 800ms 防抖+惰性 stringify+`pagehide`/`visibilitychange` 兜底 flush。

**但存在 2 个 P0**：PDF 已渲染页永不卸载（canvas 位图无界累积，与 D5-P0-1 同根）；`local-file`/`document` 两类附件的 object URL 在**所有清理路径被结构性跳过**——确定性泄漏。另有 6 个 P1：imageGen 全量 base64 持久化+每次全量 stringify、Agent dock 隐藏窗口全量挂载、多个大 store 全量序列化写放大、历史附件缩略图无缓存无懒加载、Agent 图片页签全量 dataURL 挂载、100MB 本地文件多副本驻留。CSS 侧 `content-visibility` 使用克制且未与 virtualizer 冲突；`.content-auto` 是死 CSS；backdrop-filter 挂载点偏多但未见主路径卡顿证据（P2）。

## 发现清单

### [P0-1] PDF 已渲染页永不卸载 — `PdfDocumentPane.tsx:223-252`、`PdfPageCanvas.tsx:80-91`

同 D5-P0-1（复核一致）：`mountedPages` 只增不减，dpr2 下 ~14.5MB/页，200 页 ≈ 2.9GB 常驻位图，zoom 变化全体重渲峰值翻倍。**窗口生命周期内无界增长 = 等效泄漏**，Electron 长会话是真实 OOM 路径。方向：有界 LRU / 远页位图释放（canvas 置 1×1 保 DOM）。

### [P0-2] `local-file`/`document` 附件 object URL 被所有清理路径结构性跳过 — `imageUtils.ts:229-230,196-201,376-382`、`useImageAttachments.ts:133-148`、`WindowTaskbar.tsx:142-152`

- **机制**：`fileToLocalPreviewAttachment`（PDF/PPT/PPTX）优先 `URL.createObjectURL(file)` 存进 `dataUrl`；`fileToDocumentAttachment`（DOCX）建 `previewUrl = createObjectURL`。但这些 URL 进了**持久化消息体/附件 ref**，清理路径（卸载/移除附件/会话删除/`clearAttachments`）只 revoke composer 图片那类 object URL——`local-file`/`document` 两类在所有路径被结构性跳过。
- **影响**：确定性泄漏——blob URL 引用的 File/blob 无法 GC，整文件驻留浏览器 blob 存储直至会话结束（`chrome://blob-internals` 可验）。PDF/PPTX 附件动辄数十-100MB。
- **方向**：把 object URL 视为借据——附件 ref 存「可重建的源」（File 引用或 IDB blob），渲染时按需 `createObjectURL` + 使用方卸载即 revoke；或统一 revoke 清单挂到附件 ref 上随清理路径走。
- **验证**：`chrome://blob-internals` 计数；发送/删除附件前后 `Blob` 对象 heap snapshot。

### [P1-3] imageGen 全量 base64 持久化 + 每次写全量 stringify — image-gen store（`PERSIST_KEYS.imageGen`）

- 生成图 base64 无限积累进单 key，每次写全量 stringify（同 chat 单 blob 写放大模式）；也是 D3-P0-3 水合风暴的大头之一。
- **方向**：图片正文挪 `chat-blob:` 式独立 key（复用现有 blob 槽机制），store 只留引用+缩略图。

### [P1-4] Agent dock 隐藏窗口保持全量挂载 — `AgentQuizWindow`、`MemoryProposalCloud`、`MembershipSponsorWindow`、`BillingDashboard` 等

- 最小化时 children 仍挂载（display:none）：BillingDashboard 表格 DOM、quiz 题目数据常驻。
- **方向**：对照窗口规模逐个评估「隐藏即卸载」或降级占位；BillingDashboard 优先（表格行多）。

### [P1-5] 多个大 store 全量 JSON 序列化写放大 — billing-history（≤5万行）、documents、user-notes、artifacts 等

- 与 chat 同构的单 key 全量 stringify/parse；叠加 D3-P0-3 水合风暴与 P1-4 flush 风暴。
- **方向**：大 store 分 key/分页化（billing 按周期分），或增量 append 结构。

### [P1-6] 历史附件缩略图无缓存无懒加载 — `ImageStrip.tsx`、`NoteImageGallery.tsx` 等

- 会话历史里的图片附件重开时全量 `loadBlobDataUrl`→`img` 解码，无缩略图缓存、无视口懒加载上限。
- **方向**：缩略图派生存储 + `loading="lazy"`+视口上限（LazyVisible 已有，挂载上限见 D5-P1-5）。

### [P1-7] Agent 图片页签全量 dataURL 挂载 + 100MB 本地文件多副本驻留 — agent 资产页签、`hydrateAttachmentsForApi` 链

- 图片页签渲染全部 dataURL `<img>`（解码内存 = 宽×高×4B/张，与压缩体积无关）；大本地文件在 File 对象 + blob URL + base64 + 预览 pane 间多副本驻留。
- **方向**：页签虚拟化/分页；大文件单副本原则（只留 File 引用，预览用 object URL 随用随销，联动 P0-2 方案）。

### [P2-8~10] CSS 与小项

| 项 | 位置 | 说明 |
|---|---|---|
| `.content-auto` 死 CSS | `app/globals.css:535-538` | 定义后全仓无使用点；删除或接回列表（非性能问题但误导） |
| AgentSessionList IO 重建 | `components/agent/AgentSessionList.tsx:46-62` | `hasMore`/`sessions.length` 变化即 disconnect+重建；有界量小，记录 |
| 浮窗/ChatPanel 无数量上限 | `lib/stores/floatingChats.ts:95-205` | 每浮窗 = 完整 ChatThread+useChat+popover 订阅组；用户行为驱动、关窗清空空会话（`:187-197`）；可考虑 `MAX_FLOATING_WINDOWS` |
| backdrop-filter 挂载点 | 多处面板/弹层 | 数量偏多、未见主路径卡顿证据；合成层内存入预算表 |

## 已确认无问题（勿计入）

- composer 图片附件 URL 生命周期：`useImageAttachments.ts:87-94,133-148` 卸载/移除/清空均 revoke；`ChatInput.tsx:325-358` 发送后 `clearAttachments()`。
- PDF/PPTX 文档对象：`pdf.destroy()`（`PdfDocumentPane.tsx:131,153,176`）、`previewer.destroy()`+`observer.disconnect()`（`PptxDocumentPane.tsx:225,249,265-272`）。
- 聊天存储 GC 以 manifest 为真相源、孤儿键异常多时保护性不删；`persistInlineAttachments`（`chatStorage.ts:405-427`）保 base64 不进消息体。
- 聊天内存上限：`MAX_SESSIONS=50`（连带删 blob `:268-279`）、`MAX_LOADED_SESSIONS=3`（`:27,232-246`）。
- hooks cleanup 对称：`useDraggable`/`useResizable`/`useFullscreenTrack`/`useElementWidth`/`useStreamingText`/`useImageGenProgress`/`useToc`/`useAuthSession`/`useCitationLocator`/`useAutoHideChatHeader`/`WindowTaskbar`。
- `floatingTokenTracker` 关窗 `resetSession`（`FloatingChatWindow.tsx:97`、`QuizExplainWindow.tsx:70`，旧审计项已修）。
- `openHtmlInNewTab` 60s 有界 revoke；CSV 导出即建即销。
- virtualizer 与 CSS 无冲突：`.chat-message` 仅 `contain: style paint`（`globals.css:605-607`），未对虚拟行加 size/content-visibility。
- 流式写路径：`streamUiThrottle` 60ms + `finally` 中 `flushPendingWrites()`（`executeChatRequest.ts:82-89`）。

## 建议实测方案（实施期）

1. DevTools Memory：Allocation timeline + 双 heap snapshot，看 `HTMLCanvasElement`（P0-1）、`Blob`/`String`（P0-2、P1-3/7）、`HTMLImageElement`（P1-6/7）、`Detached*`。
2. `performance.measureUserAgentSpecificMemory()`：50 会话切换、100+ 图、连续生图、PDF/PPTX 反复开合、Inline↔PiP 切换。
3. Performance trace：`JSON.stringify` 长任务（P1-4/5）、Image Decode 次数、Recalc/Layout/Paint。
4. IDB 面板 `gailvlun-db/keyval` 逐 key 大小趋势。
5. `chrome://blob-internals` 验证 P0-2 未释放清单。
6. Layers 面板：backdrop-filter 挂载点与合成层内存。
