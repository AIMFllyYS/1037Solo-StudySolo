import { describe, expect, it, vi } from "vitest";
import { expandAgentDockIfCollapsed, PANEL_PRESETS, nestedShares, type PanelPresetKey } from "./panelPresets";

const KEYS = Object.keys(PANEL_PRESETS) as PanelPresetKey[];

describe("panelPresets", () => {
  it("右栏展开时三列相加正好占满窗口", () => {
    for (const key of KEYS) {
      const preset = PANEL_PRESETS[key];
      if (preset.right === 0) continue;
      expect(preset.left + preset.center + preset.right, key).toBe(100);
    }
  });

  it("Agent 预设将约 3/5 留给独立右侧工作区", () => {
    expect(PANEL_PRESETS.agent).toEqual({ left: 14, center: 26, right: 60, rightExpanded: 60 });
    expect(PANEL_PRESETS.agent.left + PANEL_PRESETS.agent.center).toBe(40);
  });

  it("Studio 保持改造前的现值（左 19 / 中 50 / 右 31，article 默认收起）", () => {
    expect(PANEL_PRESETS["studio:full"]).toEqual({ left: 19, center: 50, right: 31, rightExpanded: 31 });
    expect(PANEL_PRESETS["studio:article"].right).toBe(0);
    expect(PANEL_PRESETS["studio:article"].rightExpanded).toBe(31);
    expect(PANEL_PRESETS["studio:reference"].right).toBe(31);
    expect(PANEL_PRESETS["studio:no-right"].center).toBe(81);
  });

  it("嵌套分组换算：Agent 内层宽屏比例为左 35% / 中 65%", () => {
    const shares = nestedShares(PANEL_PRESETS.agent);
    expect(shares.left).toBe(35);
    expect(shares.center).toBe(65);
    expect(shares.left + shares.center).toBe(100);
  });

  it("首次展开空收起面板时使用60%默认；已展开面板不改用户尺寸", () => {
    const expand = vi.fn();
    const panel = { isCollapsed: vi.fn(() => true), expand };
    expandAgentDockIfCollapsed(panel);
    expect(expand).toHaveBeenCalledWith(60);

    panel.isCollapsed.mockReturnValue(false);
    expand.mockClear();
    expandAgentDockIfCollapsed(panel);
    expect(expand).not.toHaveBeenCalled();
  });
});
