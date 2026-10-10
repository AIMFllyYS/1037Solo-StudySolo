import { describe, expect, it } from "vitest";
import { MODELS } from "@/lib/ai/models";
import { FAST_MODE_PAIRS, fastModeCounterpart, isFastVariant, supportsFastMode } from "./fastModeRegistry";

describe("fastModeRegistry", () => {
  it("每个登记的 id 都是真实存在的模型", () => {
    const ids = new Set(MODELS.map((model) => model.id));
    for (const pair of FAST_MODE_PAIRS) {
      expect(ids.has(pair.base), pair.base).toBe(true);
      expect(ids.has(pair.fast), pair.fast).toBe(true);
    }
  });

  it("MiMo 和 DeepSeek 的 Fast 变体互为配对，其它模型不支持", () => {
    expect(fastModeCounterpart("mimo-v2.6-pro")).toBe("xiaomi/mimo-v2.6-pro-ultraspeed");
    expect(fastModeCounterpart("xiaomi/mimo-v2.6-pro-ultraspeed")).toBe("mimo-v2.6-pro");
    expect(isFastVariant("xiaomi/mimo-v2.6-pro-ultraspeed")).toBe(true);
    expect(isFastVariant("mimo-v2.6-pro")).toBe(false);
    expect(fastModeCounterpart("deepseek/deepseek-v4.1-flash")).toBe("deepseek/deepseek-v4.1-flash-fast");
    expect(fastModeCounterpart("deepseek/deepseek-v4.1-flash-fast")).toBe("deepseek/deepseek-v4.1-flash");
    expect(supportsFastMode("deepseek/deepseek-v4.1-flash")).toBe(true);
    expect(supportsFastMode("z-ai/glm-5.3-flash")).toBe(false);
  });

  it("一个 id 不会同时出现在两个配对里", () => {
    const all = FAST_MODE_PAIRS.flatMap((pair) => [pair.base, pair.fast]);
    expect(new Set(all).size).toBe(all.length);
  });
});
