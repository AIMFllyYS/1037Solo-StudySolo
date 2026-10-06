import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LearningConnectorsCard from "./learningConnectorsCard";
import type { ToolPart } from "@/lib/ai/agent/tools/registry";
import type { ChatMessage } from "@/lib/types/chat";
import type { ConnectorResult, ExternalActionView } from "@/lib/connectors/registry";
const message = { id: "fixture", role: "assistant", parts: [] } as unknown as ChatMessage;
const action: ExternalActionView = { id: "30000000-0000-4000-8000-000000000001", provider: "todoist", operation: "add-tasks", status: "proposed", arguments: { tasks: [{ content: "Study fixture" }] }, expiresAt: Date.now() + 900000 };
const part = (output: ConnectorResult): ToolPart<"learningConnectors"> => ({ type: "tool-learningConnectors", toolCallId: "fixture", state: "output-available", input: { action: "propose", provider: "todoist" }, output });
function Harness({ initial }: { initial: ConnectorResult }) {
  const [output, setOutput] = useState(initial);
  return <LearningConnectorsCard part={part(output)} message={message} isStreaming={false} ctx={{ isStreaming: false }} onOutputChange={setOutput}/>;
}
it("keeps raw read/status/discovery JSON inside an actually closed detail with a short completed summary", () => {
  for (const action of ["status", "discover", "read"] as const) {
    const data = { privateResultMarker: "large-json-fixture".repeat(120), results: [{ title: "fixture" }] };
    const p: ToolPart<"learningConnectors"> = { ...part({ provider: "pubmed", operation: action, text: JSON.stringify(data), data, sourceUrls: ["https://pubmed.ncbi.nlm.nih.gov/42825759/"] }), input: { action, provider: "pubmed" } };
    const { container, unmount } = render(<LearningConnectorsCard part={p} message={message} isStreaming={false} ctx={{ isStreaming: false }}/>);
    const detail = container.querySelector("details")!;
    expect(detail.open).toBe(false); expect(detail).toHaveTextContent("large-json-fixture");
    expect([...container.querySelectorAll("p")].every(paragraph => !paragraph.textContent?.includes("large-json-fixture"))).toBe(true);
    expect(container.querySelector("pre")?.closest("details")).toBe(detail);
    expect(screen.getByRole("link", { name: /查看来源/ })).toHaveAttribute("href", "https://pubmed.ncbi.nlm.nih.gov/42825759/");
    unmount();
  }
});
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => Response.json(action))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("does not write on render and confirms only the fixed server action id", async () => {
  const fetch = vi.mocked(globalThis.fetch);
  render(<Harness initial={{ provider: "todoist", operation: "add-tasks", text: "proposal", action }}/>);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  fetch.mockImplementation(async (_url, init) => Response.json(init?.method === "POST" ? { ...action, status: "succeeded" } : action));
  fireEvent.click(screen.getByRole("button", { name: "确认执行" }));
  await waitFor(() => expect(screen.getByText("已完成")).toBeTruthy());
  const post = fetch.mock.calls.find(([, init]) => init?.method === "POST");
  expect(post?.[0]).toBe(`/api/connectors/actions/${action.id}/confirm`); expect(post?.[1]?.body).toBeUndefined();
  expect(screen.queryByRole("button", { name: "确认执行" })).toBeNull();
});
it("uncertain outcomes cannot be retried by the card", async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue(Response.json({ ...action, status: "uncertain" }));
  await act(async () => { render(<Harness initial={{ provider: "todoist", operation: "add-tasks", text: "proposal", action: { ...action, status: "uncertain" } }}/>); });
  expect(screen.queryByRole("button", { name: "确认执行" })).toBeNull();
  expect(screen.getByText("结果需要核对，请勿重复执行")).toBeTruthy();
});
it("failed action hydration records the failure and disables confirmation until a fresh status succeeds", async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue(Response.json({ code: "ACCOUNT_CHANGED" }, { status: 409 }));
  render(<Harness initial={{ provider: "todoist", operation: "add-tasks", text: "proposal", action }}/>);
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "确认执行" })).toBeNull();
  vi.mocked(globalThis.fetch).mockResolvedValue(Response.json(action));
  fireEvent.click(screen.getByRole("button", { name: "刷新状态" }));
  await screen.findByRole("button", { name: "确认执行" });
  expect(screen.queryByRole("alert")).toBeNull();
});
it("provider HTML is shown as text and executable or credential URLs are omitted", () => {
  render(<LearningConnectorsCard part={part({ provider: "notion", operation: "notion-fetch", text: "<script>fixture()</script>", data: { content: "<img src=x onerror=fixture()>" }, sourceUrls: ["javascript:fixture()", "https://example.test/?access_token=fixture"] })} message={message} isStreaming={false} ctx={{ isStreaming: false }}/>);
  expect(document.querySelector("script")).toBeNull(); expect(document.querySelector("img")).toBeNull();
  expect(screen.getAllByRole("link")).toHaveLength(1);
});
it("account switches stop Anki downloads from stale chat results", async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue(Response.json({ ownerBinding: "different-account" }));
  render(<Harness initial={{ provider: "anki", operation: "export", text: "export", ownerBinding: "original-account", exportCardIds: ["fixture-card"] }}/>);
  fireEvent.click(screen.getByRole("button", { name: "下载 Anki 闪卡" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("账号已切换"));
});
