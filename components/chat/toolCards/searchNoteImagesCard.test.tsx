import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SearchNoteImagesResultCard from "./searchNoteImagesCard";
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

describe("searchNoteImages ResultCard", () => {
  it("renders gallery header", () => {
    const part = {
      type: "tool-searchNoteImages",
      toolCallId: "c1",
      state: "output-available",
      input: { query: "肝小叶" },
      output: {
        text: "…",
        images: [{
          src: "/images/a.png",
          alt: "肝小叶",
          caption: "图1",
          path: "anatomy/textbook/ch01",
          subjectId: "anatomy",
          categoryId: "textbook",
          itemId: "ch01",
          title: "肝",
          context: "",
          score: 1,
        }],
      },
    } as ToolPart<"searchNoteImages">;
    render(<SearchNoteImagesResultCard part={part} message={message} isStreaming={false} ctx={{ isStreaming: false }} />);
    expect(screen.getByText(/笔记图片 · 1 张/)).toBeVisible();
    expect(screen.getByText("肝小叶")).toBeVisible();
  });
});
