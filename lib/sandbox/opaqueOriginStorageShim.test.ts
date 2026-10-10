import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  ARTIFACT_IFRAME_SANDBOX,
  CANVAS_HTML_IFRAME_SANDBOX,
  OPAQUE_ORIGIN_STORAGE_SHIM_MARKER,
  applyOpaqueOriginStorageShim,
  injectOpaqueOriginStorageShim,
  opaqueOriginStorageShimScript,
} from "./opaqueOriginStorageShim.ts";

const CONTENT_PAGE = join(
  process.cwd(),
  "app",
  "[subject]",
  "[category]",
  "[id]",
  "ContentPageClient.tsx",
);
const ARTIFACT_VIEWER = join(process.cwd(), "components", "chat", "products", "ArtifactViewer.tsx");
const HTML_RENDERER = join(process.cwd(), "components", "canvas", "renderers", "HtmlRenderer.tsx");

const VIZ_HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <canvas id="view" width="320" height="240"></canvas>
  <script>
    const ctx = document.getElementById("view").getContext("2d");
    const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("view") });
  </script>
</body>
</html>`;

function throwingStorageScope() {
  const throwSec = () => {
    const err = new Error("Access is denied for this document.");
    err.name = "SecurityError";
    throw err;
  };
  const scope: Record<string, unknown> = {};
  Object.defineProperty(scope, "localStorage", {
    configurable: true,
    enumerable: true,
    get: throwSec,
  });
  Object.defineProperty(scope, "sessionStorage", {
    configurable: true,
    enumerable: true,
    get: throwSec,
  });
  return scope;
}

test("sandbox 常量含 allow-scripts、不含 allow-same-origin", () => {
  for (const sandbox of [ARTIFACT_IFRAME_SANDBOX, CANVAS_HTML_IFRAME_SANDBOX]) {
    assert.match(sandbox, /\ballow-scripts\b/);
    assert.doesNotMatch(sandbox, /allow-same-origin/);
  }
});

test("两处 AI iframe 源码使用共享 sandbox，且无 allow-same-origin", () => {
  const artifact = readFileSync(ARTIFACT_VIEWER, "utf8");
  const renderer = readFileSync(HTML_RENDERER, "utf8");
  assert.match(artifact, /ARTIFACT_IFRAME_SANDBOX/);
  assert.match(renderer, /CANVAS_HTML_IFRAME_SANDBOX/);
  assert.doesNotMatch(artifact, /allow-same-origin/);
  assert.doesNotMatch(renderer, /allow-same-origin/);
  assert.match(artifact, /injectOpaqueOriginStorageShim/);
  assert.match(renderer, /injectOpaqueOriginStorageShim/);
});

test("ContentPageClient：历史 HTML 保留 allow-same-origin，课堂 notes 收紧沙箱", () => {
  const src = readFileSync(CONTENT_PAGE, "utf8");
  // 历史可信 HTML 的回退沙箱仍只出现一次（htmlSandbox 三元表达式的 else 分支）。
  const legacy = src.match(/"allow-scripts allow-same-origin"/g) ?? [];
  assert.equal(legacy.length, 1);
  // 课堂静态笔记 notes.html 收紧为仅放行新窗口：禁脚本、禁同源。
  assert.match(src, /materialRole === "notes"\s*\?\s*"allow-popups"/);
  // 两处 iframe 都统一走 htmlSandbox 变量，而不是各自硬编码。
  const bound = src.match(/sandbox=\{htmlSandbox\}/g) ?? [];
  assert.equal(bound.length, 2);
  assert.doesNotMatch(src, /injectOpaqueOriginStorageShim/);
  assert.doesNotMatch(src, /opaqueOriginStorageShim/);
});

test("shim：native Storage 抛 SecurityError 时 get/set 不抛", () => {
  const scope = throwingStorageScope();
  applyOpaqueOriginStorageShim(scope);
  const local = scope.localStorage as Storage;
  const session = scope.sessionStorage as Storage;
  assert.doesNotThrow(() => local.setItem("k", "v"));
  assert.equal(local.getItem("k"), "v");
  assert.equal(local.length, 1);
  assert.equal(local.key(0), "k");
  local.removeItem("k");
  assert.equal(local.getItem("k"), null);
  assert.doesNotThrow(() => session.setItem("s", "1"));
  assert.equal(session.getItem("s"), "1");
  session.clear();
  assert.equal(session.length, 0);
});

test("shim：native Storage 可用时不替换", () => {
  const native = {
    data: {} as Record<string, string>,
    getItem(key: string) {
      return Object.hasOwn(this.data, key) ? this.data[key] : null;
    },
    setItem(key: string, value: string) {
      this.data[key] = String(value);
    },
  };
  const scope = { localStorage: native, sessionStorage: native };
  applyOpaqueOriginStorageShim(scope);
  assert.equal(scope.localStorage, native);
});

test("注入脚本可在抛错的 window 上执行（与 srcDoc 同源逻辑）", () => {
  const scope = throwingStorageScope();
  const body = opaqueOriginStorageShimScript().replace(
    new RegExp(`^<script ${OPAQUE_ORIGIN_STORAGE_SHIM_MARKER}="1">|</script>$`, "g"),
    "",
  );
  const run = new Function("window", body);
  run(scope);
  const local = scope.localStorage as Storage;
  assert.doesNotThrow(() => local.setItem("cdn", "ok"));
  assert.equal(local.getItem("cdn"), "ok");
});

test("inject：不改写 canvas / CDN / three.js，且可重复调用", () => {
  const once = injectOpaqueOriginStorageShim(VIZ_HTML);
  const twice = injectOpaqueOriginStorageShim(once);
  assert.equal(once, twice);
  assert.ok(once.includes(OPAQUE_ORIGIN_STORAGE_SHIM_MARKER));
  assert.ok(once.includes("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"));
  assert.ok(once.includes("https://cdn.jsdelivr.net/npm/chart.js"));
  assert.ok(once.includes('<canvas id="view" width="320" height="240"></canvas>'));
  assert.ok(once.includes("THREE.WebGLRenderer"));
  assert.ok(once.includes('getContext("2d")'));
});

test("inject：无 head 的文档仍插入 shim", () => {
  const out = injectOpaqueOriginStorageShim("<div>hi</div>");
  assert.ok(out.startsWith(`<script ${OPAQUE_ORIGIN_STORAGE_SHIM_MARKER}="1">`));
  assert.ok(out.includes("<div>hi</div>"));
});
