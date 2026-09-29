import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToolsSection } from "./ToolsSection";
import { useSettings } from "@/lib/stores/settings";

afterEach(() => {
  cleanup();
  useSettings.getState().setMaxToolRounds(6);
  useSettings.getState().setMaxWaitMs(300_000);
  useSettings.getState().setMaxOutputTokens(0);
  useSettings.getState().setTurnBudgetCredits(0);
});

describe("ToolsSection", () => {
  it("单次输出上限：默认 0 = 跟随模型，失焦才提交并夹到合法范围", () => {
    render(<ToolsSection />);
    const input = screen.getByTestId("max-output-tokens");
    expect(input).toHaveValue(0);
    // 逐键输入不应在中途被夹成下限。
    fireEvent.change(input, { target: { value: "8" } });
    expect(useSettings.getState().maxOutputTokens).toBe(0);
    fireEvent.change(input, { target: { value: "8192" } });
    fireEvent.blur(input);
    expect(useSettings.getState().maxOutputTokens).toBe(8192);
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.blur(input);
    expect(useSettings.getState().maxOutputTokens).toBe(1024);
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(useSettings.getState().maxOutputTokens).toBe(0);
  });

  it("单轮预算上限：默认 0 = 服务端上限，可设小数积分", () => {
    render(<ToolsSection />);
    const input = screen.getByTestId("turn-budget-credits");
    expect(input).toHaveValue(0);
    fireEvent.change(input, { target: { value: "2.5" } });
    fireEvent.blur(input);
    expect(useSettings.getState().turnBudgetCredits).toBe(2.5);
    fireEvent.change(input, { target: { value: "-3" } });
    fireEvent.blur(input);
    expect(useSettings.getState().turnBudgetCredits).toBe(0);
  });

  it("可以改最大工具调用轮数并写入 store", () => {
    render(<ToolsSection />);
    const input = screen.getByTestId("max-tool-rounds");
    expect(input).toHaveAttribute("max", "20");
    expect(input).toHaveValue(6);
    expect(screen.getByTestId("max-tool-rounds-hint")).toHaveTextContent("推荐 6 轮");
    fireEvent.change(input, { target: { value: "10" } });
    expect(useSettings.getState().maxToolRounds).toBe(10);
    fireEvent.change(input, { target: { value: "20" } });
    expect(useSettings.getState().maxToolRounds).toBe(20);
  });

  it("可以改最长等待时间（秒 → 毫秒，并被 clamp 收口）", () => {
    render(<ToolsSection />);
    const input = screen.getByTestId("max-wait-seconds");
    expect(input).toHaveAttribute("min", "60");
    expect(input).toHaveAttribute("max", "600");
    expect(input).toHaveValue(300);

    fireEvent.change(input, { target: { value: "480" } });
    expect(useSettings.getState().maxWaitMs).toBe(480_000);

    // 低于下限 / 高于上限都收敛到边界，而不是写进一个不可能的值。
    fireEvent.change(input, { target: { value: "5" } });
    expect(useSettings.getState().maxWaitMs).toBe(60_000);
    fireEvent.change(input, { target: { value: "9999" } });
    expect(useSettings.getState().maxWaitMs).toBe(600_000);
  });
});
