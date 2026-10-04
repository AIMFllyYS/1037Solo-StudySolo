import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmbedFallback from "./EmbedFallback";

afterEach(cleanup);

describe("EmbedFallback probe reasons", () => {
  it("explains a probe-network block without claiming the website refused embedding", () => {
    const onForce = vi.fn();
    render(<EmbedFallback url="https://example.com" reason="blocked-probe-network" onForce={onForce} actionLabel="在新标签页打开" />);

    expect(screen.getByText("当前网络无法安全预检")).toBeInTheDocument();
    expect(screen.getByText(/当前网络无法安全确认该地址是否允许内嵌/)).toBeInTheDocument();
    expect(screen.queryByText("该站点禁止被内嵌")).toBeNull();
    expect(screen.getByRole("link", { name: "在新标签页打开" })).toHaveAttribute("href", "https://example.com");
    fireEvent.click(screen.getByRole("button", { name: "仍要尝试内嵌（可能显示空白）" }));
    expect(onForce).toHaveBeenCalledOnce();
  });

  it("keeps the literal-private reason visible", () => {
    render(<EmbedFallback url="http://192.168.1.4" reason="blocked-private" title="该站点禁止被内嵌" onForce={() => {}} />);
    expect(screen.getByText("该站点禁止被内嵌")).toBeInTheDocument();
    expect(screen.getByText("blocked-private")).toBeInTheDocument();
  });
});
