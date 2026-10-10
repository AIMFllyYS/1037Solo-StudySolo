import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import GenerateImageResultCard from "./generateImageCard";
import type { ChatMessage } from "@/lib/types/chat";
import type { ToolPart } from "@/lib/ai/agent/tools/registry";

vi.mock("@/components/chat/products/ImageGenCard", () => ({
  default: ({ title }: { title?: string }) => <div>生图：{title}</div>,
}));

afterEach(() => cleanup());

const message = { id: "m", role: "assistant", timestamp: 1, parts: [] } as ChatMessage;

describe("generateImage ResultCard", () => {
  it("maps image title onto ImageGenCard", () => {
    const part = {
      type: "tool-generateImage",
      toolCallId: "c1",
      state: "output-available",
      input: { prompt: "p", title: "线粒体" },
      output: { text: "…", imageGenId: "img_1", prompt: "p", title: "线粒体", size: "1024x1024", count: 1 },
    } as ToolPart<"generateImage">;
    render(<GenerateImageResultCard part={part} message={message} isStreaming={false} ctx={{ isStreaming: false }} />);
    expect(screen.getByText("生图：线粒体")).toBeVisible();
  });
});
