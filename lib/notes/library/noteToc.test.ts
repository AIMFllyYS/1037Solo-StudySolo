import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNoteToc, scrollCrepeHeading, slugHeading, stripMdInline } from "./noteToc.ts";

test("parseNoteToc 抽出一到三级标题并去重 slug", () => {
  const items = parseNoteToc(`# 被覆上皮

引言

## 分类

### 单层

## 分类

#### 太深不收录
`);
  assert.deepEqual(
    items.map((item) => ({ level: item.level, title: item.title, id: item.id })),
    [
      { level: 1, title: "被覆上皮", id: "被覆上皮" },
      { level: 2, title: "分类", id: "分类" },
      { level: 3, title: "单层", id: "单层" },
      { level: 2, title: "分类", id: "分类-2" },
    ],
  );
});

test("parseNoteToc 忽略空文档与纯文本", () => {
  assert.deepEqual(parseNoteToc(""), []);
  assert.deepEqual(parseNoteToc("没有标题的一段话"), []);
});

test("parseNoteToc skips fenced code and includes setext headings", () => {
  const items = parseNoteToc("# 正文标题\n\n```md\n## 代码样例\n```\n\n下划线标题\n---\n\n## 正文二级");
  assert.deepEqual(items.map((item) => [item.level, item.title]), [
    [1, "正文标题"],
    [2, "下划线标题"],
    [2, "正文二级"],
  ]);
});

test("stripMdInline 去掉强调与链接", () => {
  assert.equal(stripMdInline("**[肾单位](x)**"), "肾单位");
  assert.equal(slugHeading("Hello World!"), "hello-world");
});

test("scrollCrepeHeading navigates duplicate headings by occurrence and respects reduced motion", () => {
  const firstCall = { calls: [] as unknown[] };
  const firstScroll = {
    scrollIntoView: (options: unknown) => firstCall.calls.push(options),
  } as unknown as HTMLElement;
  const secondCall = { calls: [] as unknown[] };
  const secondScroll = {
    scrollIntoView: (options: unknown) => secondCall.calls.push(options),
  } as unknown as HTMLElement;
  Object.defineProperty(firstScroll, "textContent", { value: "重复标题" });
  Object.defineProperty(secondScroll, "textContent", { value: "重复标题" });
  const root = { querySelectorAll: () => [firstScroll, secondScroll] } as unknown as HTMLElement;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: true }) },
  });
  try {
    assert.equal(scrollCrepeHeading(root, "重复标题", 1), true);
    assert.deepEqual(secondCall.calls, [{ block: "start", behavior: "auto" }]);
    assert.equal(scrollCrepeHeading(root, "不存在"), false);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
