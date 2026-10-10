import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_RATE_LIMIT_MAX,
  AI_RATE_LIMIT_WINDOW_MS,
  consumeRateLimit,
  resetRateLimitStore,
} from "./rateLimit.ts";

test("consumeRateLimit rejects the request after the window max", () => {
  resetRateLimitStore();
  const now = 1_000_000;
  assert.equal(consumeRateLimit("user:a", { now, max: 2, windowMs: 60_000 }).ok, true);
  assert.equal(consumeRateLimit("user:a", { now, max: 2, windowMs: 60_000 }).ok, true);
  const blocked = consumeRateLimit("user:a", { now, max: 2, windowMs: 60_000 });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.retryAfterSec, 60);
});

test("consumeRateLimit isolates keys and resets after the window", () => {
  resetRateLimitStore();
  const now = 5_000_000;
  assert.equal(consumeRateLimit("user:a", { now, max: 1, windowMs: 1_000 }).ok, true);
  assert.equal(consumeRateLimit("user:a", { now, max: 1, windowMs: 1_000 }).ok, false);
  assert.equal(consumeRateLimit("user:b", { now, max: 1, windowMs: 1_000 }).ok, true);
  assert.equal(consumeRateLimit("user:a", { now: now + 1_000, max: 1, windowMs: 1_000 }).ok, true);
});

test("default AI rate limit is 30 requests per 60s", () => {
  assert.equal(AI_RATE_LIMIT_MAX, 30);
  assert.equal(AI_RATE_LIMIT_WINDOW_MS, 60_000);
});
