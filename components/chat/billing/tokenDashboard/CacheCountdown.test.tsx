import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { CacheCountdown } from "./CacheCountdown";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("cache estimate counts down, reports expiry and removes its interval on unmount", () => {
  const { unmount } = render(<CacheCountdown cacheTtlSec={2} lastRequestTime={Date.now()}
    lastTurn={{ promptTokens: 0, completionTokens: 0, cachedTokens: 0 }} turnCost={0} />);
  expect(screen.getByText("2s")).toBeVisible();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText("1s")).toBeVisible();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText("缓存可能已过期，下次请求将按全价计费")).toBeVisible();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
