import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { shouldAutoEnableSearch } from "./autoEnable.ts";

describe("shouldAutoEnableSearch：需要搜索就自动联网", () => {
  test("实时 / 时间性 / 数据类问题要开", () => {
    for (const q of [
      "上海今天天气怎么样",
      "现在美元兑人民币汇率多少",
      "最新的 iPhone 价格是多少",
      "2026 年诺贝尔物理学奖颁给谁了",
      "帮我查一下这个政策",
      "2027 年考研报名时间",
      "发布会什么时候",
    ]) {
      assert.equal(shouldAutoEnableSearch(q), true, q);
    }
  });

  test("纯知识讲解不开（省钱）", () => {
    for (const q of [
      "什么是熵",
      "讲讲动作电位的机制",
      "这道题怎么推导",
      "帮我总结一下这一章",
      "细胞膜的结构是什么",
    ]) {
      assert.equal(shouldAutoEnableSearch(q), false, q);
    }
  });

  test("明确要求图片检索时为本轮开放联网工具", () => {
    assert.equal(shouldAutoEnableSearch("请调用 imageSearch 检索图片并解释第一心音"), true);
    assert.equal(shouldAutoEnableSearch("搜索图片来说明瓣膜位置"), true);
  });

  test("含「最新」但其实是讲解的，排除", () => {
    assert.equal(shouldAutoEnableSearch("讲讲最新的研究进展是什么"), false);
    assert.equal(shouldAutoEnableSearch("讲解一下这个机制"), false);
  });

  test("空串 / 超长请求不开", () => {
    assert.equal(shouldAutoEnableSearch(""), false);
    assert.equal(shouldAutoEnableSearch("   "), false);
    assert.equal(shouldAutoEnableSearch("今天".repeat(200)), false);
  });
});
