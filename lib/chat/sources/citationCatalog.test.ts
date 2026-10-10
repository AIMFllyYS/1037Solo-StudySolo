import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectCitationCatalog,
  parseCiteIndexes,
} from "./citationCatalog.ts";
import type { ChatMessagePart } from "@/lib/types/chat";

test("parseCiteIndexes 接受单个、逗号列表，去掉非法与重复", () => {
  assert.deepEqual(parseCiteIndexes("1"), [1]);
  assert.deepEqual(parseCiteIndexes("1, 3,2"), [1, 3, 2]);
  assert.deepEqual(parseCiteIndexes("1,1,99"), [1, 99]);
  assert.deepEqual(parseCiteIndexes("0,100,foo"), []);
});

test("collectCitationCatalog 使用工具写入的 citeIndex，不受 part 顺序影响", () => {
  const parts = [
    {
      type: "tool-getSection",
      toolCallId: "s",
      state: "output-available",
      input: { path: "histology/textbook/ch02-1" },
      output: {
        text: "上皮",
        found: true,
        title: "被覆上皮",
        path: "histology/textbook/ch02-1",
        citeIndex: 3,
        contextKey: "section:histology/textbook/ch02-1",
      },
    },
    {
      type: "tool-webSearch",
      toolCallId: "w",
      state: "output-available",
      input: { query: "核糖体" },
      output: {
        text: "ok",
        sources: [
          { title: "维基", url: "https://example.edu/a", snippet: "蛋白质合成", citeIndex: 1 },
          { title: "教材站", url: "https://example.edu/b", snippet: "", citeIndex: 2 },
        ],
      },
    },
  ] as ChatMessagePart[];

  const catalog = collectCitationCatalog(parts);
  assert.deepEqual(catalog.map((item) => item.index), [1, 2, 3]);
  assert.equal(catalog[0]?.kind, "web");
  assert.equal(catalog[0]?.url, "https://example.edu/a");
  assert.equal(catalog[2]?.kind, "note");
  assert.equal(catalog[2]?.path, "histology/textbook/ch02-1");
});

test("collectCitationCatalog 跳过去重回灌、未完成 part，旧消息按出现顺序兜底编号", () => {
  const parts = [
    {
      type: "tool-webSearch",
      toolCallId: "draft",
      state: "output-available",
      preliminary: true,
      input: { query: "草稿" },
      output: { text: "ok", sources: [{ title: "半成品", url: "https://example.edu/draft", snippet: "", citeIndex: 9 }] },
    },
    {
      type: "tool-searchNotes",
      toolCallId: "n",
      state: "output-available",
      input: { query: "贝叶斯" },
      output: {
        text: "ok",
        hits: [{ title: "贝叶斯", path: "probability/detail/1.4", snippet: "公式" }],
      },
    },
    {
      type: "tool-getSection",
      toolCallId: "dup",
      state: "output-available",
      input: { path: "probability/detail/1.4" },
      output: {
        text: "已加载",
        found: true,
        path: "probability/detail/1.4",
        citeIndex: 2,
        deduped: true,
      },
    },
  ] as ChatMessagePart[];

  const catalog = collectCitationCatalog(parts);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0]?.index, 1);
  assert.equal(catalog[0]?.path, "probability/detail/1.4");
});

test("collectCitationCatalog 忽略未绑定当前页的 getCurrentPage", () => {
  const parts = [
    {
      type: "tool-getCurrentPage",
      toolCallId: "p",
      state: "output-available",
      input: {},
      output: {
        text: "没有打开任何小节",
        contextKey: "page:probability//",
        found: false,
      },
    },
  ] as ChatMessagePart[];
  assert.deepEqual(collectCitationCatalog(parts), []);
});
