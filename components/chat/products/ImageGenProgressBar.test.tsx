import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ImageGenProgressBar from "./ImageGenProgressBar";

afterEach(cleanup);

describe("ImageGenProgressBar", () => {
  it("显示百分比与已等待秒数", () => {
    render(
      <ImageGenProgressBar
        progress={{ percent: 42, elapsedMs: 12_400, remainingMs: 30_000, stalled: false }}
      />,
    );
    const bar = screen.getByTestId("imagegen-progress");
    expect(bar).toHaveAttribute("data-percent", "42");
    expect(bar).toHaveAttribute("data-stalled", "false");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByText("已等待 12s")).toBeTruthy();
    expect(screen.getByText("预计还需约 30s")).toBeTruthy();
    // 进度条宽度跟着百分比走。
    const fill = bar.querySelector<HTMLElement>(".imagegen-progress-fill");
    expect(fill?.style.width).toBe("42%");
  });

  it("卡在 99% 时给出「仍在生成」的说明，并标记 stalled", () => {
    render(
      <ImageGenProgressBar progress={{ percent: 99, elapsedMs: 320_000, remainingMs: 0, stalled: true }} />,
    );
    const bar = screen.getByTestId("imagegen-progress");
    expect(bar).toHaveAttribute("data-stalled", "true");
    expect(screen.getByText("99%")).toBeTruthy();
    expect(screen.getByText("慢速模型可能要几分钟，仍在生成")).toBeTruthy();
    expect(bar.querySelector(".imagegen-progress-fill")?.className).toContain("is-stalled");
  });

  it("compact 模式（对话卡片内）复用同一组件", () => {
    render(
      <ImageGenProgressBar compact progress={{ percent: 7, elapsedMs: 3_000, remainingMs: 20_000, stalled: false }} />,
    );
    expect(screen.getByTestId("imagegen-progress").className).toContain("is-compact");
  });
});
