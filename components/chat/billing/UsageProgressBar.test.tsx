import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UsageProgressBar } from "./UsageProgressBar";

describe("UsageProgressBar", () => {
  it("keeps completion tone on the primary color instead of quota risk colors", () => {
    render(
      <UsageProgressBar
        ratio={0.9}
        ariaLabel="章节进度"
        tone="completion"
        valueNow={9}
        valueMax={10}
      />,
    );
    const bar = screen.getByRole("progressbar", { name: "章节进度" });
    expect(bar).toHaveAttribute("data-tone", "completion");
    expect(bar).not.toHaveAttribute("data-risk-level");
    expect(bar).toHaveAttribute("aria-valuenow", "9");
    expect(bar).toHaveAttribute("aria-valuemax", "10");
  });
});
