import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMinimumSkeleton } from "./useMinimumSkeleton";

function Probe({ ready, durationMs }: { ready: boolean; durationMs?: number }) {
  const skeleton = useMinimumSkeleton({
    ready,
    ...(durationMs === undefined ? {} : { durationMs }),
  });
  return <span data-testid="state">{skeleton ? "skeleton" : "content"}</span>;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useMinimumSkeleton", () => {
  it("数据就绪也要压满最小时长：900ms 之前骨架、之后内容", () => {
    render(<Probe ready />);
    expect(screen.getByTestId("state")).toHaveTextContent("skeleton");

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId("state")).toHaveTextContent("skeleton");

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByTestId("state")).toHaveTextContent("content");
  });

  it("数据没就绪时，时间到了也继续骨架（该等就等）", () => {
    const view = render(<Probe ready={false} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId("state")).toHaveTextContent("skeleton");

    view.rerender(<Probe ready />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("state")).toHaveTextContent("content");
  });

  it("durationMs=0 表示不压时长（有数据就直接上内容）", () => {
    render(<Probe ready durationMs={0} />);
    expect(screen.getByTestId("state")).toHaveTextContent("content");
  });
});