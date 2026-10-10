import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_APPEARANCE_SETTINGS } from "@/lib/theme/appearance";
import { useTheme } from "@/lib/stores/theme";
import GlobalSettings from "./GlobalSettings";
import { useStore } from "@/lib/stores/ui";
import { useAcademicYear } from "@/lib/stores/academicYear";
import { DEFAULT_ACADEMIC_YEAR } from "@/lib/constants/academic-year";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/components/chat/billing/AccountQuota", () => ({
  AccountQuota: () => <div>登录后查看会员与额度</div>,
}));
vi.mock("@/components/chat/billing/StorageQuota", () => ({
  StorageQuotaBlock: () => <div>存储占用条</div>,
}));

function renderSettings() {
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  const anchorRef = { current: anchor } as React.RefObject<HTMLButtonElement>;
  const result = render(<GlobalSettings anchorRef={anchorRef} onClose={() => {}} />);
  return {
    ...result,
    anchor,
  };
}

describe("GlobalSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-appearance");
    document.documentElement.removeAttribute("data-font");
    document.documentElement.removeAttribute("style");
    useTheme.setState({
      theme: "dark",
      hydrated: true,
      appearance: DEFAULT_APPEARANCE_SETTINGS,
    });
    (window as unknown as { scrollTo: () => void }).scrollTo = vi.fn();
    useStore.setState({ agentSettingsOpen: false });
    useAcademicYear.setState({ year: DEFAULT_ACADEMIC_YEAR, hydrated: true });
  });

  it("renders score and appearance sections with details collapsed by default", () => {
    renderSettings();

    expect(screen.getByRole("button", { name: /年级 \/ 学期/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /成绩/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /快捷键/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /外观/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "打开 Agent 设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByText("未登录")).toBeInTheDocument();
    expect(screen.getByText("访客")).toBeInTheDocument();
    expect(screen.getByTestId("user-avatar")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "切换学年" })).not.toBeInTheDocument();
    expect(screen.queryByText("清空全部成绩")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "彩色" })).not.toBeInTheDocument();
  });

  it("opens the centered Agent settings overlay from the left dock entry", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const anchorRef = { current: anchor } as React.RefObject<HTMLButtonElement>;
    render(<GlobalSettings anchorRef={anchorRef} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "打开 Agent 设置" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useStore.getState().agentSettingsOpen).toBe(true);
  });

  it("expands score details and keeps data actions inside the score section", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: /成绩/ }));

    expect(await screen.findByText("已测章节")).toBeInTheDocument();
    expect(await screen.findByText("清空全部成绩")).toBeInTheDocument();
  });

  it("expands keyboard section and shows shortcut toggles", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: /快捷键/ }));

    expect(await screen.findByText("全局搜索")).toBeInTheDocument();
    expect(screen.getByLabelText("启用 全局搜索")).toBeInTheDocument();
  });

  it("expands only one section at a time", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: /成绩/ }));
    expect(await screen.findByText("已测章节")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /外观/ }));
    expect(await screen.findByRole("button", { name: "彩色" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("已测章节")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /成绩/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /^外观$/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("renders 切换学年 and switching years persists the academic year", async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(screen.getByRole("button", { name: /年级 \/ 学期/ })).toHaveTextContent("大二上学期");
    await user.click(screen.getByRole("button", { name: /年级 \/ 学期/ }));
    expect(screen.getByRole("group", { name: "切换学年" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "大二上学期" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "大五" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "大一" }));
    await user.click(screen.getByRole("radio", { name: "大一下学期" }));
    const { useAcademicYear } = await import("@/lib/stores/academicYear");
    expect(useAcademicYear.getState().year).toBe("freshman-2");
    expect(localStorage.getItem("gailvlun-academic-year")).toBe("freshman-2");
    expect(screen.getByRole("button", { name: /年级 \/ 学期/ })).toHaveTextContent("大一下学期");
  });

  it("opens a small account window from the account card", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole("button", { name: "查看账户" }));
    expect(screen.getByRole("dialog", { name: "账户信息" })).toBeInTheDocument();
    expect(screen.getByText("只保存在这台设备")).toBeInTheDocument();
  });

  it("page variant inlines dock settings without a close control", () => {
    render(<GlobalSettings variant="page" onClose={() => {}} />);
    expect(screen.getByTestId("global-settings-page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "额度" })).toBeInTheDocument();
    expect(screen.getByTestId("mobile-settings-quota")).toHaveAccessibleName("额度");
    expect(screen.getByTestId("mobile-settings-quota").closest("[data-settings-expand]")).toHaveAttribute(
      "data-settings-expand",
      "unbounded",
    );
    expect(screen.getByTestId("mobile-settings-quota").closest("[data-settings-variant]")).toHaveAttribute(
      "data-settings-variant",
      "card",
    );
    expect(screen.getByRole("button", { name: /年级 \/ 学期/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /成绩/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /快捷键/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /外观/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 Agent 设置" })).toBeInTheDocument();
    expect(screen.queryByTitle("关闭")).not.toBeInTheDocument();
  });

  it("page variant expands quota inline and pushes following cards down", async () => {
    const user = userEvent.setup();
    render(<GlobalSettings variant="page" onClose={() => {}} />);
    expect(screen.queryByText("存储额度")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("mobile-settings-quota"));
    expect(await screen.findByText("存储额度")).toBeInTheDocument();
    expect(screen.getByText(/登录后查看会员与额度|正在读取账户/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /年级 \/ 学期/ })).toBeInTheDocument();
  });

  it("popover uses the flat menu shell with the user header on top", () => {
    renderSettings();
    expect(screen.getByTestId("account-header")).toHaveAccessibleName("查看账户");
    expect(screen.queryByText("设置")).not.toBeInTheDocument();
    expect(screen.getByTestId("mobile-settings-quota").closest("[data-settings-variant]")).toHaveAttribute(
      "data-settings-variant",
      "menu",
    );
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("popover variant collapses quota into the same fold menu", async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(screen.getByTestId("mobile-settings-quota")).toHaveAccessibleName("额度");
    expect(screen.getByTestId("mobile-settings-quota").closest("[data-settings-expand]")).toHaveAttribute(
      "data-settings-expand",
      "bounded",
    );
    expect(screen.queryByText("存储额度")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("mobile-settings-quota"));
    expect(await screen.findByText("存储额度")).toBeInTheDocument();
    expect(screen.getByText(/登录后查看会员与额度|正在读取账户/)).toBeInTheDocument();
  });

  it("page variant opens Agent settings without closing the settings tab", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<GlobalSettings variant="page" onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "打开 Agent 设置" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(useStore.getState().agentSettingsOpen).toBe(true);
  });

  it("expands appearance controls and applies custom color/font settings", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: /外观/ }));
    await user.click(screen.getByRole("button", { name: "自定义" }));
    fireEvent.change(await screen.findByLabelText("白天主色"), { target: { value: "#1166aa" } });
    await user.click(screen.getByRole("button", { name: "全局字体" }));
    await user.click(screen.getByRole("option", { name: "宋体阅读" }));

    const state = useTheme.getState();
    expect(state.appearance.mode).toBe("custom");
    expect(state.appearance.custom.lightAccent).toBe("#1166aa");
    expect(state.appearance.custom.font).toBe("songti");
    expect(document.documentElement).toHaveAttribute("data-appearance", "custom");
  });
});
