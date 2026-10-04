import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rawMarket from "@/public/plugins/market.json";
import { parseMarketManifest } from "@/lib/plugins/market";
import AgentPluginsPage from "./AgentPluginsPage";
import { useToast } from "@/lib/stores/toast";
import { StrictMode } from "react";

vi.mock("@/lib/plugins/market", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/plugins/market")>();
  return { ...original, useMarketManifest: () => ({ manifest: original.parseMarketManifest(rawMarket), loading: false, error: false }) };
});
vi.mock("@/components/plugins/KitSoloConnectButton", () => ({ KitSoloConnectButton: () => <button>连接</button> }));

describe("native plugin market", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockImplementation(async url => Response.json(url === "/api/agent/skills/" ? { ready: false, installed: [] } : { connections: [] }))); });
  afterEach(() => { cleanup(); useToast.getState().clear(); window.history.replaceState(null, "", "/"); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("only lists implemented services and offers the OAuth connection route on the card", async () => {
    render(<StrictMode><AgentPluginsPage /></StrictMode>);
    const notion = screen.getByTestId("plugins-card-notion");
    await waitFor(() => expect(within(notion).getByRole("button", { name: "连接" })).toBeEnabled());
    const connect = within(notion).getByRole("button", { name: "连接" });
    const form = connect.closest("form")!;
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/connectors/notion/connect");
    // noreferrer makes a navigation POST carry Origin:null and fail strict CSRF.
    expect(form).toHaveAttribute("rel", "noopener");
    expect(within(notion).getByRole("link", { name: "详情" })).toHaveAttribute("href", "/agent/plugins/mcp/notion");
    const submit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", submit);
    fireEvent.click(connect);
    expect(submit).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "复制配置" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("plugins-tab-cli")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plugins-card-filesystem")).not.toBeInTheDocument();
    expect(screen.queryByText("Codex CLI")).not.toBeInTheDocument();
    expect(parseMarketManifest(rawMarket).mcp).toHaveLength(9);
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/connectors")).toHaveLength(1);
  });

  it("keeps the catalog visible and explains why production authorization is disabled", async () => {
    vi.mocked(fetch).mockImplementation(async () => Response.json({ code: "CONNECTOR_PRODUCTION_DISABLED" }, { status: 403 }));
    render(<AgentPluginsPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("当前站点尚未启用学习服务连接"));
    expect(screen.getByTestId("plugins-card-todoist")).toBeInTheDocument();
    expect(screen.getByTestId("plugins-connect-todoist")).toBeDisabled();
    expect(screen.queryByText("学习服务操作未完成")).not.toBeInTheDocument();
  });
  it("uses one sign-in link and sign-in card states for a visitor instead of a service failure", async () => {
    vi.mocked(fetch).mockImplementation(async url => url === "/api/agent/skills/" ? Response.json({ ready: false, installed: [] }) : Response.json({ code: "SESSION_MISSING" }, { status: 401 }));
    render(<AgentPluginsPage />);
    await waitFor(() => expect(within(screen.getByTestId("learning-connections")).getByRole("alert")).toHaveTextContent(/^请先登录$/));
    expect(within(screen.getByTestId("learning-connections")).getByRole("link", { name: "请先登录" })).toHaveAttribute("href", "/login");
    expect(within(screen.getByTestId("connection-google")).getByRole("status")).toHaveTextContent("请先登录");
    expect(within(screen.getByTestId("connection-google")).queryByText("连接状态暂不可用")).not.toBeInTheDocument();
  });

  it("selects only the requested Google capabilities in the connection form", async () => {
    render(<AgentPluginsPage />);
    await waitFor(() => expect(screen.getByTestId("plugins-connect-google")).toBeEnabled());
    const card = screen.getByTestId("plugins-card-google");
    const checked = Array.from(card.querySelectorAll<HTMLInputElement>('input[name="scope"]')).filter(input => input.checked).map(input => input.value);
    expect(checked).toEqual(["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/calendar.readonly"]);
    expect(within(card).getByLabelText("读取课程邮件")).not.toBeChecked();
    expect(card.querySelector('input[value="https://www.googleapis.com/auth/calendar.events"]')).toBeNull();
  });
  it("shows a provider failure locally while keeping other connections usable", async () => {
    vi.mocked(fetch).mockImplementation(async url => Response.json(url === "/api/agent/skills/" ? { ready: false, installed: [] } : { connections: [{ provider: "notion", state: "unavailable", error: "CONNECTOR_UNAVAILABLE" }, { provider: "google", state: "connected" }] }));
    render(<AgentPluginsPage />);
    const notion = screen.getByTestId("connection-notion");
    await waitFor(() => expect(within(notion).getByRole("status")).toHaveTextContent("连接状态暂不可用"));
    expect(within(notion).queryByText("未关联")).not.toBeInTheDocument();
    expect(screen.getByTestId("plugins-connect-google")).toBeEnabled();
  });
  it("does not trust a success query and consumes the navigation notice once", async () => {
    window.history.replaceState(null, "", "/agent/plugins?connected=google");
    const show = vi.spyOn(useToast.getState(), "show");
    render(<StrictMode><AgentPluginsPage /></StrictMode>);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("本次授权未完成或已过期"));
    expect(window.location.search).toBe("");
    expect(screen.queryByText("Google Drive / Calendar / Gmail / Contacts 已关联，可以回到对话使用。")).not.toBeInTheDocument();
    expect(show).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "刷新状态" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "刷新状态" })).toBeEnabled());
    expect(show).toHaveBeenCalledOnce();
  });
  it("consumes failure and verified success notices under StrictMode without repeats", async () => {
    window.history.replaceState(null, "", "/agent/plugins?connection=google&connection_error=EMAIL_UNVERIFIED");
    const show = vi.spyOn(useToast.getState(), "show");
    const failure = render(<StrictMode><AgentPluginsPage /></StrictMode>);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("请先在统一账号完成邮箱验证"));
    expect(window.location.search).toBe(""); expect(show).toHaveBeenCalledOnce();
    failure.unmount(); show.mockClear();
    window.history.replaceState(null, "", "/agent/plugins?connected=google");
    vi.mocked(fetch).mockImplementation(async url => Response.json(url === "/api/agent/skills/" ? { ready: false, installed: [] } : { connections: [{ provider: "google", state: "connected" }] }));
    render(<StrictMode><AgentPluginsPage /></StrictMode>);
    await waitFor(() => expect(screen.getByText("Google Drive / Calendar / Gmail / Contacts 已关联，可以回到对话使用。")).toBeInTheDocument());
    expect(window.location.search).toBe(""); expect(show).toHaveBeenCalledOnce();
  });
  it.each(["MFA_REQUIRED", "REAUTH_REQUIRED"])("keeps %s recovery actionable after clearing the callback query", async code => {
    window.history.replaceState(null, "", `/agent/plugins?connection=google&connection_error=${code}`);
    render(<StrictMode><AgentPluginsPage /></StrictMode>);
    await waitFor(() => expect(screen.getByTestId("connector-account-verification")).toBeInTheDocument());
    const href = new URL(screen.getByTestId("connector-account-verification").getAttribute("href")!);
    expect(href.origin).toBe("http://localhost:3040");
    expect(href.pathname).toBe(code === "REAUTH_REQUIRED" ? "/reverify" : "/login");
    expect(href.searchParams.get(code === "REAUTH_REQUIRED" ? "next" : "redirect")).toBe(`${window.location.origin}/agent/plugins`);
    if (code === "MFA_REQUIRED") expect(href.searchParams.get("step")).toBe("verify");
    expect(window.location.search).toBe("");
  });
  it("confirms disconnect in the existing dialog and explains unconfirmed provider revocation", async () => {
    let disconnected = false;
    vi.mocked(fetch).mockImplementation(async url => {
      if (url === "/api/agent/skills/") return Response.json({ ready: false, installed: [] });
      if (url === "/api/connectors/notion/disconnect") { disconnected = true; return Response.json({ disconnected: true, remoteRevocation: "manual_provider_review_required" }); }
      return Response.json({ connections: [{ provider: "notion", state: disconnected ? "disconnected" : "connected" }] });
    });
    render(<AgentPluginsPage />);
    const card = screen.getByTestId("connection-notion");
    await waitFor(() => expect(within(card).getByRole("button", { name: "断开连接" })).toBeEnabled());
    fireEvent.click(within(card).getByRole("button", { name: "断开连接" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "取消" }));
    expect(disconnected).toBe(false);
    fireEvent.click(within(card).getByRole("button", { name: "断开连接" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "断开连接" }));
    await waitFor(() => expect(within(card).getByText(/已断开本项目连接。提供者授权尚未确认撤销/)).toBeInTheDocument());
    expect(within(card).getByText("未关联")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/connectors/notion/disconnect")).toHaveLength(1);
  });
  it("allows disconnecting an explicitly retained expired grant but not an unknown provider state", async () => {
    vi.mocked(fetch).mockImplementation(async url => Response.json(url === "/api/agent/skills/" ? { ready: false, installed: [] } : { connections: [{ provider: "notion", state: "reauthorization_required", canDisconnect: true }, { provider: "google", state: "unavailable" }] }));
    render(<AgentPluginsPage />);
    await waitFor(() => expect(within(screen.getByTestId("connection-notion")).getByRole("button", { name: "断开连接" })).toBeEnabled());
    expect(within(screen.getByTestId("connection-google")).queryByRole("button", { name: "断开连接" })).not.toBeInTheDocument();
  });
  it("does not advertise cloud skill installations before the runtime is verified", async () => {
    render(<AgentPluginsPage />);
    fireEvent.click(screen.getByTestId("plugins-tab-skills"));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/agent/skills/", expect.anything()));
    expect(screen.queryByTestId("plugins-card-notes-to-handbook")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plugins-card-gb-standard-docx-pdf")).not.toBeInTheDocument();
    expect(screen.getByTestId("plugins-card-note-organizer")).toBeInTheDocument();
  });
});
