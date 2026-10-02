import assert from "node:assert/strict";
import { test } from "node:test";
import rehypeSanitize from "rehype-sanitize";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { markdownSanitizeSchema, MARKDOWN_DSL_TAGS, CITE_REF_TAG } from "./sanitizeSchema.ts";
import { sharedRemarkPlugins, sharedRehypePlugins } from "./plugins.ts";

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
};

function walk(node: HastNode, visit: (n: HastNode) => void): void {
  visit(node);
  node.children?.forEach((child) => walk(child, visit));
}

function elements(tree: HastNode): HastNode[] {
  const out: HastNode[] = [];
  walk(tree, (n) => {
    if (n.type === "element") out.push(n);
  });
  return out;
}

function classList(props: Record<string, unknown> | undefined): string[] {
  const cn = props?.className;
  if (Array.isArray(cn)) return cn.map(String);
  if (typeof cn === "string") return cn.split(/\s+/).filter(Boolean);
  return [];
}

function collectText(tree: HastNode): string {
  const parts: string[] = [];
  walk(tree, (n) => {
    if (n.type === "text" && n.value) parts.push(n.value);
  });
  return parts.join("");
}

function propertyNames(tree: HastNode): string[] {
  const keys: string[] = [];
  walk(tree, (n) => {
    if (n.properties) keys.push(...Object.keys(n.properties));
  });
  return keys;
}

function sanitizeTree(tree: HastNode): HastNode {
  const run = rehypeSanitize(markdownSanitizeSchema);
  return run(tree as never) as HastNode;
}

function toHast(markdown: string): HastNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processor = unified().use(remarkParse) as any;
  for (const plugin of sharedRemarkPlugins) {
    if (Array.isArray(plugin)) processor.use(plugin[0], plugin[1]);
    else processor.use(plugin);
  }
  processor.use(remarkRehype, { allowDangerousHtml: true });
  for (const plugin of sharedRehypePlugins) {
    if (Array.isArray(plugin)) processor.use(plugin[0], plugin[1]);
    else processor.use(plugin);
  }
  return processor.runSync(processor.parse(markdown)) as HastNode;
}

function pluginName(plugin: unknown): string {
  const fn = Array.isArray(plugin) ? plugin[0] : plugin;
  return typeof fn === "function" ? (fn.name ?? "") : "";
}

test("schema 放行全部正文 DSL 标签", () => {
  const tags = new Set(markdownSanitizeSchema.tagNames ?? []);
  for (const tag of MARKDOWN_DSL_TAGS) {
    assert.ok(tags.has(tag), `missing DSL tag ${tag}`);
  }
  assert.ok(tags.has(CITE_REF_TAG), "missing cite-ref");
});

test("schema 不放行 script，并列入 strip", () => {
  assert.ok(!(markdownSanitizeSchema.tagNames ?? []).includes("script"));
  assert.ok((markdownSanitizeSchema.strip ?? []).includes("script"));
});

test("HAST：script 节点被剥掉且内容不提升为兄弟文本", () => {
  const clean = sanitizeTree({
    type: "root",
    children: [
      { type: "element", tagName: "p", properties: {}, children: [{ type: "text", value: "safe" }] },
      {
        type: "element",
        tagName: "script",
        properties: {},
        children: [{ type: "text", value: "ignored" }],
      },
      { type: "element", tagName: "p", properties: {}, children: [{ type: "text", value: "text" }] },
    ],
  });
  assert.deepEqual(
    elements(clean).map((n) => n.tagName),
    ["p", "p"],
  );
  assert.equal(collectText(clean), "safetext");
});

test("HAST：onclick / onerror 等事件属性被剥掉", () => {
  const clean = sanitizeTree({
    type: "root",
    children: [
      {
        type: "element",
        tagName: "img",
        properties: { src: "x", alt: "demo", onclick: "1", onerror: "1", onClick: "1", onError: "1" },
        children: [],
      },
    ],
  });
  const img = elements(clean).find((n) => n.tagName === "img");
  assert.ok(img);
  const keys = Object.keys(img.properties ?? {});
  assert.ok(!keys.some((k) => /^on/i.test(k)), `event props remain: ${keys.join(",")}`);
  assert.equal(img.properties?.src, "x");
});

test("shared rehype 管线顺序：raw → sanitize → katex", () => {
  const names = sharedRehypePlugins.map(pluginName);
  const raw = names.findIndex((n) => /raw/i.test(n));
  const sanitize = names.findIndex((n) => /sanitize/i.test(n));
  const katex = names.findIndex((n) => /katex/i.test(n));
  assert.ok(raw >= 0 && sanitize >= 0 && katex >= 0, `plugins: ${names.join(",")}`);
  assert.ok(raw < sanitize && sanitize < katex, `order: ${names.join(",")}`);
});

test("管线：markdown 内 script 不进入 HAST", () => {
  const tree = toHast("safe <script>ignored</script> text");
  assert.ok(!elements(tree).some((n) => n.tagName === "script"));
  const text = collectText(tree);
  assert.match(text, /safe/);
  assert.match(text, /text/);
  assert.doesNotMatch(text, /ignored/);
});

test("管线：原始 HTML 的 onclick / onerror 不进入 HAST", () => {
  const tree = toHast('<p id="probe" onclick="1" onerror="1" onmouseover="1">safe</p>');
  const probe = elements(tree).find((n) => n.properties?.id === "probe");
  assert.ok(probe, "expected #probe paragraph");
  const keys = propertyNames(probe);
  assert.ok(!keys.some((k) => /^on/i.test(k)), `event props remain: ${keys.join(",")}`);
  assert.equal(collectText(probe), "safe");
});

test("管线：:::definition 仍转为 callout", () => {
  const tree = toHast(":::definition{label=Term}\nbody text\n:::");
  const callout = elements(tree).find((n) => n.tagName === "callout");
  assert.ok(callout, "expected callout");
  assert.equal(callout.properties?.kind, "definition");
  assert.equal(callout.properties?.label, "Term");
  assert.match(collectText(callout), /body text/);
});

test("管线：KaTeX 仍渲染公式", () => {
  const tree = toHast("inline $E=mc^2$");
  const katex = elements(tree).some((n) => classList(n.properties).includes("katex"));
  assert.ok(katex, "expected .katex node");
});

test("显式语言高亮、未知语言纯文本及 mhchem 化学式保持可读", () => {
  const markdown = "```python\nprint(1)\n```\n\n```unknown-study-lang\na < b\n```\n\n$\\ce{H2O}$";
  const tree = toHast(markdown);
  const code = elements(tree).filter((node) => node.tagName === "code");
  assert.equal(code.length, 2);
  assert.ok(elements(code[0]).some((node) => classList(node.properties).some((name) => name.startsWith("hljs-"))));
  assert.match(collectText(code[1]), /a < b/);
  assert.ok(elements(tree).some((node) => classList(node.properties).includes("katex")));
  assert.match(collectText(tree), /H₂O|H2O/);
});

test("管线：::figure 仍转为 figuremedia", () => {
  const tree = toHast("::figure{src=/img.png alt=demo caption=cap}");
  const figure = elements(tree).find((n) => n.tagName === "figuremedia");
  assert.ok(figure, "expected figuremedia");
  assert.equal(figure.properties?.src, "/img.png");
  assert.equal(figure.properties?.alt, "demo");
  assert.equal(figure.properties?.caption, "cap");
});

test("管线：::plot 仍转为 functionplot", () => {
  const tree = toHast("::plot{fn=x xmin=-1 xmax=1}");
  const plot = elements(tree).find((n) => n.tagName === "functionplot");
  assert.ok(plot, "expected functionplot");
  assert.equal(plot.properties?.fn, "x");
  assert.equal(plot.properties?.xmin, "-1");
  assert.equal(plot.properties?.xmax, "1");
});

test("管线：details/summary 仍保留（笔记页 HTML）", () => {
  const tree = toHast("<details><summary>head</summary>tail</details>");
  const tags = elements(tree).map((n) => n.tagName);
  assert.ok(tags.includes("details"));
  assert.ok(tags.includes("summary"));
  assert.match(collectText(tree), /head/);
  assert.match(collectText(tree), /tail/);
});

test("管线：原始 HTML 的任意 class 被剥掉（DOM 逃逸防线）", () => {
  const tree = toHast(
    '<div class="chat-input-container evil" id="keep-me">inj</div>\n\n' +
    '<span class="image-lightbox-backdrop">x</span>\n\n' +
    '<svg class="evil" viewBox="0 0 1 1"><circle class="x" r="1"/></svg>',
  );
  // 注入的 App 类名一律剥掉：消息内容不得伪装成应用组件。
  for (const n of elements(tree)) {
    const cls = classList(n.properties);
    assert.ok(!cls.some((c) => ["chat-input-container", "evil", "image-lightbox-backdrop", "x"].includes(c)),
      `class leaked on <${n.tagName}>: ${cls.join(",")}`);
  }
  // 元素本身保留（不剥标签），仅丢属性。
  assert.ok(elements(tree).some((n) => n.tagName === "div"));
  assert.ok(elements(tree).some((n) => n.properties?.id === "keep-me"));
  assert.ok(elements(tree).some((n) => n.tagName === "svg"));
  assert.ok(elements(tree).some((n) => n.tagName === "circle"));
});

test("管线：管线自身产出的 class token 保留（math/language/task）", () => {
  const tree = toHast("```js\nconst a=1;\n```\n\n```weird-lang\nx\n```\n\n- [ ] t\n\nmath $x^2$");
  const allTokens = elements(tree).flatMap((n) => classList(n.properties));
  assert.ok(allTokens.includes("language-js"), `tokens: ${allTokens.join(",")}`);
  assert.ok(allTokens.includes("language-weird-lang"), `tokens: ${allTokens.join(",")}`);
  assert.ok(allTokens.includes("contains-task-list"), `tokens: ${allTokens.join(",")}`);
  assert.ok(allTokens.includes("task-list-item"), `tokens: ${allTokens.join(",")}`);
  // KaTeX 渲染后 code.math-inline 变成 .katex 结构
  assert.ok(elements(tree).some((n) => classList(n.properties).includes("katex")), `tokens: ${allTokens.join(",")}`);
});
