import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import KitSoloCard from "./kitSoloCard";
import type { ToolPart } from "@/lib/ai/agent/tools/registry";
import type { ChatMessage } from "@/lib/types/chat";
import { copyTextToClipboard } from "@/lib/clipboard/copyText";
vi.mock("@/lib/clipboard/copyText", () => ({ copyTextToClipboard: vi.fn(async () => true) }));
const message = { id: "m", role: "assistant", parts: [] } as unknown as ChatMessage;
afterEach(cleanup);
function part(data: Record<string, unknown>): ToolPart<"kitSolo"> { return { type: "tool-kitSolo", toolCallId: "c", state: "output-available", input: { action: "call" }, output: { text: "result", data } }; }
it("shows the actual result, copies it and offers a safe workspace link", () => {
  render(<KitSoloCard part={part({ output: "formatted data", display: { title: "JSON", url: "https://kitsolo.1037solo.com/tools/json/" } })} message={message} isStreaming={false} ctx={{ isStreaming: false }}/>);
  expect(screen.getByText("formatted data")).toBeTruthy();
  expect(screen.getByRole("link").getAttribute("href")).toBe("https://kitsolo.1037solo.com/tools/json/");
  fireEvent.click(screen.getByRole("button")); expect(copyTextToClipboard).toHaveBeenCalledWith("formatted data");
});
it("never exposes executable links or injects returned HTML", () => {
  render(<KitSoloCard part={part({ name: "<script>evil()</script>", url: "javascript:alert(1)" })} message={message} isStreaming={false} ctx={{ isStreaming: false }}/>);
  expect(screen.queryByRole("link")).toBeNull(); expect(document.querySelector("script")).toBeNull();
  expect(screen.getByText("<script>evil()</script>")).toBeTruthy();
});
