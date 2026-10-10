import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useStore } from "@/lib/stores/ui";
import { useSettings } from "@/lib/stores/settings";
import { fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="lazy-media" />,
}));

vi.mock("@/lib/hooks/runtime/useIsClient", () => ({
  useIsClient: () => true,
}));

vi.mock("@/lib/stores/workspace/browser", () => ({
  BROWSE_TAB: "browse",
  useBrowser: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      bookmarks: [],
      activeTabId: "browse",
      openBrowse: () => {},
      openBookmark: () => {},
      removeBookmark: () => {},
    }),
}));

vi.mock("@/components/browser/BrowserSettingsButton", () => ({
  default: () => <button type="button">浏览器设置</button>,
}));

import CenterWorkspace from "./CenterWorkspace";
import { useCenterTabsHosted } from "./centerTabsHost";
import { useContentTabs } from "@/lib/stores/workspace/contentTabs";

vi.mock("@/components/search/GlobalSearchButton", () => ({ default: () => null }));
vi.mock("@/components/window/WindowTaskbar", () => ({ default: () => null }));

describe("CenterWorkspace", () => {
  beforeEach(() => {
    useStore.setState({
      rightTab: "ai",
      rightTabs: ["ai", "video", "interactive", "browser"],
      centerTab: "notes",
    });
    useSettings.setState({ centerTabsAutoHide: false });
  });

  it("有媒体 tab 时渲染 笔记 / 视频 / 可交互 / 浏览器 的 tab 栏，默认停在笔记", () => {
    render(
      <CenterWorkspace>
        <div>笔记正文</div>
      </CenterWorkspace>,
    );
    expect(screen.getByTestId("center-tabs")).toBeInTheDocument();
    expect(screen.getByTestId("center-tab-notes")).toBeInTheDocument();
    expect(screen.getByTestId("center-tab-video")).toBeInTheDocument();
    expect(screen.getByTestId("center-tab-interactive")).toBeInTheDocument();
    expect(screen.getByTestId("center-tab-browser")).toBeInTheDocument();
    expect(screen.getByText("笔记正文")).toBeInTheDocument();
    // 笔记默认激活；媒体本体尚未挂载。
    expect(screen.queryByTestId("lazy-media")).not.toBeInTheDocument();
  });

  it("只有 ai 的路由不挂 tab 栏（版式回到纯笔记）", () => {
    useStore.setState({ rightTabs: ["ai"] });
    render(
      <CenterWorkspace>
        <div>纯笔记</div>
      </CenterWorkspace>,
    );
    expect(screen.queryByTestId("center-tabs")).not.toBeInTheDocument();
    expect(screen.getByText("纯笔记")).toBeInTheDocument();
  });

  it("切到视频 tab 后懒挂载媒体本体，且笔记仍留在 DOM（只是隐藏）", async () => {
    render(
      <CenterWorkspace>
        <div>笔记正文</div>
      </CenterWorkspace>,
    );
    await userEvent.click(screen.getByTestId("center-tab-video"));
    expect(useStore.getState().centerTab).toBe("video");
    expect(screen.getByTestId("lazy-media")).toBeInTheDocument();
    // 笔记不卸载：滚动位置与 DOM 状态得以保留。
    expect(screen.getByText("笔记正文")).toBeInTheDocument();
  });

  it("内容页的 正文 / 例题 / 题目测试 与 视频 / 可交互 / 浏览器 合成同一条栏", async () => {
    useContentTabs.setState({
      tabs: [
        { id: "content", label: "正文" },
        { id: "examples", label: "例题" },
        { id: "quiz", label: "题目测试" },
      ],
      active: "content",
    });
    useStore.setState({ centerTab: "video" });
    function Probe() {
      return <div data-testid="hosted">{String(useCenterTabsHosted())}</div>;
    }
    render(
      <CenterWorkspace>
        <Probe />
      </CenterWorkspace>,
    );
    const bars = screen.getAllByRole("tablist");
    expect(bars).toHaveLength(1);
    expect(screen.getByTestId("hosted")).toHaveTextContent("true");
    expect(screen.queryByTestId("center-tab-notes")).not.toBeInTheDocument();
    for (const id of ["content", "examples", "quiz", "video", "interactive", "browser"]) {
      expect(screen.getByTestId(`center-tab-${id}`)).toBeInTheDocument();
    }
    // 在视频上点「题目测试」：回到笔记区并切到题目。
    await userEvent.click(screen.getByTestId("center-tab-quiz"));
    expect(useStore.getState().centerTab).toBe("notes");
    expect(useContentTabs.getState().active).toBe("quiz");
    expect(screen.getByTestId("center-tab-quiz")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("center-tab-video")).toHaveAttribute("aria-selected", "false");
    useContentTabs.setState({ tabs: [], active: "content" });
  });

  it("auto-hide: bar is tucked away until the top hot zone is hovered, and a pinned setting keeps it", () => {
    useSettings.setState({ centerTabsAutoHide: true });
    const { rerender } = render(<CenterWorkspace><div>body</div></CenterWorkspace>);
    const bar = screen.getByTestId("center-tabs");
    expect(bar).toHaveAttribute("data-auto-hide", "hidden");
    fireEvent.mouseEnter(screen.getByTestId("center-tabs-hotzone"));
    expect(bar).toHaveAttribute("data-auto-hide", "shown");
    act(() => { useSettings.setState({ centerTabsAutoHide: false }); });
    rerender(<CenterWorkspace><div>body</div></CenterWorkspace>);
    expect(screen.getByTestId("center-tabs")).not.toHaveAttribute("data-auto-hide");
    expect(screen.queryByTestId("center-tabs-hotzone")).toBeNull();
  });
});
