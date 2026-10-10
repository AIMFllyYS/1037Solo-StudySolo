import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  IMAGE_GEN_PROGRESS_CEILING,
  estimateImageGenProgress,
  seededUnit,
} from "./imageGenProgress.ts";

const START = 1_700_000_000_000;

function at(offsetMs: number, overrides: Partial<Parameters<typeof estimateImageGenProgress>[0]> = {}) {
  return estimateImageGenProgress({
    status: "loading",
    startedAt: START,
    expectedMs: 100_000,
    now: START + offsetMs,
    seed: "session-a",
    ...overrides,
  });
}

describe("estimateImageGenProgress", () => {
  test("进度单调上升，且自己永远不冲到 100%", () => {
    let previous = 0;
    for (const offset of [0, 500, 2_000, 10_000, 30_000, 60_000, 100_000, 200_000, 900_000]) {
      const { percent } = at(offset);
      assert.ok(percent >= previous, `${offset}ms 时进度倒退了：${percent} < ${previous}`);
      assert.ok(percent <= IMAGE_GEN_PROGRESS_CEILING, `${offset}ms 时超过 99%：${percent}`);
      previous = percent;
    }
    // 远超预期之后必须稳稳停在 99%（卡住效果），而不是慢慢逼近 100。
    assert.equal(at(10 * 60_000).percent, IMAGE_GEN_PROGRESS_CEILING);
    assert.equal(at(10 * 60_000).stalled, true);
  });

  test("前期涨得快：一秒左右已经能看到明显进度", () => {
    assert.ok(at(1_000).percent >= 3, `1s 时进度太小：${at(1_000).percent}`);
    assert.ok(at(1_000).percent < 40, "前期不能一下冲到一半");
  });

  test("done 直接 100%，idle / error 归零", () => {
    assert.deepEqual(at(5_000, { status: "done" }), { percent: 100, elapsedMs: 0, remainingMs: 0, stalled: false });
    assert.equal(at(5_000, { status: "idle" }).percent, 0);
    assert.equal(at(5_000, { status: "error" }).percent, 0);
  });

  test("剩余时间是「预期 - 已等待」，用完就归零", () => {
    assert.equal(at(30_000).remainingMs, 70_000);
    assert.equal(at(150_000).remainingMs, 0);
    assert.equal(at(150_000).stalled, true);
  });

  test("慢模型（xhuoai 100–400s）与快模型（ERNIE 10–40s）用各自的时间常数", () => {
    const slowSeed = "slow-session";
    const slow = estimateImageGenProgress({
      status: "loading", startedAt: START, expectedMs: 200_000, now: START + 20_000, seed: slowSeed,
    });
    const fast = estimateImageGenProgress({
      status: "loading", startedAt: START, expectedMs: 25_000, now: START + 20_000, seed: slowSeed,
    });
    assert.ok(fast.percent > slow.percent, "同一个时刻，快模型应显示更高进度");
  });

  test("随机系数按会话 id 固定：同一会话多次计算完全一致", () => {
    assert.equal(at(12_345).percent, at(12_345).percent);
    assert.equal(seededUnit("session-a"), seededUnit("session-a"));
    assert.notEqual(seededUnit("session-a"), seededUnit("session-b"));
    for (const seed of ["a", "bb", "会话-c", "x".repeat(50)]) {
      const unit = seededUnit(seed);
      assert.ok(unit >= 0 && unit < 1, seed);
    }
    // 不同会话的曲线略有差异（这就是"随机数估算"），但都不会越界。
    const a = at(20_000, { seed: "session-a" }).percent;
    const b = at(20_000, { seed: "session-b" }).percent;
    assert.ok(Math.abs(a - b) <= 12, `两个会话的差异应有限：${a} vs ${b}`);
  });

  test("缺少 expectedMs / startedAt 时用兜底值，不炸也不越界", () => {
    const noMeta = estimateImageGenProgress({ status: "loading", now: START, seed: "s" });
    assert.ok(noMeta.percent >= 1 && noMeta.percent <= IMAGE_GEN_PROGRESS_CEILING);
    assert.equal(noMeta.remainingMs, 60_000);
  });
});
