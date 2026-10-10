import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecordPreviewLayer from "./RecordPreviewLayer";
import { useRecordPreviews } from "@/lib/stores/learning/recordPreviews";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useChatUI } from "@/lib/stores/chat/chatUI";
import { retryRecord } from "@/lib/review/startRecord";

vi.mock("@/lib/review/startRecord", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/review/startRecord")>();
  return { ...actual, retryRecord: vi.fn(async () => ({ ok: true })) };
});

describe("RecordPreviewWindow", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
    useRecordPreviews.setState({ previews: [] });
    useReviewCards.setState({ byId: {}, order: [] });
    useChatUI.getState().clearQuotedText();
    vi.mocked(retryRecord).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("writes the card subjectId from the title-bar chip", () => {
    const id = useReviewCards.getState().addSaved("泊松分布原文", {
      subjectId: "probability",
      sourceLabel: "概率论 / 详解 / 2.3",
    });
    useRecordPreviews.getState().open(id, { x: 80, y: 80 });
    render(<RecordPreviewLayer />);

    expect(screen.getByTestId("subject-picker")).toHaveTextContent("概率论");
    fireEvent.click(screen.getByTestId("subject-picker"));
    fireEvent.click(screen.getByTestId("subject-picker-option-physics"));

    expect(useReviewCards.getState().byId[id]?.subjectId).toBe("physics");
    expect(useReviewCards.getState().byId[id]?.sourceLabel).toBe("大学物理 / 详解 / 2.3");
    expect(screen.getByTestId("subject-picker")).toHaveTextContent("大学物理");
  });

  it("ready 底栏只留保留/放弃，导出下载删除在多级菜单里", () => {
    const id = seedReadyCard("excerpt");
    useRecordPreviews.getState().open(id, { x: 80, y: 80 });
    render(<RecordPreviewLayer />);

    expect(screen.getByRole("button", { name: "保留" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "放弃" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CSV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "丢弃" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("record-preview-more"));
    expect(screen.getByTestId("record-preview-export")).toHaveTextContent("导出");
    expect(screen.getByTestId("record-preview-share")).toHaveTextContent("分享");
    expect(screen.getByTestId("record-preview-retry")).toHaveTextContent("重做");
    expect(screen.getByTestId("record-preview-delete")).toHaveTextContent("删除");

    fireEvent.click(screen.getByTestId("record-preview-export"));
    expect(screen.getByTestId("record-preview-download-md")).toHaveTextContent("下载 Markdown");
    expect(screen.getByTestId("record-preview-download-csv")).toHaveTextContent("下载 CSV");
  });

  it("保留关掉预览且卡片还在，放弃会删卡", () => {
    const keepId = seedReadyCard("quiz");
    useRecordPreviews.getState().open(keepId, { x: 80, y: 80 });
    const { unmount } = render(<RecordPreviewLayer />);

    fireEvent.click(screen.getByRole("button", { name: "保留" }));
    expect(useRecordPreviews.getState().previews).toHaveLength(0);
    expect(useReviewCards.getState().byId[keepId]?.status).toBe("ready");
    unmount();

    const dropId = seedReadyCard("cloze");
    useRecordPreviews.getState().open(dropId, { x: 80, y: 80 });
    render(<RecordPreviewLayer />);
    fireEvent.click(screen.getByRole("button", { name: "放弃" }));
    expect(useRecordPreviews.getState().previews).toHaveLength(0);
    expect(useReviewCards.getState().byId[dropId]).toBeUndefined();
  });

  it("菜单里导出下载删除分享重做仍可用", async () => {
    const id = seedReadyCard("quiz");
    useRecordPreviews.getState().open(id, { x: 80, y: 80 });
    render(<RecordPreviewLayer />);

    const createObjectURL = vi.fn(() => "blob:card");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    fireEvent.click(screen.getByTestId("record-preview-more"));
    fireEvent.click(screen.getByTestId("record-preview-export"));
    fireEvent.click(screen.getByTestId("record-preview-download-md"));
    expect(createObjectURL).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("record-preview-more"));
    fireEvent.click(screen.getByTestId("record-preview-export"));
    fireEvent.click(screen.getByTestId("record-preview-download-csv"));
    expect(createObjectURL.mock.calls.length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByTestId("record-preview-more"));
    fireEvent.click(screen.getByTestId("record-preview-share"));
    expect(useChatUI.getState().quotedText).toMatch(/【复习闪卡/);

    fireEvent.click(screen.getByTestId("record-preview-more"));
    fireEvent.click(screen.getByTestId("record-preview-retry"));
    expect(retryRecord).toHaveBeenCalledWith(id, expect.anything(), expect.anything());

    await waitFor(() => {
      expect(screen.getByTestId("record-preview-more")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("record-preview-more"));
    fireEvent.click(screen.getByTestId("record-preview-delete"));
    expect(useReviewCards.getState().byId[id]).toBeUndefined();
  });
});

function seedReadyCard(mode: "excerpt" | "quiz" | "cloze") {
  const id = useReviewCards.getState().addSaved("泊松分布原文", {
    subjectId: "probability",
    sourceLabel: "概率论 / 详解 / 2.3",
  });
  useReviewCards.getState().finalize(
    id,
    {
      mode,
      cardType: mode,
      front: mode === "excerpt" ? "泊松分布原文" : "泊松分布的期望？",
      back: mode === "excerpt" ? "记 λ 与稀有事件" : "$\\lambda$",
    },
    "test",
  );
  return id;
}
