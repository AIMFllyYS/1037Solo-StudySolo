import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatMessage from "./ChatMessage";
import type { ChatMessage as ChatMessageType } from "@/lib/types/chat";
import { useReincludedAttachments } from "@/lib/stores/reincludedAttachments";

vi.mock("@/lib/hooks/useContextMenu", () => ({ openMessageMenu: vi.fn() }));

function userMessage(): ChatMessageType {
  return {
    id: "m1",
    role: "user",
    parts: [{ type: "text", text: "看下这张作业图" }],
    timestamp: 1,
    attachments: [{ id: "blob-m1-0", type: "image", mimeType: "image/png", name: "作业.png", size: 100 }],
  };
}

afterEach(() => {
  cleanup();
  useReincludedAttachments.setState({ bySession: {} });
});

describe("ChatMessage 的「重新带入本轮」", () => {
  it("可带入的历史图片消息显示开关，点一下标记、再点取消", () => {
    render(<ChatMessage message={userMessage()} onFollowUpSelect={vi.fn()} sessionId="s1" reincludable />);
    const toggle = screen.getByTestId("reinclude-attachment");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);
    expect(useReincludedAttachments.getState().isMarked("s1", "m1")).toBe(true);
    expect(screen.getByTestId("reinclude-attachment")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByTestId("reinclude-attachment"));
    expect(useReincludedAttachments.getState().isMarked("s1", "m1")).toBe(false);
  });

  it("本轮消息（不可带入）不显示开关", () => {
    render(<ChatMessage message={userMessage()} onFollowUpSelect={vi.fn()} sessionId="s1" />);
    expect(screen.queryByTestId("reinclude-attachment")).toBeNull();
  });
});
