import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppMode } from "@/lib/stores/appMode";
import ModeSwitcher from "./ModeSwitcher";

const push = vi.fn();
let pathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

describe("ModeSwitcher", () => {
  beforeEach(() => {
    pathname = "/";
    push.mockReset();
    localStorage.clear();
    useAppMode.setState({ mode: "studio", lastStudioPath: "/", hydrated: true });
  });

  it("默认显示 StudySolo · Studio，菜单含 Studio / Agent / Class / Review", () => {
    render(<ModeSwitcher />);
    expect(screen.getByTestId("app-mode-switcher")).toHaveTextContent("StudySolo · Studio");
    fireEvent.click(screen.getByTestId("app-mode-switcher"));
    expect(screen.getByTestId("app-mode-option-studio")).toHaveTextContent("Studio");
    expect(screen.getByTestId("app-mode-option-agent")).toHaveTextContent("Agent");
    expect(screen.getByTestId("app-mode-option-class")).toHaveTextContent("Class");
    expect(screen.getByTestId("app-mode-option-class")).toHaveTextContent("开发中");
    expect(screen.getByTestId("app-mode-option-review")).toHaveTextContent("Review");
  });

  it("点 Review 写入 persist 并跳到 /review", () => {
    render(<ModeSwitcher />);
    fireEvent.click(screen.getByTestId("app-mode-switcher"));
    fireEvent.click(screen.getByTestId("app-mode-option-review"));
    expect(useAppMode.getState().mode).toBe("review");
    expect(push).toHaveBeenCalledWith("/review");
    expect(JSON.parse(localStorage.getItem("studysolo-app-mode") ?? "{}").mode).toBe("review");
  });

  it("点 Agent 写入 persist 并跳到 /agent", () => {
    render(<ModeSwitcher />);
    fireEvent.click(screen.getByTestId("app-mode-switcher"));
    fireEvent.click(screen.getByTestId("app-mode-option-agent"));
    expect(useAppMode.getState().mode).toBe("agent");
    expect(push).toHaveBeenCalledWith("/agent");
    expect(JSON.parse(localStorage.getItem("studysolo-app-mode") ?? "{}").mode).toBe("agent");
  });

  it("在 Agent 页显示 StudySolo · Agent，切回 Studio 走 lastStudioPath", () => {
    pathname = "/agent";
    useAppMode.setState({ mode: "agent", lastStudioPath: "/anatomy/detail/1.1", hydrated: true });
    render(<ModeSwitcher />);
    expect(screen.getByTestId("app-mode-switcher")).toHaveTextContent("StudySolo · Agent");
    fireEvent.click(screen.getByTestId("app-mode-switcher"));
    fireEvent.click(screen.getByTestId("app-mode-option-studio"));
    expect(push).toHaveBeenCalledWith("/anatomy/detail/1.1");
  });

  it("手机 stayOnStudioForAgent：切 Agent 不进 /agent，标题仍是 StudySolo · Agent", () => {
    pathname = "/anatomy/detail/1.1";
    useAppMode.setState({ mode: "studio", lastStudioPath: "/anatomy/detail/1.1", hydrated: true });
    render(<ModeSwitcher stayOnStudioForAgent />);
    fireEvent.click(screen.getByTestId("app-mode-switcher"));
    fireEvent.click(screen.getByTestId("app-mode-option-agent"));
    expect(useAppMode.getState().mode).toBe("agent");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId("app-mode-switcher")).toHaveTextContent("StudySolo · Agent");
  });

  it("手机 stayOnStudioForAgent：Class 仍走 /class 开发中页", () => {
    render(<ModeSwitcher stayOnStudioForAgent />);
    fireEvent.click(screen.getByTestId("app-mode-switcher"));
    fireEvent.click(screen.getByTestId("app-mode-option-class"));
    expect(useAppMode.getState().mode).toBe("class");
    expect(push).toHaveBeenCalledWith("/class");
  });
});
