import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemoryProposalCloud from "./MemoryProposalCloud";
import { useMemoryInbox } from "@/lib/stores/learning/memoryInbox";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";

describe("MemoryProposalCloud", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    useMemoryInbox.setState({ byId: {}, order: [], appliedCommitIds: [], seenProposalIds: [] });
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses the existing toolbar text-button for dismiss, not a underlined link", () => {
    useMemoryInbox.getState().ingestProposal({
      proposalId: "prop_1",
      toolCallId: "t1",
      messageId: "m1",
      kind: "note",
      reason: "刚讲清了定义",
      titleHint: "渗透压",
    });
    const proposal = useMemoryInbox.getState().byId.prop_1;
    expect(proposal).toBeTruthy();
    render(<MemoryProposalCloud proposal={proposal!} />);

    const dismiss = screen.getByRole("button", { name: "不用了" });
    expect(dismiss).toHaveClass("user-note-toolbar-link");
    expect(dismiss.tagName).toBe("BUTTON");
    expect(screen.getByRole("button", { name: "整理" })).toHaveClass("user-note-toolbar-primary");
  });
});
