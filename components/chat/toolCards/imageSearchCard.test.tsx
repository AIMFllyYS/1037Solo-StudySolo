import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ImageSearchResultCard from "./imageSearchCard";
import type { ChatMessage } from "@/lib/types/chat";
import type { ToolPart } from "@/lib/ai/agent/tools/registry";

vi.mock("@/components/chat/messages/ChatImage", () => ({
  ChatImage: ({ alt }: { alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
  <img alt={alt} />
  ),
}));

afterEach(() => cleanup());

const message = { id: "m", role: "assistant", timestamp: 1, parts: [] } as ChatMessage;

describe("imageSearch ResultCard", () => {
  it("renders gallery header, attribution and stable url keys", () => {
    const part = {
      type: "tool-imageSearch",
      toolCallId: "c1",
      state: "output-available",
      input: { query: "植物" },
      output: {
        text: "…",
        provider: "unsplash",
        sources: [
          { title: "一株植物", alt: "植物特写", url: "https://images.example/plant.jpg", snippet: "", author: "摄影者", authorUrl: "https://unsplash.com/@author" },
          { title: "重复", alt: "重复图", url: "https://images.example/plant.jpg", snippet: "" },
        ],
      },
    } as ToolPart<"imageSearch">;
    render(<ImageSearchResultCard part={part} message={message} isStreaming={false} ctx={{ isStreaming: false }} />);
    expect(screen.getByText(/本次搜索图片 · 1 张/)).toBeVisible();
    expect(screen.getByRole("img", { name: "植物特写" })).toBeVisible();
    expect(screen.getByRole("link", { name: "摄影者" })).toHaveAttribute("href", "https://unsplash.com/@author");
    const dataTransfer = { setData: vi.fn(), effectAllowed: "" };
    fireEvent.dragStart(screen.getByRole("img", { name: "植物特写" }).closest("[draggable]")!, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/uri-list", "https://images.example/plant.jpg");
  });
});
