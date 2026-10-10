import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TextbookContent from "./TextbookContent";
import type { TextbookSelection } from "@/lib/textbook/state";

vi.mock("@/components/notes/NoteRenderer", () => ({ default: ({ content }: { content: string }) => <div data-testid="shared-note-renderer">{content}</div> }));
const selection = (id: string, renderType: "markdown" | "text" | "html" = "markdown"): TextbookSelection => ({ subjectId: "probability", subjectName: "概率论", categoryId: "detail", categoryName: "详解", item: { id, title: `章节 ${id}`, type: "section", renderType } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("TextbookContent", () => {
  it("自动载入完整正文并使用笔记渲染器，不挂载题目或Studio Tab", async () => {
    const text = `正文开头${"全文内容".repeat(12000)}正文末尾`;
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: text, format: "markdown" }) });
    vi.stubGlobal("fetch", fetcher);
    render(<TextbookContent selection={selection("1.1")} />);
    expect(await screen.findByTestId("shared-note-renderer")).toHaveTextContent("正文末尾");
    expect(screen.getByTestId("shared-note-renderer").textContent).toBe(text);
    expect(fetcher).toHaveBeenCalledWith("/api/section?subjectId=probability&categoryId=detail&itemId=1.1", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.queryByRole("tablist")).toBeNull();
  });
  it("快速换章会取消旧读取，延迟旧结果不能覆盖当前正文", async () => {
    let resolveFirst!: (response: unknown) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; })).mockResolvedValue({ ok: true, json: async () => ({ content: "第二章完整正文", format: "markdown" }) });
    vi.stubGlobal("fetch", fetcher);
    const view = render(<TextbookContent selection={selection("1.1")} />);
    view.rerender(<TextbookContent selection={selection("1.2")} />);
    expect(await screen.findByTestId("shared-note-renderer")).toHaveTextContent("第二章完整正文");
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
    await act(async () => { resolveFirst({ ok: true, json: async () => ({ content: "过期旧正文", format: "markdown" }) }); });
    expect(screen.getByTestId("shared-note-renderer")).toHaveTextContent("第二章完整正文");
  });
  it("正文已经带一级标题时不再在阅读器外壳重复章名", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: "# 正文自己的标题\n\n完整内容", format: "markdown" }) }));
    render(<TextbookContent selection={selection("1.1")} />);
    expect(await screen.findByTestId("shared-note-renderer")).toHaveTextContent("正文自己的标题");
    expect(screen.queryByRole("heading", { name: "章节 1.1" })).toBeNull();
  });
  it("读取失败可重试；课堂HTML沿用禁止脚本与同源的沙箱", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValue({ ok: true, json: async () => ({ content: "<p>完整课堂笔记</p>", format: "html" }) });
    vi.stubGlobal("fetch", fetcher);
    const chosen = selection("lesson-notes", "html");
    chosen.item.materialRole = "notes";
    render(<TextbookContent selection={chosen} />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "重试加载全文" }));
    await waitFor(() => expect(screen.getByTitle(chosen.item.title)).toHaveAttribute("srcdoc", "<p>完整课堂笔记</p>"));
    expect(screen.getByTitle(chosen.item.title)).toHaveAttribute("sandbox", "allow-popups");
  });
  it("缺正文时说明尚未收录，不声称已提供检索片段", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: null, format: null }) }));
    render(<TextbookContent selection={selection("1.1")} />);
    expect(await screen.findByText("该内容尚未收录完整正文。请选择其他教材章节。")).toBeInTheDocument();
    expect(screen.queryByText(/已显示检索片段/)).toBeNull();
  });
});
