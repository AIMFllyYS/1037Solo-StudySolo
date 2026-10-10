import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlashcardCiteWindow from "./FlashcardCiteWindow";
import { useFlashcardCitations } from "@/lib/stores/learning/flashcardCitations";
import { useRecordPreviews } from "@/lib/stores/learning/recordPreviews";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useChatUI } from "@/lib/stores/chat/chatUI";
import { FLASHCARD_CITE_WINDOW_ID } from "@/lib/notes/userNote";
import { openFlashcardCitePicker } from "@/lib/notes/openUserNote";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("FlashcardCiteWindow", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
    useFlashcardCitations.setState({ open: false, subjectId: null, activeCardId: null });
    useRecordPreviews.setState({ previews: [] });
    useReviewCards.setState({ byId: {}, order: [] });
    useChatUI.getState().clearQuotedText();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows empty guidance when the subject has no cards", () => {
    openFlashcardCitePicker({ subjectId: "probability" });
    render(<FlashcardCiteWindow />);
    expect(screen.getByRole("navigation", { name: "文件夹" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByText(/还没有复习闪卡/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开复习板" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
  });

  it("cites the selected flashcard into the chat quote tray", () => {
    const id = useReviewCards.getState().addSaved("泊松分布原文", {
      subjectId: "probability",
      sourceLabel: "概率论 / 详解 / 2.3",
    });
    useReviewCards.getState().finalize(
      id,
      {
        mode: "quiz",
        cardType: "quiz",
        front: "泊松分布的期望？",
        back: "$\\lambda$",
        explanation: "母函数",
      },
      "test",
    );
    openFlashcardCitePicker({ subjectId: "probability" });
    render(<FlashcardCiteWindow />);

    fireEvent.click(screen.getByRole("button", { name: "引用到对话" }));
    expect(useChatUI.getState().quotedText).toMatch(/【复习闪卡 · 概率论 \/ 详解 \/ 2.3】/);
    expect(useChatUI.getState().quotedText).toMatch(/正面：泊松分布的期望？/);
    expect(useChatUI.getState().quotedText).toMatch(/解析：母函数/);

    const downloadCard = screen.getByRole("button", { name: /下载这张/ });
    const downloadCsv = screen.getByRole("button", { name: /下载 CSV/ });
    const openReview = screen.getByRole("button", { name: "打开复习板" });
    const editCard = screen.getByRole("button", { name: "编辑" });
    for (const button of [downloadCard, downloadCsv, openReview, editCard]) {
      expect(button).toHaveClass("user-note-toolbar-link");
      expect(button.tagName).toBe("BUTTON");
    }

    const createObjectURL = vi.fn(() => "blob:flashcard");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    fireEvent.click(downloadCard);
    fireEvent.click(downloadCsv);
    expect(createObjectURL).toHaveBeenCalled();
  });

  it("filters the card list by the subject sidebar and can show all", () => {
    const probabilityId = useReviewCards.getState().addSaved("泊松分布原文", {
      subjectId: "probability",
      sourceLabel: "概率论 / 详解 / 2.3",
    });
    useReviewCards.getState().finalize(
      probabilityId,
      { mode: "quiz", cardType: "quiz", front: "泊松分布的期望？", back: "$\\lambda$" },
      "test",
    );
    const physicsId = useReviewCards.getState().addSaved("牛顿原文", {
      subjectId: "physics",
      sourceLabel: "大学物理 / 详解 / 1.1",
    });
    useReviewCards.getState().finalize(
      physicsId,
      { mode: "quiz", cardType: "quiz", front: "牛顿第二定律？", back: "$F=ma$" },
      "test",
    );

    openFlashcardCitePicker({ subjectId: "probability" });
    render(<FlashcardCiteWindow />);

    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "大一下学期" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /泊松分布的期望/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /牛顿第二定律/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    expect(screen.getByRole("button", { name: /泊松分布的期望/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /牛顿第二定律/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "大学物理" }));
    expect(screen.queryByRole("button", { name: /泊松分布的期望/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /牛顿第二定律/ })).toBeInTheDocument();
  });

  it("shows the empty state after switching to a subject with no cards", () => {
    const id = useReviewCards.getState().addSaved("泊松分布原文", {
      subjectId: "probability",
      sourceLabel: "概率论 / 详解 / 2.3",
    });
    useReviewCards.getState().finalize(
      id,
      { mode: "quiz", cardType: "quiz", front: "泊松分布的期望？", back: "$\\lambda$" },
      "test",
    );
    openFlashcardCitePicker({ subjectId: "probability" });
    render(<FlashcardCiteWindow />);

    expect(screen.getByRole("button", { name: /泊松分布的期望/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "大二上学期" }));
    fireEvent.click(screen.getByRole("button", { name: "系统解剖学" }));
    expect(screen.getByText(/还没有复习闪卡/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "文件夹" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开复习板" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
  });

  it("changes the active card subject from the stage chip", () => {
    const id = useReviewCards.getState().addSaved("泊松分布原文", {
      subjectId: "probability",
      sourceLabel: "概率论 / 详解 / 2.3",
    });
    useReviewCards.getState().finalize(
      id,
      { mode: "quiz", cardType: "quiz", front: "泊松分布的期望？", back: "$\\lambda$" },
      "test",
    );
    openFlashcardCitePicker({ subjectId: "probability" });
    render(<FlashcardCiteWindow />);

    expect(screen.getByTestId("subject-picker")).toHaveTextContent("概率论");
    fireEvent.click(screen.getByTestId("subject-picker"));
    fireEvent.click(screen.getByTestId("subject-picker-option-physics"));

    expect(useReviewCards.getState().byId[id]?.subjectId).toBe("physics");
    expect(useReviewCards.getState().byId[id]?.sourceLabel).toBe("大学物理 / 详解 / 2.3");
    expect(useFlashcardCitations.getState().subjectId).toBe("physics");
    expect(screen.getByTestId("subject-picker")).toHaveTextContent("大学物理");
  });

  it("opens the existing record preview without closing the cite picker", () => {
    const id = useReviewCards.getState().addSaved("泊松分布原文", {
      subjectId: "probability",
      sourceLabel: "概率论 / 详解 / 2.3",
    });
    useReviewCards.getState().finalize(
      id,
      {
        mode: "quiz",
        cardType: "quiz",
        front: "泊松分布的期望？",
        back: "$\\lambda$",
      },
      "test",
    );
    openFlashcardCitePicker({ subjectId: "probability" });
    render(<FlashcardCiteWindow />);

    const edit = screen.getByRole("button", { name: "编辑" });
    expect(edit).toBeEnabled();
    fireEvent.click(edit);

    expect(useFlashcardCitations.getState().open).toBe(true);
    expect(useWindowManager.getState().windows.some((win) => win.id === FLASHCARD_CITE_WINDOW_ID)).toBe(true);
    expect(useWindowManager.getState().windows.some((win) => win.type === "flashcard-cite-picker")).toBe(true);

    const preview = useWindowManager.getState().windows.find((win) => win.type === "record-preview");
    expect(preview).toBeDefined();
    expect(preview?.data).toMatchObject({ cardId: id });
    expect(useRecordPreviews.getState().previews).toEqual([
      expect.objectContaining({ cardId: id }),
    ]);
  });
});
