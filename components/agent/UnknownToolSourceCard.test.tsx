import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { loadTurnsBefore } from "@/lib/storage/chatStorage";
import UnknownToolSourceCard from "./UnknownToolSourceCard";

vi.mock("@/lib/storage/chatStorage", () => ({ loadTurnsBefore: vi.fn() }));
vi.mock("@/lib/storage/ownerScope", () => ({ getStorageOwner: () => "test-owner", getOwnerEpoch: () => 1 }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("reads only the matching turn after expansion and drops the raw body when closed", async () => {
  const load = vi.mocked(loadTurnsBefore);
  load.mockResolvedValue({ startIndex: 6, fromTurn: 3, messages: [
    { id: "u3", role: "user", timestamp: 1, parts: [] },
    { id: "a3", role: "assistant", timestamp: 1, parts: [{ type: "tool-futureSource", output: { citation: "retained" } }] },
  ] } as unknown as Awaited<ReturnType<typeof loadTurnsBefore>>);
  const item = { messageId: "a3", messageIndex: 7, turn: 3, partIndex: 0, type: "tool-futureSource" };
  render(<UnknownToolSourceCard sessionId="old-session" item={item} />);
  expect(load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(screen.getByText(/retained/)).toBeVisible());
  expect(load).toHaveBeenCalledWith("old-session", 4, 1);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.queryByText(/retained/)).not.toBeInTheDocument();
});
