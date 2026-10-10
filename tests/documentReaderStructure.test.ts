import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

/**
 * 文档阅读器（PDF / PPTX / HTML 附件预览）的结构契约。
 * 这些断言锁的是「已经踩过的坑」，不要为了让测试变绿而放宽——
 * 每一条都对应 analysis/attachment-preview-rendering-defects-2026-09-20.md 里的一个实测缺陷。
 */
test("PPTX 阅读器走 list 模式 + 懒渲染，不再有单页缩放舞台", () => {
  const pane = readWorkspaceFile("components/window/PptxDocumentPane.tsx");
  const helper = readWorkspaceFile("lib/chat/pptxSlideList.ts");
  const css = readWorkspaceFile("app/styles/chat-tools.css");

  // list 模式才会把全部页纵向平铺；slide 模式会把 4:3 稿件上下各裁 90px。
  assert.match(pane, /mode:\s*"list"/);
  // 不能传 height：pptx-preview 只有在有 height 时才给 wrapper 写固定高度与 overflow。
  assert.doesNotMatch(pane, /height:\s*SLIDE_HEIGHT/);
  // 单页翻页 / 硬编码 16:9 视口 / 缩放舞台全部退场。
  assert.doesNotMatch(pane, /renderSingleSlide/);
  assert.doesNotMatch(pane, /SLIDE_HEIGHT/);
  assert.doesNotMatch(pane, /fitSlide/);
  assert.doesNotMatch(pane, /pptx-stage-/);
  // 隐藏库控件必须靠 list 模式（库根本不建），不允许再猜 DOM 标签名。
  assert.doesNotMatch(pane, /querySelectorAll\("button"\)/);
  // 大课件不能走同步 atob 解码。
  assert.doesNotMatch(pane, /atob\(/);

  assert.match(pane, /pptx-page-slot|pptx-pages/);
  assert.match(pane, /useElementWidth/);
  assert.match(helper, /export function slideDisplayHeight/);
  assert.match(helper, /export function mountRenderedSlide/);

  assert.doesNotMatch(css, /\.pptx-stage-fit/);
});

test("PDF 阅读器是连续页流：多页占位 + 按 DPR 出图 + 可取消的 render task", () => {
  const pane = readWorkspaceFile("components/window/PdfDocumentPane.tsx");
  const page = readWorkspaceFile("components/window/PdfPageCanvas.tsx");

  // 单画布单页模型必须消失：不能再有 max-w-full 把位图压小。
  assert.doesNotMatch(pane, /max-w-full/);
  assert.match(pane, /data-pdf-page/);
  assert.match(pane, /scrollToPage/);
  assert.match(pane, /useElementWidth/);
  assert.match(pane, /bodyRef/);
  // 「适应宽度」曾经写死 setScale(1)，是个假的适应。
  assert.doesNotMatch(pane, /setScale\(1\)/);

  // 高分屏清晰：画布尺寸要乘 devicePixelRatio，并把 transform 交给 pdf.js。
  assert.match(page, /devicePixelRatio/);
  assert.match(page, /transform:/);
  // 同一块 canvas 上的并发渲染必须能取消。
  assert.match(page, /RenderingCancelledException/);
  assert.match(page, /cancel\(\)/);
  // 文本层要设置 pdfjs 依赖的 scale 变量。
  assert.match(page, /--total-scale-factor/);
  assert.match(page, /TextLayer/);
});

test("HTML 附件预览：允许脚本、默认锁网、可显式放行联网", () => {
  const viewer = readWorkspaceFile("components/chat/attachments/AttachmentPreviewViewer.tsx");

  // sandbox="" 是「全禁」——正是脚本驱动页面只显示静态壳的根因。
  assert.doesNotMatch(viewer, /sandbox=""/);
  assert.match(viewer, /ARTIFACT_IFRAME_SANDBOX/);
  assert.match(viewer, /injectOpaqueOriginStorageShim/);
  // 联网必须是显式开关，默认锁网。
  assert.match(viewer, /htmlPreviewCsp/);
  assert.match(viewer, /prepareHtmlPreview/);
  assert.match(viewer, /useState\(false\)/);
  // 附件窗要有出口：下载 + 新标签页。
  assert.match(viewer, /downloadHtmlFile/);
  assert.match(viewer, /openHtmlInNewTab/);
});

test("DocumentWorkspace：正文容器可被阅读器接管，分栏布局键按外壳拆分", () => {
  const workspace = readWorkspaceFile("components/window/DocumentWorkspace.tsx");
  const globals = readWorkspaceFile("app/globals.css");

  assert.match(workspace, /bodyRef/);
  // Studio 是 [nav, stage]，Agent 是 [stage, nav]；共用一个持久化键会被归一化并告警。
  assert.match(workspace, /autoSaveId=\{`document-workspace:\$\{/);
  assert.match(workspace, /agentSurface \? "agent" : "studio"/);

  assert.match(globals, /@import "\.\/styles\/pdf-reader\.css";/);
  assert.match(globals, /@import "\.\/styles\/pptx-reader\.css";/);
  // Tailwind 必须仍是完整第一行；source(none) 只限定扫描来源，不改变 import 顺序。
  assert.match(globals, /^@import "tailwindcss"(?: source\(none\))?;(?:\r?\n|$)/);
});
