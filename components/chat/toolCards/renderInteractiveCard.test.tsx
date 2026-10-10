import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import RenderInteractiveResultCard from "./renderInteractiveCard";
import type { ChatMessage } from "@/lib/types/chat";
import type { ToolPart } from "@/lib/ai/agent/tools/registry";

import { useAppMode } from "@/lib/stores/appMode";

vi.mock("@/components/chat/products/ArtifactCard", () => ({
  default: ({ title, silent }: { title?: string; silent?: boolean }) =>
    silent ? null : <div>交互演示：{title}</div>,
}));

afterEach(() => {
  cleanup();
  useAppMode.setState({ mode: "studio" });
});

const message = { id: "m", role: "assistant", timestamp: 1, parts: [] } as ChatMessage;

describe("renderInteractive ResultCard", () => {
  it("maps artifact title onto ArtifactCard", () => {
    const part = {
      type: "tool-renderInteractive",
      toolCallId: "c1",
      state: "output-available",
      input: { title: "概率滑块", prompt: "p" },
      output: { text: "…", artifactId: "art_1", title: "概率滑块", prompt: "p" },
    } as ToolPart<"renderInteractive">;
    render(<RenderInteractiveResultCard part={part} message={message} isStreaming={false} ctx={{ isStreaming: false }} />);
    expect(screen.getByText("交互演示：概率滑块")).toBeVisible();
  });

  it("keeps generating on Agent but hides the mid-chat card", () => {
    useAppMode.setState({ mode: "agent" });
    const part = {
      type: "tool-renderInteractive",
      toolCallId: "c1",
      state: "output-available",
      input: { title: "概率滑块", prompt: "p" },
      output: { text: "…", artifactId: "art_1", title: "概率滑块", prompt: "p" },
    } as ToolPart<"renderInteractive">;
    render(<RenderInteractiveResultCard part={part} message={message} isStreaming={false} ctx={{ isStreaming: false }} />);
    expect(screen.queryByText("交互演示：概率滑块")).not.toBeInTheDocument();
  });
});
