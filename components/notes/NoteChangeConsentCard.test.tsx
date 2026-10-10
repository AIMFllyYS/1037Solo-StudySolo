import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import NoteChangeConsentCard from "./NoteChangeConsentCard";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { useNoteChangeProposals } from "@/lib/stores/assets/noteChangeProposals";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useToast } from "@/lib/stores/toast";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";

const PROPOSAL_ID = "tool-call-1";

/** createNote 自己生成 id，所以每个用例在 beforeEach 里拿到真实的那一个。 */
let NOTE_ID = "";

function outputWith(over: Record<string, unknown> = {}) {
  return {
    text: "已生成候选稿，等学生在前端点「同意修改」。",
    proposalId: PROPOSAL_ID,
    ok: true,
    noteId: NOTE_ID,
    markdown: "# 被覆上皮\n\n1. 单层扁平",
    action: "update" as const,
    sourceComplete: true,
    baseDigest: "",
    summary: "修改笔记「被覆上皮」",
    ...over,
  };
}

function cardProps(output: unknown): ResultCardProps<"updateUserNote"> {
  return {
    part: {
      type: "tool-updateUserNote",
      toolCallId: PROPOSAL_ID,
      state: "output-available",
      input: { markdown: "# 被覆上皮\n\n1. 单层扁平" },
      output,
    },
    message: { id: "m1", role: "assistant", timestamp: 1, parts: [] },
    isStreaming: false,
    ctx: { isStreaming: false },
  } as unknown as ResultCardProps<"updateUserNote">;
}

beforeEach(() => {
  useNoteChangeProposals.getState().reset();
  NOTE_ID = useUserNotes.getState().createNote("anatomy", { title: "被覆上皮", markdown: "旧稿" });
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useToast.getState().clear();
  useChatHistory.setState({ messagesById: { main: [] }, activeSessionId: "main" });
});

afterEach(() => {
  cleanup();
});

describe("NoteChangeConsentCard", () => {
  it("shows the pending change and writes nothing until the user agrees", () => {
    render(<NoteChangeConsentCard {...cardProps(outputWith())} />);

    expect(screen.getByText("修改笔记「被覆上皮」")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /同意修改/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /取消/ })).toBeInTheDocument();
    // 未同意：正文一动不动。
    expect(useUserNotes.getState().byId[NOTE_ID]?.markdown).toBe("旧稿");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /同意修改/ }));
    });
    expect(useUserNotes.getState().byId[NOTE_ID]?.markdown).toBe("# 被覆上皮\n\n1. 单层扁平");
    expect(screen.getByText("已修改，笔记正文已更新。")).toBeInTheDocument();
  });

  it("keeps the original note when the user cancels, and never offers a blanket permission", () => {
    render(<NoteChangeConsentCard {...cardProps(outputWith())} />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /取消/ }));
    });

    expect(useUserNotes.getState().byId[NOTE_ID]?.markdown).toBe("旧稿");
    expect(screen.getByText("已取消，原笔记没有改动。")).toBeInTheDocument();
    expect(screen.queryByText(/以后都同意|始终允许|不再询问/)).toBeNull();
  });

  it("blocks a full replace built from a truncated source", () => {
    render(<NoteChangeConsentCard {...cardProps(outputWith({ sourceComplete: false }))} />);

    expect(screen.getByRole("button", { name: /同意修改/ })).toBeDisabled();
    expect(screen.getByText(/原文过长/)).toBeInTheDocument();
    expect(useUserNotes.getState().byId[NOTE_ID]?.markdown).toBe("旧稿");
  });

  it("surfaces a version conflict instead of overwriting the user's newer text", () => {
    render(<NoteChangeConsentCard {...cardProps(outputWith({ baseDigest: "stale-digest" }))} />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /同意修改/ }));
    });

    expect(useUserNotes.getState().byId[NOTE_ID]?.markdown).toBe("旧稿");
    expect(useUserNotes.getState().byId[NOTE_ID]?.title).toBe("被覆上皮");
    expect(screen.getByText(/被改过/)).toBeInTheDocument();
  });

  it("renders nothing for a legacy applied:true result so old history never looks actionable", () => {
    const { container } = render(
      <NoteChangeConsentCard
        {...cardProps({ text: "已写回", noteId: NOTE_ID, markdown: "# 新稿", action: "update", applied: true })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
