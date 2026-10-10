import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampMaxWaitMs,
  createStallWatchdog,
  DEFAULT_MAX_WAIT_MS,
  MAX_MAX_WAIT_MS,
  MIN_MAX_WAIT_MS,
} from "./createStallWatchdog.ts";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("createStallWatchdog：超时后触发 onStall，且只触发一次", async () => {
  const reasons: string[] = [];
  const watchdog = createStallWatchdog((reason) => {
    reasons.push(reason);
  }, 20, 8);
  await wait(50);
  watchdog.stop();
  assert.deepEqual(reasons, ["idle"]);
});

test("createStallWatchdog：touch 会推迟超时", async () => {
  let count = 0;
  const watchdog = createStallWatchdog(() => {
    count += 1;
  }, 40, 8);
  await wait(20);
  watchdog.touch();
  await wait(20);
  watchdog.stop();
  assert.equal(count, 0);
});

test("createStallWatchdog：持续有活动也会撞「最长等待时间」总闸", async () => {
  const reasons: string[] = [];
  const watchdog = createStallWatchdog(
    (reason) => {
      reasons.push(reason);
    },
    { idleTimeoutMs: 10_000, maxWaitMs: 30, intervalMs: 8 },
  );
  // 每 10ms touch 一次：idle 永不触发，但总时长会先到顶。
  for (let i = 0; i < 8; i++) {
    await wait(10);
    watchdog.touch();
  }
  watchdog.stop();
  assert.deepEqual(reasons, ["max-wait"]);
});

test("createStallWatchdog：maxWaitMs=0 表示不设总时长上限", async () => {
  let count = 0;
  const watchdog = createStallWatchdog(
    () => {
      count += 1;
    },
    { idleTimeoutMs: 10_000, maxWaitMs: 0, intervalMs: 5 },
  );
  for (let i = 0; i < 6; i++) {
    await wait(10);
    watchdog.touch();
  }
  watchdog.stop();
  assert.equal(count, 0);
});

test("clampMaxWaitMs：收敛到 [60s, 600s]，非法值回默认", () => {
  assert.equal(clampMaxWaitMs(undefined), DEFAULT_MAX_WAIT_MS);
  assert.equal(clampMaxWaitMs("abc"), DEFAULT_MAX_WAIT_MS);
  assert.equal(clampMaxWaitMs(0), DEFAULT_MAX_WAIT_MS);
  assert.equal(clampMaxWaitMs(1_000), MIN_MAX_WAIT_MS);
  assert.equal(clampMaxWaitMs(9_000_000), MAX_MAX_WAIT_MS);
  assert.equal(clampMaxWaitMs(120_000), 120_000);
  // 设置页是"秒 × 1000"，但手改过的 localStorage 可能带小数毫秒：四舍五入即可。
  assert.equal(clampMaxWaitMs(180_400.6), 180_401);
  assert.equal(clampMaxWaitMs(DEFAULT_MAX_WAIT_MS), DEFAULT_MAX_WAIT_MS);
});
