import { activateStorageOwner } from '@/lib/storage/ownerScope';
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DocumentCard from "./DocumentCard";
import { useDocuments } from "@/lib/stores/assets/documents";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";

vi.mock("@/components/chat/messages/MessageContent", () => ({
  MessageContent: ({ content }: { content: string }) => <div data-testid="message-content">{content}</div>,
}));

function sse(events: object[]) {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

const spec = {
  title: "细胞综述",
  format: "markdown" as const,
  genre: "review-notes" as const,
  brief: "写一篇",
  outline: ["引言", "主体", "小结"],
};

describe("DocumentCard", () => {
  beforeEach(() => {
    activateStorageOwner('generation-test-owner');
    useDocuments.setState({ byId: {}, viewerId: null, _hasHydrated: true });
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    activateStorageOwner(null);
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not abort generation when create() writes doc into the store", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          sse([
            { type: "document", id: "doc_1", status: "outline", outline: [
              { title: "引言", brief: "b1" },
              { title: "主体", brief: "b2" },
              { title: "小结", brief: "b3" },
            ] },
          ]),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          sse([{ type: "document", id: "doc_1", status: "section-done", sectionIndex: 0, markdown: "## 引言\n一", continued: 0 }]),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          sse([{ type: "document", id: "doc_1", status: "section-done", sectionIndex: 1, markdown: "## 主体\n二", continued: 0 }]),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          sse([{ type: "document", id: "doc_1", status: "section-done", sectionIndex: 2, markdown: "## 小结\n三", continued: 0 }]),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      );

    render(<DocumentCard documentId="doc_1" spec={spec} autoStart />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /查看文档/ })).toBeTruthy();
    });
    expect(useDocuments.getState().byId.doc_1?.status).toBe("done");
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(vi.mocked(fetch).mock.calls.every((call) => {
      const init = call[1] as RequestInit | undefined;
      return init?.signal instanceof AbortSignal && !init.signal.aborted;
    })).toBe(true);
    expect(screen.getByText("3 / 3 节")).toBeTruthy();
    expect(screen.getByText("文档已就绪：细胞综述")).toBeTruthy();
  });

  it("shows 查看文档 for a persisted outlining doc that is not generating", () => {
    useDocuments.setState({
      byId: {
        doc_stuck: {
          id: "doc_stuck",
          spec: { title: "卡住的文档", format: "markdown", genre: "review-notes", brief: "x" },
          sections: [
            { title: "一", status: "pending" },
            { title: "二", status: "pending" },
            { title: "三", status: "pending" },
          ],
          status: "outlining",
          createdAt: 1,
          updatedAt: 1,
        },
      },
      viewerId: null,
      _hasHydrated: true,
    });

    render(<DocumentCard documentId="doc_stuck" spec={{ title: "卡住的文档", format: "markdown", genre: "review-notes", brief: "x" }} />);

    expect(screen.getByText(/卡住的文档/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /查看文档/ })).toBeTruthy();
    expect(screen.getByText("0 / 3 节")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "章节进度" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByTestId("document-section-list")).toHaveTextContent("一");
  });

  it("keeps finished-document preview collapsed after remount", () => {
    useDocuments.setState({
      byId: {
        doc_done: {
          id: "doc_done",
          spec: spec,
          sections: [
            { title: "引言", status: "done", markdown: "## 引言\n一" },
            { title: "主体", status: "done", markdown: "## 主体\n二" },
            { title: "小结", status: "done", markdown: "## 小结\n三" },
          ],
          status: "done",
          createdAt: 1,
          updatedAt: 1,
        },
      },
      viewerId: null,
      _hasHydrated: true,
    });

    render(<DocumentCard documentId="doc_done" spec={spec} />);

    expect(screen.getByText("文档已就绪：细胞综述")).toBeTruthy();
    expect(screen.getByText("3 / 3 节")).toBeTruthy();
    expect(screen.getByTestId("document-preview-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("document-preview-body")).toBeNull();
    fireEvent.click(screen.getByTestId("document-preview-toggle"));
    expect(screen.getByTestId("document-preview-body")).toHaveTextContent("引言");
  });

  it("previews streaming markdown and fills the bar only after a section completes", async () => {
    const encoder = new TextEncoder();
    let outlineController!: ReadableStreamDefaultController<Uint8Array>;
    let sectionController!: ReadableStreamDefaultController<Uint8Array>;
    let sectionStarts = 0;

    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}"));
      if (body.phase === "outline") {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              outlineController = controller;
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      }
      sectionStarts += 1;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            sectionController = controller;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    });

    render(<DocumentCard documentId="doc_1" spec={spec} autoStart />);

    await act(async () => {
      outlineController.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: "document",
        id: "doc_1",
        status: "reasoning",
        delta: "先列三节",
      })}\n\n`));
      outlineController.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: "document",
        id: "doc_1",
        status: "outline",
        outline: [
          { title: "引言", brief: "b1" },
          { title: "主体", brief: "b2" },
          { title: "小结", brief: "b3" },
        ],
      })}\n\n`));
      outlineController.close();
    });

    await waitFor(() => {
      expect(screen.getByText("0 / 3 节")).toBeTruthy();
      expect(screen.getByRole("progressbar", { name: "章节进度" })).toHaveAttribute("aria-valuenow", "0");
    });
    expect(screen.getByTestId("document-thinking-body")).toHaveTextContent("先列三节");
    fireEvent.click(screen.getByTestId("document-prompt-toggle"));
    expect(screen.getByTestId("document-prompt-body")).toHaveTextContent("写一篇");

    await waitFor(() => expect(sectionStarts).toBe(1));

    await act(async () => {
      sectionController.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: "document",
        id: "doc_1",
        status: "delta",
        delta: "## 引言\n先写开头",
      })}\n\n`));
    });

    await waitFor(() => {
      expect(screen.getByTestId("document-preview-body")).toHaveTextContent("先写开头");
      expect(screen.getByText("0 / 3 节")).toBeTruthy();
      expect(useDocuments.getState().byId.doc_1?.sections[0]?.status).toBe("streaming");
      expect(screen.getByText("撰写中")).toBeTruthy();
    });

    await act(async () => {
      sectionController.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: "document",
        id: "doc_1",
        status: "section-done",
        sectionIndex: 0,
        markdown: "## 引言\n先写开头",
        continued: 0,
      })}\n\n`));
      sectionController.close();
    });

    await waitFor(() => {
      expect(screen.getByText("1 / 3 节")).toBeTruthy();
      expect(screen.getByRole("progressbar", { name: "章节进度" })).toHaveAttribute("aria-valuenow", "1");
      expect(useDocuments.getState().byId.doc_1?.sections[0]?.status).toBe("done");
    });
  });
});


it('account change during outline generation prevents new chapters and writes', async () => {
  activateStorageOwner('outline-owner-a');
  let resolveResponse!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { resolveResponse = resolve; })));
  useDocuments.setState({ byId:{},viewerId:null,_hasHydrated:true });
  render(<DocumentCard documentId="owner-doc" spec={spec} autoStart />);
  await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));
  activateStorageOwner('outline-owner-b');
  useDocuments.setState({ byId:{},viewerId:null,_hasHydrated:true });
  await act(async()=>resolveResponse(new Response(sse([{type:'document',id:'owner-doc',status:'outline',outline:[{title:'private-a'}]}]))));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(useDocuments.getState().byId['owner-doc']).toBeUndefined();
  cleanup();activateStorageOwner(null);vi.unstubAllGlobals();
});
