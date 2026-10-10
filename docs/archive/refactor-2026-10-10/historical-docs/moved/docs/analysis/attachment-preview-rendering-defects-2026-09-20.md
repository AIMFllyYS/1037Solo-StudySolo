# 附件预览渲染缺陷 · 系统分析（HTML / PDF / PPTX）

- 日期：2026-09-20
- 范围：`AttachmentPreviewViewer` 这一条「本地附件阅读器」链路（PDF / PPTX / HTML），以及它在 Studio 浮窗与 Agent 右栏 dock 两种外壳下的表现
- 方法：源码逐层追踪 + `pptx-preview` 发行包内部实现反查 + `pdfjs-dist` 调用面核对 + 真机（headless Chromium）复现与几何实测
- 复现素材与脚本：`tmp/repro/`（已被 `.gitignore` 的 `tmp/` 规则排除，不入库）

---

## 0. 结论速览

| # | 用户可见症状 | 本质原因 | 位置 | 严重度 |
|---|---|---|---|---|
| H1 | 上传的 HTML「只能看个壳」，计数/列表/交互全不动 | iframe `sandbox=""` 掐掉了全部脚本权限；CSP `default-src 'none'` 再补一刀 | `components/chat/AttachmentPreviewViewer.tsx:87` | P0（设计性缺陷） |
| P1 | PDF 一页一页翻，不能像正常阅读器那样顺着往下滚 | 单 `<canvas>` 单页模型，从不渲染第二页 | `components/window/PdfDocumentPane.tsx:104-122` | P0 |
| P2 | PDF 字发虚、放大没意义、右栏里糊成一团 | 三重缩放叠加：pdf.js `scale` × `max-w-full` 非整数回采 × 无 `devicePixelRatio` | 同上 `:112-117,166` | P0 |
| P3 | 缩放按钮显示的「115%」和实际大小对不上（右栏实测 32%） | 读数描述的是 pdf.js 内部 scale，不是屏幕占比；「适应宽度」写死 `setScale(1)` | `:155,159` | P1 |
| X1 | 4:3 的 PPTX **每一页上下各被切掉一大块**，标题只剩半行 | 硬编码 960×540 16:9 视口 × 库按稿件真实纵横比算 `renderPort.height`，再垂直居中 → 溢出被裁 | `components/window/PptxDocumentPane.tsx:8-9,77` + `pptx-preview` `renderSlide` | P0 |
| X2 | PPTX 一次只显示一页，要按 ‹ › 翻；「不同页面本该上下排布」做不到 | `mode: "slide"`（库另有 `mode: "list"` 会纵向平铺全部页），且外层 CSS 把滚动也锁死了 | `PptxDocumentPane.tsx:77` + `app/styles/chat-tools.css:400-402` | P0 |
| X3 | 幻灯片右下角总飘着库自带的一对圆按钮和「0/N」 | 隐藏代码查的是 `button`，库建的是 `div` | `PptxDocumentPane.tsx:87-89` | P1 |
| X4 | 右栏里 PPTX 缩成邮票（实测 0.246×，236×133 px），完全读不了 | `fitSlide` 用 `min(可用宽/960, 可用高/540)`，窄高容器必然取到极小值 | `PptxDocumentPane.tsx:25-37` | P0 |
| S1 | 同一份 PDF/PPTX 在 Studio 与 Agent 表现不一致 | 共用 `autoSaveId="document-workspace"`，但两侧 Panel 组合不同 → 布局串台并被归一化 | `components/window/DocumentWorkspace.tsx:209` | P1 |

**一句话本质**：这三个渲染器都建立在同一个隐含假设上——「一个文档 = 一张固定尺寸的图，塞进盒子里等比缩放到装得下为止」。
HTML 是「一张不动的图」（脚本被掐），PDF 是「一次只画一页图」，PPTX 是「按 16:9 画一页图」。
真实文档是「一串不同尺寸的页，宽度优先、纵向流动、可滚动」。这个假设不成立的地方，就是上面全部缺陷。

---

## 1. 架构地图：先分清楚有哪几条路径

`docs/refer/rendering-architecture.md` §8 已经列了四条 HTML 路径。把「文件从哪来」也叠上去之后，本次涉及的其实是：

| 入口 | 容器 | iframe sandbox | 脚本 |
|---|---|---|---|
| 加号菜单 → 文件 → `.html` | `AttachmentPreviewViewer` | `sandbox=""` | **全禁** |
| `renderInteractive` 工具产物 | `ArtifactViewer` | `ARTIFACT_IFRAME_SANDBOX` | 允许 |
| `drawDiagram` html 模式 / `::canvas` | `HtmlRenderer` | `CANVAS_HTML_IFRAME_SANDBOX` | 允许 |
| 内容页 `renderType='html'` | `ContentPageClient` | 另一套 | 允许 |

PDF / PPTX / DOCX / MD 只有一条：`AttachmentPreviewViewer` → `PdfDocumentPane` / `PptxDocumentPane` / `DocxDocumentPane` / `MarkdownPreviewPane`。

外壳由 `lib/window/presentation.ts` 决定：

```
resolveManagedWindowPresentation({ agent, mobile, dockHostAvailable })
  !agent          → "floating"   // Studio：fixed 定位浮窗
  mobile          → "sheet"      // 手机：右侧整屏抽屉
  dockHostAvailable → "dock"     // Agent：portal 进右栏 contentHost，width/height 100%
```

**关键结论：渲染器本身与外壳完全解耦**，Studio 和 Agent 跑的是同一个 `PdfDocumentPane` / `PptxDocumentPane` / 同一个 `sandbox=""` 的 iframe。
所以「Studio 下能不能正常渲染」的答案是：**能渲染，但和 Agent 一样坏，只是格子大一点、坏得没那么难看**。差异全部来自几何——
浮窗是 420–820 × 360–680（`lib/chat/openAttachmentPreview.ts:39-40`），dock 是右栏宽 × 满高（默认视口 31%，实测 1600px 视口下 319.8px）。
几何越小，下面每一个缺陷都被放大一次。

---

## 2. HTML：能力被沙箱掐死（P0，且是「有意为之」）

### 2.1 现象

上传一份由脚本驱动的 HTML（本次构造的 `memo-wall.html` 与用户截图里的 memory-wall 同构：计数 `0 / 19` + 19 张脚本生成的便利贴），得到：

- 计数器永远停在静态初值 `0 / 19`，脚本本该改成 `19 / 19`
- 只有 HTML 里静态写死的那两张便利贴出现，脚本生成的 19 张全无
- 整面墙以下是一片空白

### 2.2 机制

```tsx
// components/chat/AttachmentPreviewViewer.tsx
const LOCAL_PREVIEW_CSP =
  "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; " +
  "font-src data:; form-action 'none'; base-uri 'none'";        // L17

export function lockHtmlPreviewToLocal(html: string): string { ... }   // L20-33：把 CSP 塞进 <head>

<iframe srcDoc={localHtml} sandbox="" title={data.name}
        className="h-full w-full border-0 bg-white" />          // L87
```

`sandbox=""`（空值）等于**开启全部限制**：

| 缺失的 token | 后果 |
|---|---|
| `allow-scripts` | 脚本不执行 —— 这就是「功能全没了」的直接原因 |
| `allow-same-origin` | 进入 opaque origin，`localStorage`/`sessionStorage` 访问抛 SecurityError |
| `allow-forms` / `allow-modals` / `allow-popups` / `allow-downloads` | 任何交互式出口都没有 |

叠加上面的 CSP，即使把 `allow-scripts` 加回来：`default-src 'none'` 仍然禁掉 `script-src` / `connect-src`，
外链 CSS、字体、图片（非 data:/blob:）也全被挡；`style-src` 只有 `'unsafe-inline'`。
所以这是**双重锁**：sandbox 锁执行，CSP 锁资源。

### 2.3 实测证据

同一次会话里，用**完全相同的 srcdoc**挂两个对照 iframe：

```
sandbox=""                             → contentDocument 不可访问（TypeError），便签数 -1，计数 "n/a"
sandbox="allow-scripts allow-same-origin" → 便签数 20（19 脚本 + 1 静态），计数 "19 / 19"
```

截图 `tmp/repro/R-html-counterfactual.png` 同时拍到了两半：右上角是 App 里的预览（`0 / 19`、两张静态便签），
左下角红框是对照 iframe（`19 / 19`、便签铺满）。**同一份 HTML，唯一变量是 sandbox。**

App 内实测：`iframe.getAttribute("sandbox") === ""`、`iframe.contentDocument === null`（opaque origin）、
`iframe.contentWindow.document` 抛 `SecurityError`、`srcdoc` 里确实注入了 `Content-Security-Policy`。

### 2.4 这不是手滑，是写进测试的「设计」

```ts
// components/chat/AttachmentPreviewViewer.test.tsx:24
it("renders uploaded HTML in an offline, script-disabled iframe", () => {
  ...
  expect(frame).toHaveAttribute("sandbox", "");          // ← 明确断言
  expect(frame.getAttribute("srcdoc")).toContain("default-src 'none'");
```

对照 `lib/sandbox/opaqueOriginStorageShim.ts`：那里定义了 `ARTIFACT_IFRAME_SANDBOX`（含 `allow-scripts`）
和一段把 localStorage/sessionStorage 换成内存 Map 的 shim，供 `ArtifactViewer` 与 `HtmlRenderer` 用（`ArtifactViewer.tsx:52-57`、`HtmlRenderer.tsx:45-51`）。
**同一份 HTML 能力，代码库里已经被解决过一次了**，只是没接到附件阅读器这条路上。

### 2.5 本质：「按入口定义能力」而不是「按文件类型定义能力」

用户在加号菜单里传一个 `.html`，得到的是一个**死页**；
AI 生成一个 `.html`，得到的是可交互演示。
两者在 UI 上几乎无法区分——`WindowTaskbar.tsx:140` 还会给文件重命名：

```ts
const name = kind === "html" ? `HTML · ${originalName}` : originalName;   // → 窗口标题 "HTML · memory-wall.html"
```

于是用户看到的标签写着「HTML · xxx」，以为是自己熟悉的那个演示容器，实际拿到的是静态快照。
而且这个附件窗**没有任何补救入口**：`actions` 里只有一个 `🛡 仅本地` 徽标，没有下载、没有新标签页打开、没有重新加载
（`ArtifactViewer` 这三样都有：`ArtifactViewer.tsx:37-48`）。用户既跑不起来，也导不出去。

---

## 3. PDF：单画布 + 三重缩放

### 3.1 单页模型 —— 没有「纵向流」这回事

```tsx
// PdfDocumentPane.tsx
const canvasRef = useRef<HTMLCanvasElement | null>(null);   // 只有一个 canvas
...
const pdfPage = await pdf.getPage(page);                    // 只取当前页
...
<canvas ref={canvasRef} className="document-workspace-paper max-w-full" />   // L166
```

document 里**永远只有 1 个 canvas**（Studio、Agent 实测都是 `document.querySelectorAll('canvas').length === 1`，
而工具栏显示 `1 / 4`）。翻页靠 `setPage` 重画同一块画布。

实测几何（Letter 4 页 PDF，`histology-sim1.pdf`）：

| 场景 | 内容区 | canvas 位图 | canvas 屏幕尺寸 | 缩放比 |
|---|---|---|---|---|
| Studio 浮窗 | 622 × 584 | 684 × 968 | 590 × 836 | 0.863 |
| Agent dock | 252 × 789 | 684 × 968 | **220 × 725** | **0.322** |

代价：
- 想看第 2 页必须点「下一页」；点完滚动位置不重置，也不会把目标页带到视野里
- 无法连续浏览、无法一眼扫过整章、无法用滚轮翻页（这是「阅读 PDF」最基本的肌肉记忆）
- `body.scrollHeight === clientHeight`（Agent 实测 789 = 789）——**容器根本不滚动**，唯一能滚的时候是单页比盒子高（Studio 的 900 > 584）

### 3.2 三重缩放叠加 —— 字为什么是糊的

```ts
const viewport = pdfPage.getViewport({ scale });   // scale 默认 1.15  → 位图 684×968
canvas.width  = viewport.width;                    // ← 只按 CSS 像素开画布
canvas.height = viewport.height;                   // ← 没有 × devicePixelRatio
```
```tsx
<div className="flex min-h-full justify-center p-4">
  <canvas ref={canvasRef} className="document-workspace-paper max-w-full" />   // ← CSS 再压一次
</div>
```

三层彼此不知情：

1. **pdf.js 层**：`scale = 1.15` 是写死的默认值，与容器宽度无关
2. **CSS 层**：`max-w-full` 把 684 px 的位图塞进 622−32 = 590 px（Agent 里塞进 220 px）→ 非整数比例回采，**最糊的一层**
3. **设备层**：没有 `devicePixelRatio` 乘法。桌面 DPR=1 时损失还不明显；用户截图是平板（`729×940` 级别），DPR 通常 2–3，
   位图会被显示端再放大 2–3 倍 —— 在平板上这是最刺眼的一层

### 3.3 缩放 UI 在撒谎

```tsx
<button title="适应宽度" onClick={() => setScale(1)}>          // L159：不是「适应」，是常量 1
<span>{Math.round(scale * 100)}%</span>                        // L155：这是 pdf.js 的 scale
```

Agent dock 实测：工具栏显示 **115%**，屏幕实际是 **32%**。用户按「+」以为在放大，实际只是把位图重画得更清晰一点、
在装不下时依然被 `max-w-full` 压回去 —— 在小盒子里**怎么点都不会变大**。这是「PDF 无法正常渲染」体感里最反直觉的一条。

### 3.4 次要但真实：render task 生命周期

```ts
await pdfPage.render({ canvasContext: ctx, canvas, viewport }).promise;   // L117
```
`RenderTask` 没有被保存、没有 `cancel()`。page/scale 快速变化时，同一块 canvas 上可能并发两次 render，
pdf.js 会抛 `Cannot use the same canvas during multiple render() operations`。
本次 240 ms 内连点 6 次「下一页」没有复现（React 把 setState 批处理成一次重渲染，掩掉了竞态），
但这是**已经埋好的引信**：一旦以后加分页预渲染、缩略图或做成连续滚动，它必然引爆。

另外：没有 text layer，所以 PDF 预览里**不能选中、不能复制、不能查找**（AI 侧走的是另一条 `lib/project/pdfText.ts` 单独提取）。

---

## 4. PPTX：四个缺陷叠在一起

`PptxDocumentPane` 用 `pptx-preview`（v1.0.7，闭源发行包）。把发行包里的实现读出来之后，问题变得非常确定。

### 4.1 根因 A（最高危）：硬编码 16:9 视口 → 4:3 稿件上下各裁 90 px

App 侧：

```ts
const SLIDE_WIDTH  = 960;   // L8
const SLIDE_HEIGHT = 540;   // L9  ← 写死 16:9
...
const previewer = init(host, { width: SLIDE_WIDTH, height: SLIDE_HEIGHT, mode: "slide" });  // L77
```

库侧（`node_modules/pptx-preview/dist/pptx-preview.es.js`，`HtmlRender` / `renderSlide`）：

```js
this.scale = viewPort.width / this.pptx.width;          // 960 / 稿件宽
var e = this.options.viewPort.width;                    // 960
var a = this.pptx.height * this.scale;                  // ← 按稿件真实纵横比算高度
this.renderPort = { width: e, height: a, left: 0, top: 0 };

renderSlide(t) {
  el.style.width  = renderPort.width  + "px";
  el.style.height = renderPort.height + "px";
  el.style.overflow = "hidden";
  if (mode === "slide") el.style.top = (options.viewPort.height - renderPort.height) / 2 + "px";  // ← 垂直居中
  ...
}
```

于是：
- **16:9 稿件**：`renderPort.height = 720 × 960/1280 ≈ 540` → `top ≈ 0` → 正好装满 ✅
- **4:3 稿件**：`renderPort.height = 720`，视口高只有 540 → `top = (540 − 720)/2 = −90 px` →
  元素自己 `overflow: hidden`，**上 90 px、下 90 px 被永久裁掉，且不可滚动**

实测（`organic-10p-4x3.pptx`，10 页 10×7.5in）：
```
slideInline: "width: 960px; height: 720px; position: absolute; top: -90px; ... overflow: hidden"
```
截图里第 1 页标题「1. 绪论 · 有机化学」只剩下半截，页脚色条整条消失。
换真正 16:9 的稿件（`prob-8p-true16x9.pptx`）：`height: 540.014px; top: -0.0067px` → 完整显示。

**结论：这个 PPTX 阅读器只对 16:9 的稿子是正确的。** 4:3 / 3:2 / 16:10 的稿子每页丢 25% 内容。
（国内大量课件、教材配套 PPT 就是 4:3，这不是边缘情况。）

### 4.2 根因 B：`mode` 选错 —— 库本来就有「上下排布」

同一个 `preview()` 里：

```js
if (options.mode === "slide") {
  wrapper.append(renderNextButton()); wrapper.append(renderPreButton());
  renderPagination(wrapper); currentIndex = 0; htmlRender.renderSlide(0);      // 只画一页
} else {
  for (var i = 0; i < n.slides.length; i++) htmlRender.renderSlide(i);          // list：全部画出来
}
```

`renderSlide` 在 `mode === "list"` 时用 `position: relative` + `margin: 0 auto 10px`，
外层 `.pptx-preview-wrapper` 自带 `overflow-y: auto` —— **这正是用户说的「不同页面上下正常排布」**，库已经实现了。

但 App 传的是 `mode: "slide"`，并且之后每次翻页调 `renderSingleSlide(page-1)`：

```ts
previewerRef.current.renderSingleSlide(Math.max(0, page - 1));   // L108
```

实测：10 页、8 页的稿件 DOM 里 `[class^=pptx-preview-slide-wrapper]` **永远只有 1 个**。

雪上加霜的是 CSS 把滚动也锁死了：

```css
/* app/styles/chat-tools.css:400-402 */
.document-workspace-body:has(.pptx-stage-fit) { overflow: hidden; }
```

实测 `bodyOverflow = "hidden"`、`scrollHeight === clientHeight`（584 = 584）。
**即使把 mode 改成 list，当前外层也滚不动** —— 这一行必须一起改。

### 4.3 根因 C：想藏的库控件根本没藏掉

```ts
host.querySelectorAll("button").forEach((button) => { button.style.display = "none"; });   // L87-89
```

库建控件用的是 `div`：

```js
renderNextButton() { var t = document.createElement("div"); t.classList.add("pptx-preview-wrapper-next"); ... }
renderPreButton()  { var t = document.createElement("div"); t.classList.add("pptx-preview-wrapper-next"); ... }
renderPagination() { var e = document.createElement("div"); e.classList.add("pptx-preview-wrapper-pagination"); ... }
```

实测 `host.querySelectorAll("button").length === 0`（host 内 24 个 `div`）——**隐藏逻辑命中数为 0，纯空转**。
后果在每张截图上都能看到：幻灯片右下角飘着两个 40×40 的灰色圆按钮和一行 `0/N`。

而且库的 `currentIndex` 从没被推进过（`renderSingleSlide` 不调用 `updatePagination`），
所以**库显示 `0/10`、App 工具栏显示 `1 / 10`，两套互相矛盾的分页永远同时在场**。

### 4.4 根因 D：`fitSlide` 取 min —— 窄高容器里必然缩成邮票

```ts
const scale = Math.min(availW / SLIDE_WIDTH, availH / SLIDE_HEIGHT);   // L29
```

「保证整页可见」这个策略在横向宽容器里没问题，但右栏是**竖长**的：

| 场景 | stage 尺寸 | scale | 幻灯片实际显示 |
|---|---|---|---|
| Studio 浮窗 | 622 × 584 | 0.631 | 606 × 341（下方 43% 空白） |
| Agent dock | **252 × 789** | **0.246** | **236 × 133** ← 完全不可读 |

Agent 右栏里，一页 16:9 幻灯片被压到 236×133 px。这不是「渲染不出来」，是**渲染出来了但没人看得见**。
正确的策略是用户在描述里点破的那句：*容器宽高比和页面不一致时，应该「宽度优先 + 纵向滚动」，而不是「塞进盒子」*。

### 4.5 次要：ResizeObserver 与依赖

```ts
useLayoutEffect(() => { ... fitSlide ...; observer.observe(stage); }, [visual, page]);   // L111-123
```

- 只观察 `stage`，但 `stage.clientHeight` 在 dock 展开动画（约 55ms）期间是中间值；`visual` 变 true 时若动画未完，会先按错误高度算一次
- 依赖数组没有容器尺寸，靠 ResizeObserver 兜底；`scalerRef` 用 `hidden={!visual}` 控制显隐 —— `hidden` 时 `clientWidth/Height` 恒为 0，首次 fit 的结果依赖时序
- `sourceToBuffer` 对 data URL 走 `atob`（L11-17）：一份 40 MB 的课件 = 约 55 MB base64 字符串同步解码，主线程会明显卡顿
- `parsePptxSlideBytes` 的文本回退只在**库整体抛错**时启用；库「成功但页面空白/裁切」时不回退，用户连文字都拿不到

---

## 5. Studio vs Agent：同一个病，Agent 更重

渲染器共用，所以两种模式**都会坏**；但几何不同，坏的程度差 3 倍：

| 维度 | Studio（floating） | Agent（dock） |
|---|---|---|
| 窗口几何 | 420–820 × 360–680 | 右栏宽（默认 31% 视口）× 100% 高 |
| 1600px 视口实测 | 820 × 648 | **319.8 × 852.6** |
| 内容 stage | 622 × 584 | **252.3 × 788.6** |
| 大纲列位置 | 左，固定 13.5rem | **右，可收起**（`useIsAgentSurface()`） |
| PDF 实测显示宽 | 590 / 684 = 86% | **220 / 684 = 32%** |
| PPTX 实测 scale | 0.631 | **0.246** |
| HTML | sandbox="" 死页 | sandbox="" 死页 |

额外发现一个**只在 Agent 下才暴露的真 bug**：`DocumentWorkspace` 给 PDF/PPTX 的 `PanelGroup` 用了全局共享的

```tsx
<PanelGroup direction="horizontal" autoSaveId="document-workspace" ...>   // DocumentWorkspace.tsx:209
```

但两种外壳的 **Panel 组合并不一样**：Agent 会省略前置的 nav Panel、把 nav 以 `order={3}` 追加到尾部
（`DocumentWorkspace.tsx:213-237`）。于是 Studio 存下的「三栏」布局被套到 Agent 的「两栏」上，
react-resizable-panels 直接报：

```
WARNING: Invalid layout total size: 63%, 0%. Layout normalization will be applied.
WARNING: Invalid layout total size: 100%, 26%. Layout normalization will be applied.
```

（本次在 Agent dock 里实测到三条）。结果是分栏宽度不可预期地被归一化，
「目录列吃掉大半宽度」这种现象有一部分来自这里。`autoSaveId` 必须按 surface + 文档类型分开。

---

## 6. 根因归纳：为什么会同时长出这一组缺陷

三个渲染器表面各不相同，底层是同一个思维模型的三次复用：

1. **把「文档」当成「一张图」**
   - HTML → 一张不许动的图（sandbox 掐掉行为）
   - PDF → 一次只画一页图（没有页序列）
   - PPTX → 按 16:9 画一页图（没有按稿件纵横比、也没有页序列）
   真实文档是「**一串尺寸各异的页**」，需要的是 *页序列 + 宽度优先布局 + 纵向滚动* 这三个能力。三个渲染器一个都没有。

2. **缩放策略只有一种：塞进盒子（fit-inside）**
   `fitSlide` 的 `Math.min`、PDF 的 `max-w-full`、PDF 的 `setScale(1)`，本质都是同一件事。
   缺的是第二种策略：**fit-width + 溢出交给滚动**。阅读类界面 95% 的时间该用后者。

3. **能力边界按「入口」定义，而不是按「文件类型」定义**
   `sandbox=""` 只挂在附件阅读器上；`allow-scripts` + storage shim 只挂在 artifact / canvas 上。
   同一个 `.html` 文件，换个入口就换一套能力，而且 UI 上用同一个「HTML · xxx」标签呈现。

4. **对第三方库的契约靠猜**
   `host.querySelectorAll("button")` 猜库用 `button`；`width: 960, height: 540` 猜稿件是 16:9；
   `mode: "slide"` 是默认值——三处都没有对着库的发行包/类型声明核对过。
   `dist/previewer/PPTXPreviewer.d.ts` 里 `mode?: 'list' | 'slide'` 其实写得清清楚楚。

---

## 7. 修复方向（按性价比排序）

### P0-1 · PPTX：换 `mode: "list"`，并按稿件真实纵横比给视口

```ts
// PptxDocumentPane.tsx
const previewer = init(host, { width: SLIDE_WIDTH, mode: "list" });   // 不给 height：库的 _renderWrapper
                                                                       // 只在有 height 时才写 height/overflow-y
```
配套：
- 删掉 `renderSingleSlide` 驱动的翻页；页导航改为 `scrollIntoView`（大纲点击 → 滚到第 N 页）
- `app/styles/chat-tools.css:400-402` 的 `overflow: hidden` 改回 `auto`
- 放弃 `transform: scale()` 整体缩放；改为「容器宽度 → 每页宽度」，让每页自然按宽度铺满
- 校验：4:3 与 16:9 两份稿件，第 1 页与最后 1 页都完整可见、可连续滚到底

### P0-2 · PPTX：不要再猜库的 DOM

- 删除 `host.querySelectorAll("button")`；改为显式隐藏 `.pptx-preview-wrapper-next` / `.pptx-preview-wrapper-pagination`，
  或干脆用 `mode: "list"`（list 模式根本不创建这些控件）
- 若要保留单页翻页，至少让 `currentIndex` 与库保持一致，避免 `0/10` vs `1 / 10` 两套分页

### P0-3 · PDF：改为连续页流

- 把「一个 canvas」换成「一列 `PdfPage` 组件」，用 `IntersectionObserver` 做按需渲染（首屏 + 前后各 1 页）
- 每页 `canvas.width = viewport.width * devicePixelRatio`，并 `ctx.scale(dpr, dpr)`、CSS 宽设成逻辑宽
- 缩放策略改为「**fit-width 为默认**」，缩放系数只作为乘数叠加上去；「适应宽度」按容器实算而不是 `setScale(1)`
- 保存 `RenderTask` 并在 effect cleanup 里 `cancel()`
- 校验：4 页 PDF 在 Studio 与 Agent 下都能从第 1 页连续滚到第 4 页；DPI 2 下截图放大 200% 文字仍锐利

### P0-4 · HTML：先把「能力」这件事定下来（这是产品决策，不是改代码）

三条路，选一条：

- **A. 附件阅读器也允许脚本**：把 `sandbox=""` 换成 `ARTIFACT_IFRAME_SANDBOX`，用 `injectOpaqueOriginStorageShim` 补 storage，
  并在窗口 actions 里补上「下载 / 新标签页打开」——与 `ArtifactViewer` 完全对齐
- **B. HTML 附件直接交给 artifact 视图**：`kind === "html"` 时不开 `AttachmentPreviewViewer`，改走 `useArtifacts` + `ArtifactViewer`
- **C. 保持静态，但把话说清楚**：窗口上加一条「静态预览 · 脚本已禁用」提示 + 一个「以可交互方式打开」按钮（落到 A/B 的容器）

无论选哪条，都要同步改 `AttachmentPreviewViewer.test.tsx:24` 那条断言；它的名字（`script-disabled`）就是当前的隐性契约。

### P1-1 · 共享 autoSaveId 拆开

```tsx
autoSaveId={`document-workspace:${agentSurface ? "agent" : "studio"}:${outlineLabel}`}   // 或按文档类型
```
校验：Studio 调好分栏 → 切 Agent → 控制台不再出现 `Invalid layout total size`。

### P1-2 · 缩放读数说真话

PDF 工具栏显示的应是 `canvas.clientWidth / pdfPage.getViewport({scale:1}).width`（屏幕占比），不是 pdf.js 的 `scale`；
或者在窄容器里直接禁掉「+/−」，只留「适应宽度 / 实际大小」。

### P2 · 大文件与回退

- `sourceToBuffer` 的 data-URL 分支改走 `fetch(dataUrl).then(r => r.arrayBuffer())`，把 base64 解码交给浏览器原生实现
- PPTX 增加「疑似裁切/空白」检测（渲染后比对 slide 元素高度与视口高度），命中时同时展示文本回退并给出提示

---

## 8. 复现素材与脚本

全部在 `tmp/repro/`（`tmp/` 已被 `.gitignore` 排除）：

| 文件 | 用途 |
|---|---|
| `memo-wall.html` | 脚本驱动的「记忆墙」复刻件：静态头 + 计数器 + 19 张脚本生成的便签 |
| `organic-10p-4x3.pptx` | 10 页 4:3 课件（复现上下裁切） |
| `prob-8p-true16x9.pptx` | 8 页真 16:9（对照组，渲染完整） |
| `histology-sim1.pdf` | 4 页 PDF（复现单页模型与缩放） |
| `R-html-studio.png` | HTML 预览：计数停在 0/19，只有静态便签 |
| `R-html-counterfactual.png` | 同一 srcdoc，`sandbox=""` vs `allow-scripts` 并排对照 |
| `R-pdf-studio.png` / `R-agent-dock-pdf.png` | PDF 单画布 + 220px 宽实测 |
| `R-pptx-4x3.png` / `R-pptx-true16x9.png` | 4:3 裁切 vs 16:9 完整 |
| `R-agent-dock-pptx.png` | Agent 右栏里 0.246× 的邮票幻灯片 |
| `t-*.ps1` / `gen_pptx*.py` | 复现脚本 |

复现注意（踩过的坑，写下来省下次的时间）：

- **必须用 `http://localhost:35349`，不能用 `http://127.0.0.1:35349`**。
  Next 16 dev 默认拦截跨源 dev 资源（`Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "127.0.0.1"`），
  页面会**只渲染 SSR HTML、完全不 hydrate**——表现为「什么按钮都点不动、file input 的 change 事件到了但 React 不响应」，
  很容易误判成 App 的 bug。
- PowerShell 5.1 读无 BOM 的 `.ps1` 会按 ANSI 解码，脚本里的中文选择器会被写坏；
  写脚本时加 UTF-8 BOM，或一律用 `agent-browser eval -b <base64>`。
- `agent-browser` 的 browser 生命周期只在**单次调用内**可靠，一条命令里用 `;` 串起来跑完整场景。

---

## 9. 本次顺带发现（与本主题相关但独立）

1. **`DocumentWorkspace` 的 `autoSaveId` 全局共享**（见 §5），Studio/Agent 布局串台并被归一化。
2. **窗口标题被硬编码前缀污染**：`WindowTaskbar.tsx:140` 把 `"HTML · "` 写进 `data.name`，
   于是 `window.title`、`data.name`、`attachmentPreviewKind({name})` 的输入全带上了这个前缀（目前靠后缀匹配侥幸没出错）。
   更干净的做法是保留原名，在 `AgentDockTabs` / `WindowTaskbar` 渲染时拼前缀。
3. **HTML 附件窗没有「导出/新标签打开」出口**，`ArtifactViewer` 有。同类窗口能力不对齐。
4. `PdfDocumentPane` 首次渲染依赖 `outline` state 变化触发（`useEffect` 依赖数组 `[page, scale, error, outline]`），
   `outline` 只是「恰好会变」的副作用，属于脆弱的隐式时序，建议显式引入 `pdf` 就绪状态。
