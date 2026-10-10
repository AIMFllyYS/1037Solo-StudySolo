import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectComposerTrigger,
  flattenFileMentions,
  listFileMentions,
  locateNavItem,
  replaceComposerTrigger,
} from "./fileMentions.ts";

const ctx = { subjectId: "probability", categoryId: "detail", itemId: "1.4" };

test("fileMentions：当前页附近是同级小节，父层级含章节", () => {
  const located = locateNavItem(ctx);
  assert.ok(located);
  assert.equal(located!.item.title.includes("古典"), true);
  assert.equal(located!.parent?.id, "ch01");
  const groups = listFileMentions(ctx);
  const nearby = groups.find((group) => group.id === "nearby");
  const parent = groups.find((group) => group.id === "parent");
  assert.ok(nearby);
  assert.ok(nearby!.items.some((item) => item.itemId === "1.4"));
  assert.ok(nearby!.items.some((item) => item.itemId === "1.3"));
  assert.ok(nearby!.items.some((item) => item.itemId === "1.5"));
  assert.ok(parent);
  assert.ok(parent!.items.some((item) => item.itemId === "ch01"));
  const self = nearby!.items.find((item) => item.itemId === "1.4")!;
  assert.match(self.address, /概率论/);
  assert.match(self.address, /详解/);
  assert.equal(self.path, "probability/detail/1.4");
});

test("fileMentions：# 查询可在当前分类定向选", () => {
  const groups = listFileMentions(ctx, "贝叶斯");
  const items = flattenFileMentions(groups);
  assert.ok(items.some((item) => item.itemId === "1.5"));
  assert.equal(items.every((item) => item.path.startsWith("probability/detail/")), true);
});

test("fileMentions：检测 / 与 # token，选中后清掉触发词", () => {
  assert.deepEqual(detectComposerTrigger("解释 #古", 5), { type: "hash", query: "古", start: 3 });
  assert.deepEqual(detectComposerTrigger("/计划", 3), { type: "slash", query: "计划", start: 0 });
  assert.equal(detectComposerTrigger("a/b", 3), null);
  assert.equal(replaceComposerTrigger("解释 #古 这一节", { type: "hash", query: "古", start: 3 }, 5), "解释  这一节");
});
