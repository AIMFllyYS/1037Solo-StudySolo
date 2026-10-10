# 文档阅读器系统性重建（HTML / PDF / PPTX）· 计划

> 状态：已批准并执行中。实施记录见 [`document-readers-rebuild.execution.md`](./document-readers-rebuild.execution.md)。
> 前置分析（根因 + 实测证据）：[`../analysis/attachment-preview-rendering-defects-2026-09-20.md`](../analysis/attachment-preview-rendering-defects-2026-09-20.md)

## 0. 目标与成功标准

| # | 成功标准（可判定） |
|---|---|
| G1 | **PPTX**：任意纵横比（16:9 / 4:3 / 3:2）的稿件，**每一页都完整可见**，无裁切；全部页在同一个滚动容器里上下排布；大纲点击 = 滚动定位；满宽渲染，无整体 `transform: scale`。 |
| G2 | **PDF**：全部页上下连续排布、滚动加载；画布按 `devicePixelRatio` 出图；工具栏百分比 = **屏幕实际占比**；可选中 / 复制 / Ctrl+F 查找。 |
| G3 | **HTML**：上传的脚本驱动页面功能完整可用；默认**不联网**（保留「仅本地」承诺），窗口上有「允许联网」开关，开启后 CDN 正常加载、徽标变为「已联网」。 |
| G4 | **两种外壳一致**：Studio 浮窗与 Agent 右栏 dock 行为一致；控制台不再出现 `Invalid layout total size` 告警。 |
| G5 | 质量门全绿：`pnpm typecheck`、`pnpm lint`、`pnpm test:unit`、`pnpm test:react`、`pnpm check:prose-svg-rules`。 |
| G6 | 用 `tmp/repro/` 素材 + `agent-browser` 完成可复现的浏览器验收，产出改造后对照截图。 |

## 1. 已确认的决策

1. **HTML 能力边界** → 允许脚本 + 默认锁网，窗口上加「允许联网」开关。
2. **PDF / PPTX 视图模型** → 连续纵向滚动为唯一默认视图。
3. **PDF 文本层** → 纳入范围。

## 2. 事实锚点

**pptx-preview 1.0.7（发行包反查）**
- `_renderWrapper` 只在传了 `options.height` 时才写 `height` 与 `overflow-y:auto`。
- `HtmlRender.renderSlide(i)`：`renderPort.height = pptx.height × (viewPort.width / pptx.width)`；`slide` 模式用 `position:absolute; top=(viewPort.height − renderPort.height)/2`（4:3 → −90px，上下被裁），`list` 模式用 `position:relative; margin:0 auto 10px`（纵向平铺）。
- 只有 `slide` 模式创建 `.pptx-preview-wrapper-next`（**div**）与 `.pptx-preview-wrapper-pagination`。
- 公开 API：`init`、`PPTXPreviewer.load()`、`PPTXPreviewer.htmlRender`、`HtmlRender.renderSlide()`、`PPTX.width/height/slides`。

**pdfjs-dist 5.5.207（legacy build）**
- `page.render({ canvas, viewport, transform })`；`page.streamTextContent()` + `TextLayer`；导出 `setLayerDimensions` / `RenderingCancelledException` / `PasswordException`。
- 文本层依赖容器上的 CSS 变量 `--total-scale-factor`。
- 本地资源：`public/pdfjs/pdf.worker.min.mjs` + `cmaps/` + `standard_fonts/`（路径不变）。

**项目内复用件**：`ARTIFACT_IFRAME_SANDBOX` / `injectOpaqueOriginStorageShim`、`downloadHtmlFile` / `openHtmlInNewTab`、`parsePptxSlideBytes`、`LazyVisible` 的 IntersectionObserver 范式。

## 3. 分工

阶段 0（共享地基，串行）→ WS-A / WS-B / WS-C 三个子智能体并行（文件归属互不重叠）→ 阶段 4 集成 + 验收。

| 工作流 | 独占文件 |
|---|---|
| 阶段 0 | `components/window/DocumentWorkspace.tsx`、`lib/hooks/useElementWidth.ts`、`app/globals.css`、`app/styles/pdf-reader.css`、`app/styles/pptx-reader.css`、`app/styles/chat-tools.css` |
| WS-A · PDF | `components/window/PdfDocumentPane.tsx`、`components/window/PdfPageCanvas.tsx`、对应测试 |
| WS-B · PPTX | `components/window/PptxDocumentPane.tsx`、`lib/chat/pptxSlideList.ts`、对应测试 |
| WS-C · HTML | `components/chat/AttachmentPreviewViewer.tsx`、对应测试 |
| 阶段 4 | `tests/documentReaderStructure.test.ts`、文档 |

## 4-7. 各阶段设计

（阶段 0–3 的逐文件设计、API 变更、边界情况、测试与验收标准，见批准版本；本节在实施完成后由执行记录补全实测结果。）

关键设计点：

- **`DocumentWorkspace`** 新增可选 `bodyRef`（透传到 `.document-workspace-body`）；`autoSaveId` 按 surface 拆分，消除 Studio/Agent 布局串台。
- **`useElementWidth(ref, debounceMs=120)`**：ResizeObserver + 防抖，首帧返回 0，调用方回退宽度兜底。
- **PDF**：单 canvas → 每页一个 `PdfPageCanvas`（IntersectionObserver 懒挂载 + 3 槽并发信号量）；画布按 `devicePixelRatio` 出图并 `transform` 给 pdf.js；`RenderTask.cancel()`；`TextLayer` + 作用域内 CSS；百分比 = `displayWidth / baseWidth` 实算。
- **PPTX**：`init(host, { width: displayWidth, mode: "list" })`（不传 height）+ `load()` + 按需 `htmlRender.renderSlide(i)` 落到槽位；三档降级（懒渲染 → `preview()` 全量 → 文字舞台）；删除 `fitSlide` / 硬编码 960×540 / `querySelectorAll("button")`；`sourceToBuffer` 去掉 `atob`。
- **HTML**：`sandbox=""` → `ARTIFACT_IFRAME_SANDBOX` + storage shim；CSP 拆成「默认锁网 / 允许联网」两套；窗口加联网开关、下载、新标签页打开。

## 8. API / 数据流变更

| 变更 | 兼容性 |
|---|---|
| `DocumentWorkspace` 新增可选 `bodyRef` | 向后兼容 |
| `DocumentWorkspace` `autoSaveId` 值变化 | 旧布局记录弃用，不迁移 |
| `lockHtmlPreviewToLocal` → `prepareHtmlPreview(html, { network })` + `htmlPreviewCsp(network)` | 仅测试引用，同步改 |
| 新增 `useElementWidth` / `pptxSlideList` / `PdfPageCanvas` | 新模块 |
| `AttachmentPreviewData` / `PptxSlideText` / window store 持久化 | 不变 |

## 9. 边界情况

PPTX 4:3 及非 16:9、100+ 页、单页渲染失败、库整体不可用、旧版 `.ppt`；PDF 加密、快速翻页、混合页面尺寸、扫描件无文本层、0 页、容器宽度 0、最小化恢复、Agent 右栏 252px 极窄；`ResizeObserver` 缺失时的降级。逐条期望行为见批准版本第 9 节。

## 10. 测试与质量门

单测：`PdfPageCanvas.test.tsx`、`PdfDocumentPane.test.tsx`、`pptxSlideList.test.ts`、`PptxDocumentPane.test.tsx`、更新 `AttachmentPreviewViewer.test.tsx`。
结构测试：`tests/documentReaderStructure.test.ts`。
质量门：`pnpm typecheck` / `lint` / `test:unit` / `test:react` / `check:prose-svg-rules`。

## 11. 浏览器验收

必须经 `http://localhost:35349`（`127.0.0.1` 会被 Next dev 跨源拦截导致不 hydrate）。用例与通过条件见批准版本第 11 节表格。

## 12. 范围外

DOCX 阅读器改造、PDF 批注/表单、PPTX 动画与切换效果、把 HTML 附件改成 ArtifactViewer 容器、阅读器偏好持久化。
