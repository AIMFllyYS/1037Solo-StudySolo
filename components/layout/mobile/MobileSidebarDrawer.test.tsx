import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MobileSidebarDrawer from "./MobileSidebarDrawer";
import { useStore } from "@/lib/stores/ui";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("../navigation/ModeSwitcher", () => ({
  default: () => <div data-testid="app-mode-switcher">StudySolo · Studio</div>,
}));

vi.mock("../navigation/SubjectFolderTree", () => ({
  default: () => <div data-testid="subject-folder-tree">文件夹树</div>,
}));

describe("MobileSidebarDrawer", () => {
  beforeEach(() => {
    useStore.setState({ mobileSidebarOpen: true });
  });
  afterEach(cleanup);

  it("shows the mode title and the shared folder tree", () => {
    render(<MobileSidebarDrawer />);
    expect(screen.getByTestId("mobile-sidebar-drawer")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("app-mode-switcher")).toHaveTextContent("StudySolo · Studio");
    expect(screen.getByTestId("subject-folder-tree")).toBeInTheDocument();
  });
});
