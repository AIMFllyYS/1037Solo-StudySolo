# 剩余文档格式阅读能力 · 深度分析（DOCX / TXT / CSV / XLSX）

- 日期：2026-09-20
- 上一轮：[`attachment-preview-rendering-defects-2026-09-20.md`](./attachment-preview-rendering-defects-2026-09-20.md)（PDF / PPTX / HTML 已修）
- 本文范围：DOCX、TXT（及 .log/.ini 等纯文本）、CSV/TSV、XLSX/XLS
- 方法：源码追踪 + 真机复现（`http://localhost:35349`）+ 第三方库发行包反查 + 实测几何

---

## 0. 结论速览

| # | 格式 | 用户可见症状 | 本质原因 | 严重度 |
|---|---|---|---|---|
| D1 | DOCX | 没有目录、没有导航，跟 PDF/PPTX/MD 长得完全不一样 | `DocxDocumentPane` 只有 46 行，**根本没接 `DocumentWorkspace`** | P1 |
| D2 | DOCX | 右栏里**只有 40% 的页面宽度可见**，标题左边被切掉，要横向拖着看 | docx-preview 按 A4 固定 **794px** 出图，容器只有 319px → **实测横向溢出 237px** | **P0** |
| D3 | DOCX | 「下一页」这种导航在 DOCX 上**根本没有意义** | docx-preview 的 `<section>` 只在**显式分页符**处切分；实测本文档第 1 页 1123px、**第 2 页 14159px** | P0（设计） |
| D4 | DOCX | **超过 20 万字的 Word 文档根本打不开**，弹「请拆分后再上传」 | 预览走了「给 AI 的附件」管线，撞上 `MAX_DOCUMENT_CHARACTERS` 上限 | **P0（代码已证，未复现）** |
| D5 | DOCX | 在同一个窗口里快速换两份 Word，排版会串在一起 | `renderAsync` **没有取消 API**，旧渲染继续往同一个 host 里 append | P1 |
| D6 | DOCX | 大文档打开慢一倍 | mammoth 读一遍（AI 提取）+ docx-preview 读一遍（渲染），**同一份字节解析两次** | P2 |
| T1 | TXT/CSV | GBK 编码的 csv **整篇乱码**（实测 34 个替换字符、0 个合法汉字） | `file.text()` **永远按 UTF-8 解码**，没有编码嗅探 | **P0（已复现）** |
| T2 | TXT | 长文本会被拒（同 D4，未复现） | 同一条 20 万字上限 | P0（同 D4） |
| C1 | CSV | 渲染成**一坨等宽文本**，不是表格（见 `tmp/repro/BEFORE-csv.png`） | `attachmentPreviewKind` 把 csv 归到 `text` → `<pre>` | **P0** |
| C2 | CSV | 带引号的字段**把引号一起显示**（`"生理学,含实验"`） | 没有 CSV 解析，原文直出 | P1 |
| C3 | CSV | 长表格会被拒（同 D4，未复现） | 同一条 20 万字上限 | P0（同 D4） |
| X1 | XLSX | **文件选择器里根本选不到 `.xlsx`**；拖进来会报「不支持」 | `DOCUMENT_MIME_BY_EXTENSION` / 预览白名单里**都没有 xlsx**，也**没有任何表格解析库** | **P0（能力缺失）** |
| X2 | XLS | 同 X1 | `.xls` 是 BIFF 二进制，与旧版 `.doc`/`.ppt` 同类，只能明确不支持 | P2 |

**一句话本质**：上一轮把 PDF/PPTX 从「给 AI 的附件」里拆出来了（`LOCAL_PREVIEW_MIME_BY_EXTENSION`），但**DOCX 和 CSV/TXT 还留在旧管线上**，于是同时继承了两种病：
①**能力病**——没有外壳、没有宽度模型、没有表格语义；
②**身份病**——它们被当成「要发给大模型的文档」，于是 20 万字的 AI 上限变成了**预览的上限**（D4/T2/C3）。

---

## 1. 现状：附件分流矩阵（实测）

```
filesToAttachments(files)
├── image/*                     → fileToAttachment              → kind: image
├── 扩展名 ∈ LOCAL_PREVIEW      → fileToLocalPreviewAttachment  → kind: local-file  ← PDF/PPT/PPTX
│   {pdf, ppt, pptx}                                              存 blob URL，无字数上限
└── 其余                        → fileToDocumentAttachment       → kind: document   ← 含 DOCX / CSV / TXT
    扩展名 ∈ DOCUMENT_MIME_BY_EXTENSION(39 种)                     读出全文，>20 万字抛错
```

| 扩展名 | 在 accept 白名单 | 走的管线 | 预览成什么 |
|---|---|---|---|
| `.pdf` `.ppt` `.pptx` | ✅ | local-file | PDF / PPTX 阅读器（上一轮已改） |
| `.docx` | ✅ | **document（mammoth 提取全文）** | `DocxDocumentPane`（无外壳、794px 固定宽） |
| `.csv` `.tsv` | ✅ | **document（读全文）** | **`<pre>` 裸文本** |
| `.txt` `.log` `.ini` … | ✅ | **document（读全文）** | `<pre>` 裸文本 |
| `.md` `.markdown` | ✅ | document | Markdown 预览（有外壳，不可拖拽分栏） |
| `.html` `.htm` | ✅ | document | sandbox iframe（上一轮已改） |
| **`.xlsx` `.xls`** | **❌ 不在** | — | **选不到；拖进来报「不支持 xxx」** |
| `.doc` `.ppt`(旧) | doc 不在 / ppt 在 | — | `.ppt` 有专门的「旧版二进制无法还原版式」说明卡；`.doc` 连提示都没有 |

---

## 2. DOCX 深挖（最重要）

### 2.1 实测 DOM 结构（`content/_raw/cell-biology-lab/source.docx`，81KB）

```
.docx-preview-host                         ← 唯一的容器（overflow:auto; padding:16px）
├── <style> ×4                             ← 库把页面 CSS 注入到 host 内部
└── div.docx-preview-wrapper   w:747       ← 自带 background:gray; padding:30px; flex 居中
    ├── section.docx-preview   w:794 h:1123   ← 第 1 页（A4 210×297mm @96dpi = 794×1123）
    │   └── article
    └── section.docx-preview   w:794 h:14159  ← 第 2 页，14159px 高
        └── article
```

统计：`SECTION:2 / ARTICLE:2 / P:404 / SPAN:2116 / STYLE:4 / IMG:1 / CANVAS:0`。
段落**没有语义类名**（`cls: "(none)"`，只有内联 `text-align`）。

### 2.2 D1 · 没有外壳，与其它格式完全不一致

实测 `shellHasWorkspace: false`、`shellHasOutline: false`。
PDF / PPTX / Markdown 都走 `DocumentWorkspace`（左目录右正文、可拖拽、Agent 下目录挂右并可收起），**只有 DOCX 是一个光秃秃的滚动 div**。用户在同一排窗口标签里切换会明显感到「Word 是另一个 app」。

### 2.3 D2 · 固定 A4 宽 + 无宽度模型 → 右栏只剩 40%（P0）

实测（Agent dock，1600px 视口）：

| 指标 | 实测值 |
|---|---|
| host 内容宽 | **319px** |
| 页面宽（`section`） | **794px** |
| 横向溢出 | **237px** |
| 页面可见比例 | **40%** |

截图 `tmp/repro/BEFORE-docx-agent.png` 里标题「细胞生物学实验讲义」的**第一个字被切掉**，正文右侧整段在视口外。
原因链：`ignoreWidth: false` → docx-preview 尊重文档自身页宽（A4=794px）→ `.docx-preview-wrapper` 用 flex 居中 → 容器不够就溢出。**没有任何缩放/适应宽度机制。**

### 2.4 D3 · DOCX 的「页」不是可靠的导航单位（P0，方向性问题）

同一个文档里：第 1 页 **1123px**（正常 A4 高度），第 2 页 **14159px**。
说明 `breakPages: true` **只在遇到显式分页符时切页**；没有分页符的文档会退化成「一个超长 section」。而 `w:lastRenderedPageBreak` 是 Word 的「软分页」标记，很多文档（尤其是从 Markdown/网页转来的）根本没有。

**结论：DOCX 不能照搬 PDF/PPTX 那套「第 N 页 / 共 M 页」。**
Word 文档天然是**流式**的，正确的导航单位是**标题层级（Heading 1/2/3）**，不是页码。
`<section>` 只能当「视觉分页容器」，不能当导航锚点。

> 这一点是上一轮 PDF/PPTX 方案**不能直接复用**的地方，也是最容易做错的地方。

### 2.5 D4 · 长文档会被拒之门外（P0，代码已证但**未复现**）

```ts
// lib/ai/imageUtils.ts:185-199（docx 分支）
const result = await mammoth.extractRawText(input);
text = result.value;
const characterCount = countCodePoints(text);
if (characterCount > MAX_DOCUMENT_CHARACTERS) {      // 200_000
  throw new Error(`${file.name} 提取后超过 20 万字，请拆分后再上传`);
}
```

**诚实说明**：我用仓库里现成的三份 docx 实测了一遍提取字数，**全部远低于阈值**，所以这条我**没有复现出真实报错**，它是代码层面的确定性推断：

| 文件 | 提取字数 | 200k 阈值 |
|---|---|---|
| `content/_raw/cell-biology-lab/source.docx` | 14,531 | 通过 |
| `content/_raw/maogai/exam/…知识点回顾.docx` | 23,344 | 通过 |
| `content/_raw-src/anatomy-outlines/exam-outline.docx` | 7,871 | 通过 |

20 万字大约相当于 100–150 页的 Word 文档 —— 日常讲义够用，但**整本教材、毕业论文、合并版复习资料**会撞上。
关键不是"多大算大"，而是**这个上限的量纲错了**：它约束的是「发给大模型的上下文预算」，却被用在了「本机打开看一眼」上。截图里那份讲义只用了 14k 字就渲染出 15403px，说明**渲染成本与字数完全脱钩**，没有任何理由用字数限制预览。

同一段代码也会拦住长 CSV 和长 TXT（T2 / C3）。

### 2.6 D5 · `renderAsync` 不可取消 → 换文件时排版串台（P1）

```ts
// DocxDocumentPane.tsx:9-34
useEffect(() => {
  const host = hostRef.current;
  host.replaceChildren();          // 清空
  void (async () => {
    ...
    await renderAsync(blob, host, undefined, {...});   // ← 没有取消 API，写到一半无法中止
  })();
  return () => { cancelled = true; };                  // ← 只是不 setState，DOM 照样被写
}, [name, src]);
```

`openAttachmentPreview` 对同一份文件复用同一个 window id（`updateWindow`），快速连续打开两份 Word 时：新的 effect 清空 host 并开始渲染，**上一次的 `renderAsync` 仍在往同一个 host 里 append** → 两篇文档的节点交错。`cancelled` 标志只挡住了 `setError`，挡不住 DOM 写入。

### 2.7 D6 · 同一份字节解析两次（P2）
mammoth（AI 文本提取，同步阻塞地读整个 zip）× docx-preview（渲染，再读一遍 zip + 解析 OOXML）。大文档上这是实打实的双倍开销，而且 blob URL 还把整份文件留在内存里。

### 2.8 D7 · 库自带外观与 app 打架（P2）
库注入的 CSS 里写死了 `.docx-preview-wrapper { background: gray; padding: 30px; }`、`section.docx-preview { background: white; box-shadow: 0 0 10px rgba(0,0,0,.5); margin-bottom: 30px; }`。
而 app 自己的纸张样式是 `.document-workspace-paper`（`#fff` + `0 8px 24px rgba(0,0,0,.08)`）。两套灰底/阴影/圆角叠在一起，深色模式下那层 `background: gray` 尤其突兀（截图里能看到页面周围一圈灰）。

### 2.9 可利用的杠杆（好消息）

1. **`section.docx-preview` 是稳定的页面选择器**，每页含一个 `<article>` —— 结构上跟 PDF 的 `.pdf-page`、PPTX 的 `.pptx-page-slot` 同构，可以接同一套「槽 + 懒挂载 + 滚动定位」。
2. **`parseAsync(data, options) → WordDocument`** 与 **`renderDocument(doc, options) → Node[]`** 是分开导出的公开 API（`dist/docx-preview.d.ts:42-43`）。
   这意味着可以**先解析、拿到节点数组、再自己决定何时插入 DOM** —— D5 的竞态可以直接消灭（解析完发现已取消就整个丢弃，一个节点都不会进 DOM）。
3. 库把 `<style>` 注入 host **内部**，host 卸载即回收，没有全局污染。
4. 页面是纯 DOM（无 canvas），所以**没有 DPR 清晰度问题**，只需解决宽度与缩放。

### 2.10 大纲从哪来（渲染后的 DOM 拿不到）

实测渲染结果里**没有任何 `h1`-`h6`**，全是 `<p>`（`headings` 探测全是 `P:`）。所以大纲必须另取，三个选项：

| 方案 | 做法 | 代价 |
|---|---|---|
| A（推荐） | 复用已有的 `mammoth`，改用 `convertToHtml`，从 `<h1>-<h6>` 抽大纲 | 与 AI 提取合并成一次 mammoth 调用即可，几乎零额外成本 |
| B | 自己解 `word/document.xml`，找 `w:pStyle w:val="Heading1"` / `1` / `a3` 等 | 要处理 styleId 映射（中文 Word 常用「标题 1」→ `1`），约 60 行 |
| C | 用 `docx-preview` 的 `parseAsync` 结果里的段落样式 | 依赖库内部结构，不稳定，不推荐 |

**注意**：AI 提取（`extractRawText`）和大纲提取（`convertToHtml`）目前是两次解析，A 方案应该合并为**一次 `convertToHtml`**，再从 HTML 里既抽大纲又转纯文本给 AI —— 顺带把 D6 也解决了。

---

## 3. TXT（及 .log / .ini / 配置类纯文本）

### 3.1 现状
`kind: "text"` → `<pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-[12px] leading-6">`。
能读，但没有：目录、行号、换行开关（`pre-wrap` 强制折行，看代码/表格很难受）、搜索、字数。

### 3.2 T1 · 编码（P0，本项目高发）
```ts
function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();   // ← 规范规定：永远 UTF-8
  ...
}
```
`Blob.text()` **按规范固定 UTF-8 解码**，不做 BOM 之外的任何嗅探。
中文 Windows 上用 Excel「另存为 CSV」默认导出 **GBK**；记事本老文件、教务系统导出的 txt 也大量是 GBK。
→ **整篇乱码**。

**已复现**：我按 GBK（代码页 936）写了一份成绩表 `tmp/repro/grades-gbk.csv`（首字节 `BF CE B3 CC` = 「课程」的 GBK 编码），上传后实测：

```
preview:  �γ�,ѧ��,�ɼ�,����   ← 期望 "课程,学分,成绩,绩点"
replacementCharCount: 34
hasCjk: false                    ← 一个合法汉字都没有
verdict: MOJIBAKE
```

截图 `tmp/repro/BEFORE-gbk-csv.png`。
注意这不只是"看着难受"：**同一份文本会原样进入 AI 附件**（`fileToDocumentAttachment` 返回的 `text` 就是这份乱码），
模型收到的是替换字符。**错误在解码层，后面所有环节都救不回来。**

> 这个坑本仓库已经踩过一次（`docs/refer/rendering-architecture.md` §9 记载了「PowerShell 经 GBK 管道写坏内容文件」的事故，并因此加了 `scripts/check-content-encoding.mjs` 守卫）。**同一个编码问题现在从"写"侧转移到了"读"侧，而且没有任何守卫。**

建议：`TextDecoder` 嗅探链 —— ① `EF BB BF` → UTF-8；② `FF FE` / `FE FF` → UTF-16；③ `new TextDecoder("utf-8", { fatal: true })` 试解，成功即 UTF-8；④ 抛错则 `new TextDecoder("gbk")`（浏览器原生支持）；⑤ 都不行再退回 UTF-8 替换字符。

### 3.3 T2
同 D4：>20 万字打不开。

---

## 4. CSV / TSV

### 4.1 C1 · 现在是一坨文本（P0）
实测截图 `tmp/repro/BEFORE-csv.png`：`kindRender: "pre"`、`hasTable: false`、`hasWorkspace: false`。
一份成绩表显示为：

```
课程,学分,成绩,绩点
医学细胞生物学,3.0,92,4.0
...
"生理学,含实验",3.5,91,3.9      ← 引号原样显示
```

**表格数据必须以表格呈现**，这是这个格式存在的全部意义。

### 4.2 要处理的东西
- **RFC 4180 引号规则**：字段内逗号、换行、双写引号 `""`。
- **分隔符嗅探**：`.csv` 未必是逗号（欧洲导出常用 `;`），`.tsv` 是制表符；建议对首行做候选分隔符计数取最大值。
- **BOM**：Excel 导出的 UTF-8 CSV 常带 `\uFEFF`，不去掉的话第一个表头会变成 `\uFEFF课程`。
- **编码**：同 T1（GBK 高发）。
- **超大文件**：见 4.3。

### 4.3 C3 · 20 万字上限对表格是灾难（推算，未复现）
按每行约 50 字符估算：**4000 行就触到 20 万字上限**（一个学期的成绩总表、一份仪器分析数据导出都在这个量级）。
本节是算术推算，没有实测样本 —— 但 CSV 从「document」管线里拿出来（变成 `local-file`，无字数上限）本来就是正确做法：表格数据天然就长。

---

## 5. XLSX / XLS（全新能力）

### 5.1 X1 · 现在完全不可用
- `DOCUMENT_MIME_BY_EXTENSION`（39 项）里**没有 xlsx / xls**；
- `LOCAL_PREVIEW_MIME_BY_EXTENSION`（3 项）里也没有；
- `ACCEPTED_DOCUMENT_FILE_TYPES` 由这两张表拼出来 → **文件选择器里根本没有 Excel 选项**；
- 依赖里**没有任何表格解析库**（`package.json` 无 xlsx / exceljs / sheetjs / papaparse）。

拖拽进来会走到 `fileToDocumentAttachment` → `mappedMimeType` 为 undefined → 抛「不支持 xxx.xlsx，请选择文本、Markdown、HTML、代码、配置或 DOCX 文档」。

### 5.2 解析选型（三条路，需要你定）

| 方案 | 体积/依赖 | 覆盖度 | 风险 |
|---|---|---|---|
| **A. fflate 手写解析器**（推荐） | **0 新依赖**（`fflate` 已在依赖里，`parsePptx.ts` 就是同一套路） | 读值、共享字符串、内联字符串、公式缓存值、内置数字格式（含日期）、合并单元格、列宽、多 sheet | 自研代码要覆盖边界；`.xls`(BIFF) 不支持 |
| B. `exceljs` | MIT，约 1MB min | 完整（读/写/样式/图片） | 只为「读」引入 1MB；Next 客户端包体明显上涨 |
| C. SheetJS `xlsx` | Apache-2.0，但**官方已不在 npm 发布**（需自建 CDN/私有源） | 最完整 | 供应链复杂化，与仓库「不引入非 npm 依赖」的现状冲突 |

**推荐 A**，理由：仓库已有「用 fflate 手解 OOXML」的成功先例（`lib/chat/parsePptx.ts`，48 行），XLSX 的读取面比 PPTX 略宽但仍在可控范围（约 250–350 行 + 单测）；而且**只读**，不需要写、不需要样式渲染、不需要图片。

必须处理的四个坑：
1. **共享字符串**（`xl/sharedStrings.xml`，`t="s"` 的单元格值是索引）——以及富文本 `<r><t>` 多段拼接；
2. **数字格式与日期**：Excel 把日期存成序列号 + `numFmtId`。不解 `xl/styles.xml` 的话，日期会显示成 `45678`。内置格式 14–22 / 45–47 是日期时间，自定义格式看 `numFmts` 里的 `yyyy/mm/dd` 模式；序列号 → JS Date 要减 1900 闰年 bug（`Date.UTC(1899,11,30) + serial*86400000`）；
3. **单元格引用 → 行列**：`r="BC12"` 要还原成列号（支持 AA/AB… 多字母），空单元格要补位（稀疏存储）；
4. **合并单元格**（`<mergeCells>`）：不处理会出现内容只落在左上角、其余格空，视觉上像是丢数据。

明确不支持并给说明卡：`.xls`（BIFF 二进制，同 `.doc`）、`.numbers`、加密工作簿。

### 5.3 顺带影响 AI 侧
`lib/project/parse.ts` 的 `extractFileText` 目前对 xlsx 会抛错。如果 XLSX 解析器落地，**同一份解析器可以给「项目文件索引」复用**（把 sheet 转成 markdown 表格文本），让 Agent 也能读表格 —— 这是额外收益，不是必须。

---

## 6. 统一模型：四种文档形态，一套外壳

上一轮已经把「槽位 + 懒挂载 + 大纲 + 滚动定位」这套骨架做出来了（`DocumentWorkspace.bodyRef` + `useElementWidth` + `scrollToElementTop`）。剩下的格式按**文档形态**收敛成四类：

| 形态 | 格式 | 导航单位 | 宽度策略 | 懒渲染 |
|---|---|---|---|---|
| **分页型** | PDF / PPTX | 真·页码 | fit-width | ✅ 已有 |
| **固定版面流** | **DOCX** | **标题层级（不是页码！）** | **按容器宽缩放版面**（`transform: scale` 包一层，或按比例重排） | ✅ 按 `section` 分槽 |
| **二维表** | **CSV / XLSX** | **sheet（XLSX）/ 无（CSV）** | 列宽自适应 + 横向滚动 | ✅ **按行窗口化**（`@tanstack/react-virtual` 已在依赖里） |
| **纯文本** | TXT / 代码 / 配置 | 无（可选行号） | 折行开关 | 不需要 |

**共用件**（都已在库里）：
- 外壳：`DocumentWorkspace` + `bodyRef`
- 宽度：`useElementWidth`
- 跳转：`scrollToElementTop`
- 虚拟化（仅表格需要）：`@tanstack/react-virtual` 的 `useVirtualizer`（`ChatThread.tsx` / `BillingDashboard.tsx` 已有用法）
- 编码：**需要新增** `lib/chat/decodeText.ts`

**必须新增的三块**：
1. `lib/chat/decodeText.ts` —— 编码嗅探（T1 的根因，CSV/TXT 共用）
2. `lib/chat/parseDelimited.ts` —— RFC 4180 的 CSV/TSV 解析 + 分隔符嗅探
3. `lib/chat/parseXlsx.ts` —— fflate 手写 XLSX 读取（若选方案 A）
   （表格渲染器 `SpreadsheetPane` 由 CSV 与 XLSX 共用）

---

## 7. 建议的落地顺序

| 阶段 | 内容 | 收益 | 依赖 |
|---|---|---|---|
| **P0-a** | 把 DOCX / CSV / TXT 从「document 附件」管线里拆出来（无 20 万字上限），并补 `.xlsx`/`.xls` 到 accept 白名单与「不支持」说明 | 立刻消灭 D4 / T2 / C3 / X1 的「打不开」 | 无 |
| **P0-b** | `decodeText` 编码嗅探（T1） | 消灭乱码，CSV/TXT 共用 | 无 |
| **P0-c** | DOCX 接外壳 + 宽度自适应（D1/D2/D7） | 右栏从 40% 可见 → 完整可读 | 无 |
| **P1-a** | CSV/TSV 表格渲染 + 虚拟化（C1/C2） | 表格终于像表格 | `parseDelimited` |
| **P1-b** | DOCX 标题大纲 + 消灭 `renderAsync` 竞态（D3/D5） | 长文档可导航、换文件不串台 | mammoth `convertToHtml` |
| **P1-c** | XLSX 读取 + 同一套表格渲染 | 新增一种格式能力 | `parseXlsx`（选型待定） |
| **P2** | `.doc`/`.xls` 说明卡、AI 侧 `parse.ts` 复用表格解析、TXT 行号/搜索 | 收尾 | — |

---

## 8. 已确认的决策（2026-09-20）

1. **XLSX 解析选型 → A. fflate 手写只读解析器**（0 新依赖，复用 `lib/chat/parsePptx.ts` 的既有套路）。
   需要自己覆盖：共享字符串（含富文本 `<r><t>`）、数字格式与日期序列号、单元格引用→行列（含稀疏补位）、合并单元格、列宽、多 sheet。
   `.xls`（BIFF）与 `.doc` 一并走「明确不支持 + 说明卡」。
2. **范围 → P0 + P1 一次做完**：拆管线 + 编码嗅探 + DOCX 外壳/宽度 + CSV 表格渲染 + XLSX 读取 + DOCX 标题大纲。

### 8.1 一个需要留意的方向性决策

**DOCX 的导航单位是「标题层级」，不是「页码」。** 依据见 §2.4（实测同一文档第 1 页 1123px、第 2 页 14159px）。
这意味着 DOCX **不能**照抄 PDF/PPTX 的「第 N 页 / 共 M 页 + scrollToPage」：
- 工具栏换成「标题大纲 + 当前位置」；
- `<section>` 只作为视觉分页容器（懒挂载单位），不作为跳转锚点；
- 大文档的"页码"最多只能作为估算显示（如"第 3 页 / 约 40 页"），或者干脆不显示。

如果希望 DOCX 与 PDF「看起来一样」，需要接受"页码是假的"这一点；否则就应该让 Word 用标题导航、PDF 用页码导航 —— **我倾向前者更诚实，后者更实用**，实现时会按"标题导航为主、页码不显示"来做。

---

## 9. 复现素材

| 文件 | 用途 |
|---|---|
| `content/_raw/cell-biology-lab/source.docx` | 真实 81KB 讲义（2 个 section，第 2 页 14159px） |
| `tmp/repro/grades.csv` | 含中文、引号字段、逗号的成绩表 |
| `tmp/repro/BEFORE-csv.png` | CSV 现状：裸文本 |
| `tmp/repro/BEFORE-docx.png` | Studio 下 DOCX 现状 |
| `tmp/repro/BEFORE-docx-agent.png` | **Agent 右栏：页面只有 40% 可见、标题被切** |
