import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ResizableRail from "./ResizableRail";

const KEY = "test-rail-width";

function setup(props: Partial<React.ComponentProps<typeof ResizableRail>> = {}) {
  return render(
    <ResizableRail storageKey={KEY} defaultWidth={300} minWidth={200} maxWidth={400} ariaLabel="调整侧栏宽度" {...props}>
      <div>侧栏内容</div>
    </ResizableRail>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("ResizableRail", () => {
  it("首帧用默认宽度，separator 暴露当前值与范围", () => {
    setup();
    const handle = screen.getByRole("separator", { name: "调整侧栏宽度" });
    expect(handle).toHaveAttribute("aria-valuenow", "300");
    expect(handle).toHaveAttribute("aria-valuemin", "200");
    expect(handle).toHaveAttribute("aria-valuemax", "400");
  });

  it("方向键调宽并写入本机；Shift 步长更大；到极值就停", () => {
    setup();
    const handle = screen.getByTestId("rail-resize-handle");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle).toHaveAttribute("aria-valuenow", "316");
    expect(window.localStorage.getItem(KEY)).toBe("316");
    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(handle).toHaveAttribute("aria-valuenow", "364");
    fireEvent.keyDown(handle, { key: "End" });
    expect(handle).toHaveAttribute("aria-valuenow", "400");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle).toHaveAttribute("aria-valuenow", "200");
  });

  it("双击还原默认宽度并清掉记忆", () => {
    window.localStorage.setItem(KEY, "380");
    setup();
    const handle = screen.getByTestId("rail-resize-handle");
    expect(handle).toHaveAttribute("aria-valuenow", "380");
    fireEvent.doubleClick(handle);
    expect(handle).toHaveAttribute("aria-valuenow", "300");
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("记忆的宽度被夹在范围内；收起时没有拖拽把手，展开后回到记忆值", () => {
    window.localStorage.setItem(KEY, "9999");
    const { rerender } = setup();
    expect(screen.getByTestId("rail-resize-handle")).toHaveAttribute("aria-valuenow", "400");
    rerender(
      <ResizableRail storageKey={KEY} defaultWidth={300} minWidth={200} maxWidth={400} ariaLabel="调整侧栏宽度" collapsed collapsedWidth={44}>
        <div>侧栏内容</div>
      </ResizableRail>,
    );
    expect(screen.queryByTestId("rail-resize-handle")).toBeNull();
    expect(screen.getByText("侧栏内容").closest("[data-rail-collapsed]")).toHaveStyle({ width: "44px" });
  });

  it("别的标签页改了宽度，这里跟着变", () => {
    setup();
    act(() => {
      window.localStorage.setItem(KEY, "250");
      window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: "250" }));
    });
    expect(screen.getByTestId("rail-resize-handle")).toHaveAttribute("aria-valuenow", "250");
  });
});
