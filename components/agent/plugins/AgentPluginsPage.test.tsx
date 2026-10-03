import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rawMarket from "@/public/plugins/market.json";
import { parseMarketManifest } from "@/lib/plugins/market";
import AgentPluginsPage from "./AgentPluginsPage";

vi.mock("@/lib/plugins/market", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/plugins/market")>();
  return { ...original, useMarketManifest: () => ({ manifest: original.parseMarketManifest(rawMarket), loading: false, error: false }) };
});
vi.mock("@/components/plugins/KitSoloConnectButton", () => ({ KitSoloConnectButton: () => <button>连接</button> }));

describe("native plugin market", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockImplementation(async url => Response.json(url === "/api/agent/skills/" ? { ready: false, installed: [] } : { connections: [] }))); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("only lists implemented services and offers the OAuth connection route on the card", async () => {
    render(<AgentPluginsPage />);
    const notion = screen.getByTestId("plugins-card-notion");
    await waitFor(() => expect(within(notion).getByRole("button", { name: "连接" })).toBeEnabled());
    const connect = within(notion).getByRole("button", { name: "连接" });
    const form = connect.closest("form")!;
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/connectors/notion/connect");
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

  it("selects only the requested Google capabilities in the connection form", async () => {
    render(<AgentPluginsPage />);
    await waitFor(() => expect(screen.getByTestId("plugins-connect-google")).toBeEnabled());
    const card = screen.getByTestId("plugins-card-google");
    const checked = Array.from(card.querySelectorAll<HTMLInputElement>('input[name="scope"]')).filter(input => input.checked).map(input => input.value);
    expect(checked).toEqual(["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/calendar.readonly"]);
    expect(within(card).getByLabelText("读取课程邮件")).not.toBeChecked();
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
