import { describe, expect, it } from "vitest";
import type { ModelInfo } from "@/lib/ai/models";
import { currentStopIndex, thinkingStopIds, valueForStop } from "./thinkingStops";

const base = { id: "m", label: "M", hint: "" } as unknown as ModelInfo;
const model = (patch: Partial<ModelInfo>): ModelInfo => ({ ...base, ...patch }) as ModelInfo;

describe("thinkingStops", () => {
  it("不支持思考的模型没有档位", () => {
    expect(thinkingStopIds(model({ thinking: false }))).toEqual([]);
    expect(thinkingStopIds(undefined)).toEqual([]);
  });

  it("可关闭 + 有强度档：关 + 模型自己的档位", () => {
    expect(thinkingStopIds(model({ thinking: true, thinkingLevels: ["low", "medium", "high", "max"] }))).toEqual([
      "off", "low", "medium", "high", "max",
    ]);
    expect(thinkingStopIds(model({ thinking: true, thinkingLevels: ["high", "max"] }))).toEqual(["off", "high", "max"]);
  });

  it("必须思考的模型没有“关”", () => {
    expect(thinkingStopIds(model({ thinking: true, thinkingRequired: true, thinkingLevels: ["low", "high"] }))).toEqual(["low", "high"]);
    expect(thinkingStopIds(model({ thinking: true, thinkingRequired: true, thinkingLevels: [] }))).toEqual(["on"]);
  });

  it("只能开关的模型是 关 / 开 两档", () => {
    expect(thinkingStopIds(model({ thinking: true, thinkingLevels: [] }))).toEqual(["off", "on"]);
  });

  it("当前值映射到档位，并把越界强度收敛到合法档", () => {
    const m = model({ thinking: true, thinkingLevels: ["high", "max"] });
    const stops = thinkingStopIds(m);
    expect(currentStopIndex(m, stops, { enabled: false, effort: "high" })).toBe(0);
    expect(currentStopIndex(m, stops, { enabled: true, effort: "max" })).toBe(2);
    expect(currentStopIndex(m, stops, { enabled: true, effort: "low" })).toBe(1);
  });

  it("档位写回值：关闭时保留上次强度", () => {
    expect(valueForStop("off", { enabled: true, effort: "max" })).toEqual({ enabled: false, effort: "max" });
    expect(valueForStop("on", { enabled: false, effort: "low" })).toEqual({ enabled: true, effort: "low" });
    expect(valueForStop("high", { enabled: false, effort: "low" })).toEqual({ enabled: true, effort: "high" });
  });
});
