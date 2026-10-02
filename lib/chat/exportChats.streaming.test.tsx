import { afterEach, expect, it, vi } from "vitest";
import { exportAllChats, exportSessionRecovery } from "./exportChats";
import { useChatHistory } from "@/lib/hooks/useChatHistory";
import { getOwnerEpoch, getStorageOwner } from "@/lib/storage/ownerScope";
import { hydrateAttachmentsForApi, loadSessionRecovery, loadSessionSummaryHead, loadTurnsBefore } from "@/lib/storage/chatStorage";

vi.mock("@/lib/hooks/useChatHistory", () => ({ useChatHistory: { getState: vi.fn() } }));
vi.mock("@/lib/storage/ownerScope", () => ({ getStorageOwner: vi.fn(), getOwnerEpoch: vi.fn() }));
vi.mock("@/lib/storage/chatStorage", () => ({
  hydrateAttachmentsForApi: vi.fn(), loadSessionRecovery: vi.fn(), loadSessionSummaryHead: vi.fn(), loadTurnsBefore: vi.fn(),
}));

function setup(turns: number) {
  vi.mocked(useChatHistory.getState).mockReturnValue({ sessionsMeta: [{ id: "lesson", title: "Lesson", createdAt: 1, updatedAt: 2, messageCount: turns }] } as unknown as ReturnType<typeof useChatHistory.getState>);
  vi.mocked(getStorageOwner).mockReturnValue("owner-A");
  vi.mocked(getOwnerEpoch).mockReturnValue(1);
  vi.mocked(loadSessionSummaryHead).mockResolvedValue({ revision: 3, messageCount: turns, spine: Array.from({ length: turns }, (_, firstIndex) => ({ firstIndex, messageCount: 1 })) } as Awaited<ReturnType<typeof loadSessionSummaryHead>>);
  vi.mocked(loadTurnsBefore).mockImplementation(async (_sessionId, end, count) => ({
    fromTurn: end - count, startIndex: end - count,
    messages: Array.from({ length: count }, (_, offset) => ({ id: `m${end - count + offset}`, role: "user", timestamp: 1, parts: [{ type: "text", text: `body-${end - count + offset}` }] })),
  } as unknown as Awaited<ReturnType<typeof loadTurnsBefore>>));
  vi.mocked(hydrateAttachmentsForApi).mockImplementation(async (messages) => messages);
  const chunks: string[] = [];
  const writer = { write: vi.fn(async (chunk: string) => { chunks.push(chunk); }), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
  Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: vi.fn(async () => ({ createWritable: async () => writer })) });
  return { writer, chunks };
}

afterEach(() => { vi.clearAllMocks(); delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker; });

it("exports the v1 JSON format in eight-turn reads without full session hydration", async () => {
  const { writer, chunks } = setup(17);
  expect(await exportAllChats()).toEqual({ ok: true, count: 1 });
  const saved = JSON.parse(chunks.join(""));
  expect(saved).toMatchObject({ app: "gailvlun", type: "chat-export", version: 1, sessionCount: 1 });
  expect(saved.sessions[0].messages.map((message: { id: string }) => message.id)).toEqual(Array.from({ length: 17 }, (_, index) => `m${index}`));
  expect(vi.mocked(loadTurnsBefore).mock.calls.map((call) => call.slice(1))).toEqual([[8, 8], [16, 8], [17, 1]]);
  expect(vi.mocked(hydrateAttachmentsForApi).mock.calls.every(([messages]) => messages.length <= 8)).toBe(true);
  expect(writer.close).toHaveBeenCalledOnce();
  expect(writer.abort).not.toHaveBeenCalled();
});

it("aborts the partial file if the account changes during a delayed read", async () => {
  const { writer } = setup(9);
  vi.mocked(loadTurnsBefore).mockImplementationOnce(async () => {
    vi.mocked(getStorageOwner).mockReturnValue("owner-B");
    return { fromTurn: 0, startIndex: 0, messages: [] };
  });
  expect(await exportAllChats()).toEqual({ ok: false, count: 0, reason: "failed" });
  expect(writer.abort).toHaveBeenCalledOnce();
  expect(writer.close).not.toHaveBeenCalled();
});

it("aborts when a session revision changes before its JSON is committed", async () => {
  const { writer } = setup(1);
  vi.mocked(loadSessionSummaryHead).mockResolvedValueOnce({ revision: 3, messageCount: 1, spine: [{ firstIndex: 0, messageCount: 1 }] } as Awaited<ReturnType<typeof loadSessionSummaryHead>>)
    .mockResolvedValueOnce({ revision: 4, messageCount: 1, spine: [{ firstIndex: 0, messageCount: 1 }] } as Awaited<ReturnType<typeof loadSessionSummaryHead>>);
  expect(await exportAllChats()).toEqual({ ok: false, count: 0, reason: "failed" });
  expect(writer.abort).toHaveBeenCalledOnce();
});

it("treats a dismissed save picker as cancellation, not missing data", async () => {
  const { writer } = setup(1);
  Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: vi.fn(async () => { throw new DOMException("dismissed", "AbortError"); }) });
  expect(await exportAllChats()).toEqual({ ok: false, count: 0, reason: "cancelled" });
  expect(writer.write).not.toHaveBeenCalled();
});

it("does not download an old owner's conflict snapshot after an account switch", async () => {
  setup(0);
  const createUrl = vi.fn().mockReturnValue("blob:should-not-exist");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
  vi.mocked(loadSessionRecovery).mockImplementationOnce(async () => {
    vi.mocked(getOwnerEpoch).mockReturnValue(2);
    return [];
  });
  expect(await exportSessionRecovery("lesson")).toBe(false);
  expect(createUrl).not.toHaveBeenCalled();
  Reflect.deleteProperty(URL, "createObjectURL");
});
