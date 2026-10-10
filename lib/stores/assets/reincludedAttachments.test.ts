import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { useReincludedAttachments } from "./reincludedAttachments.ts";

beforeEach(() => {
  useReincludedAttachments.setState({ bySession: {} });
});

describe("useReincludedAttachments", () => {
  test("标记 / 取消 / 查询", () => {
    const store = useReincludedAttachments.getState();
    assert.equal(store.isMarked("s1", "m1"), false);
    store.mark("s1", "m1");
    store.mark("s1", "m1");
    assert.equal(useReincludedAttachments.getState().isMarked("s1", "m1"), true);
    assert.deepEqual(useReincludedAttachments.getState().bySession.s1, ["m1"], "重复点不重复记");

    useReincludedAttachments.getState().unmark("s1", "m1");
    assert.equal(useReincludedAttachments.getState().isMarked("s1", "m1"), false);
    assert.equal(useReincludedAttachments.getState().bySession.s1, undefined, "空列表要清掉 key");
  });

  test("takeForRequest 读取即清空：意图只作用一轮", () => {
    const store = useReincludedAttachments.getState();
    store.mark("s1", "m1");
    store.mark("s1", "m2");
    assert.deepEqual(useReincludedAttachments.getState().takeForRequest("s1"), ["m1", "m2"]);
    assert.deepEqual(useReincludedAttachments.getState().takeForRequest("s1"), [], "第二次发送不该再带上");
  });

  test("会话之间互不影响", () => {
    const store = useReincludedAttachments.getState();
    store.mark("s1", "m1");
    store.mark("s2", "m2");
    assert.deepEqual(useReincludedAttachments.getState().takeForRequest("s1"), ["m1"]);
    assert.equal(useReincludedAttachments.getState().isMarked("s2", "m2"), true);
  });
});
