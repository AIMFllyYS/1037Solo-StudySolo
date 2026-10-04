import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CloudSandboxCard from "./cloudSandboxCard";
import type { ToolPart } from "@/lib/ai/agent/tools/registry";
import type { ChatMessage } from "@/lib/types/chat";
import type { SandboxOutput } from "@/lib/sandbox/types";
const message = { id: "message", role: "assistant", parts: [] } as unknown as ChatMessage;
const retryId = "30000000-0000-5000-a000-000000000001", sessionId = "30000000-0000-4000-8000-000000000002";
const blocked: SandboxOutput = { text: "pending", error: "REAUTH_REQUIRED", authenticationBlocked: true, retryId, ownerBinding: "a".repeat(64), conversationId: "conversation" };
const part = (output: SandboxOutput): ToolPart<"cloudSandbox"> => ({ type: "tool-cloudSandbox", toolCallId: "fixture", state: "output-available", input: { action: "exec", sessionId, command: "client altered request" }, output });
function Harness({ initial }: { initial: SandboxOutput }) {
  const [output, setOutput] = useState(initial);
  return <CloudSandboxCard part={part(output)} message={message} isStreaming={false} ctx={{ isStreaming: false }} onOutputChange={setOutput}/>;
}
const card = (output: SandboxOutput) => <Harness initial={output}/>;
beforeEach(() => { window.history.replaceState(null, "", "/agent"); vi.stubGlobal("fetch", vi.fn(async () => Response.json({ state: "proposed", input: { action: "exec", sessionId, command: "server original request" } }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("reads the server ticket on mount and resumes only after reviewing its fixed original request", async () => {
  const fetch = vi.mocked(globalThis.fetch); render(card(blocked));
  await screen.findByRole("button", { name: "验证后继续原操作" });
  expect(fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  const verify = screen.getByTestId("connector-account-verification");
  const href = new URL(verify.getAttribute("href")!); expect(href.pathname).toBe("/reverify"); expect(new URL(href.searchParams.get("next")!).pathname).toBe("/agent");
  fireEvent.click(screen.getByRole("button", { name: "验证后继续原操作" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("server original request"); expect(screen.getByRole("alertdialog")).not.toHaveTextContent("client altered request");
  fetch.mockResolvedValue(Response.json({ conversationId: "conversation", sessionId, commandId: retryId, state: "running", text: "started" }));
  fireEvent.click(screen.getByRole("button", { name: "确认执行" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "验证后继续原操作" })).toBeNull());
  const post = fetch.mock.calls.find(([, init]) => init?.method === "POST");
  expect(post?.[0]).toBe(`/api/agent/sandbox/retry/${retryId}`); expect(JSON.parse(post?.[1]?.body as string)).toEqual({ conversationId: "conversation" });
  expect(new Headers(post?.[1]?.headers).get("x-studysolo-owner-binding")).toBe(blocked.ownerBinding);
});
it("reload retrieves a completed result and offers no second continuation", async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue(Response.json({ state: "completed", input: { action: "open" }, output: { sessionId, state: "active", conversationId: "conversation", text: "saved result" } }));
  render(card(blocked)); await screen.findByText("saved result");
  expect(screen.queryByRole("button", { name: "验证后继续原操作" })).toBeNull(); expect(vi.mocked(globalThis.fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it("an executing or uncertain ticket cannot be retried", async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue(Response.json({ state: "started", input: { action: "exec", command: "original" } }));
  render(card(blocked)); await screen.findByText("结果需要核对，请勿重复执行"); expect(screen.queryByRole("button", { name: "验证后继续原操作" })).toBeNull();
});
it("foreign owner status failure never enables a retry", async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue(Response.json({ code: "ACCOUNT_CHANGED" }, { status: 409 }));
  render(card(blocked)); await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("账号")); expect(screen.queryByRole("button", { name: "验证后继续原操作" })).toBeNull();
});
it("close reuses the shared dialog and only posts after confirmation", async () => {
  render(card({ conversationId: "conversation", sessionId, state: "active", text: "active" }));
  fireEvent.click(screen.getByRole("button", { name: "关闭沙箱" })); expect(screen.getByRole("alertdialog")).toBeTruthy(); expect(globalThis.fetch).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "Escape" }); expect(screen.queryByRole("alertdialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "关闭沙箱" }));
  vi.mocked(globalThis.fetch).mockResolvedValue(Response.json({ sessionId, state: "closed", text: "closed" }));
  fireEvent.click(screen.getAllByRole("button", { name: "关闭沙箱" })[1]);
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull()); expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(1);
});
it("non Agent views cannot resume commands or manage a sandbox", () => {
  window.history.replaceState(null, "", "/schedule"); render(card(blocked)); expect(globalThis.fetch).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "验证后继续原操作" })).toBeNull();
});
