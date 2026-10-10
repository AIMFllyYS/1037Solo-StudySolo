import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE_SETTINGS } from "@/lib/theme/appearance";
import { useTheme } from "@/lib/hooks/useTheme";
import { useStore } from "@/lib/stores/ui";
import MobileSettingsPanel from "./MobileSettingsPanel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

describe("MobileSettingsPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    useTheme.setState({
      theme: "dark",
      hydrated: true,
      appearance: DEFAULT_APPEARANCE_SETTINGS,
    });
    useStore.setState({ agentSettingsOpen: false });
  });
  afterEach(cleanup);

  it("reuses the desktop dock settings: login plus the same sections", () => {
    render(<MobileSettingsPanel />);
    expect(screen.getByTestId("mobile-settings-panel")).toBeInTheDocument();
    expect(screen.getByTestId("global-settings-page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByText("访客")).toBeInTheDocument();
    expect(screen.getByText("未登录")).toBeInTheDocument();
    expect(screen.getByTestId("user-avatar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "额度" })).toBeInTheDocument();
    expect(screen.getByTestId("mobile-settings-quota")).toHaveAccessibleName("额度");
    expect(screen.getByRole("button", { name: /年级 \/ 学期/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /成绩/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /快捷键/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /外观/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 Agent 设置" })).toBeInTheDocument();
  });
});
