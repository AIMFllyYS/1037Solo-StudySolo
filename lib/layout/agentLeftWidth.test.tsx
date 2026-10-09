import { describe, expect, it } from "vitest";
import {
  agentLeftPercentForPx,
  clampAgentLeftPx,
  defaultAgentLeftPx,
  loadAgentLeftPx,
  saveAgentLeftPx,
} from "./agentLeftWidth";

describe("agent left width anchoring", () => {
  it("右侧面板变宽/变窄时，左栏像素宽度保持不变（换算回来的像素恒等）", () => {
    const leftPx = 280;
    // 窗口 1600：右栏 60% → 嵌套组 640；右栏 30% → 嵌套组 1120
    for (const group of [640, 800, 1120, 1400]) {
      const pct = agentLeftPercentForPx(leftPx, group)!;
      const px = (pct / 100) * group;
      // 只有触到 14%–40% 的上下限才允许偏离
      if (pct > 14 && pct < 40) expect(Math.abs(px - leftPx)).toBeLessThan(0.5);
    }
  });

  it("百分比被夹在 14–40 之间，组宽无效返回 null", () => {
    expect(agentLeftPercentForPx(1000, 800)).toBe(40);
    expect(agentLeftPercentForPx(50, 1000)).toBe(14);
    expect(agentLeftPercentForPx(280, 0)).toBeNull();
  });

  it("默认宽度与夹取", () => {
    expect(defaultAgentLeftPx(1000)).toBe(240);
    expect(defaultAgentLeftPx(3000)).toBe(340);
    expect(clampAgentLeftPx(10)).toBe(200);
    expect(clampAgentLeftPx(9999)).toBe(520);
  });

  it("持久化往返", () => {
    localStorage.clear();
    expect(loadAgentLeftPx(1600)).toBe(240);
    saveAgentLeftPx(300);
    expect(loadAgentLeftPx(1600)).toBe(300);
  });
});
