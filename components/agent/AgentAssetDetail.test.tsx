import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const removeNote = vi.fn();
const openNoteEditor = vi.fn();
const citeUserNoteToMainAgent = vi.fn();

const note = {
  id: "n1",
  title: "组胚笔记",
  markdown: "# 组胚\n\n正文" ,
  subjectId: "histology",
  createdAt: 10,
  updatedAt: 20,
  kind: "personal",
};

const noteItem = {
  id: "n1",
  kind: "note" as const,
  title: "组胚笔记",
  subtitle: "组织学 · 个人笔记",
  updatedAt: 20,
  origin: "both" as const,
};

const assetsRef: { value: typeof noteItem[] | null } = { value: [noteItem] };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/hooks/files/useAgentAssets", () => ({ useAgentAssets: () => assetsRef.value }));
vi.mock("@/lib/hooks/layout/useMinimumSkeleton", () => ({ useMinimumSkeleton: () => false }));
vi.mock("@/lib/stores/learning/userNotes", () => ({
  useUserNotes: Object.assign((selector: (s: unknown) => unknown) => selector({ byId: { n1: note } }), {
    getState: () => ({ removeNote }),
  }),
}));
vi.mock("@/lib/stores/learning/reviewCards", () => ({
  useReviewCards: Object.assign((selector: (s: unknown) => unknown) => selector({ byId: {} }), {
    getState: () => ({ remove: vi.fn(), byId: {} }),
  }),
}));
vi.mock("@/lib/stores/assets/documents", () => ({
  useDocuments: Object.assign((selector: (s: unknown) => unknown) => selector({ byId: {} }), {
    getState: () => ({ prune: vi.fn(), byId: {}, openViewer: vi.fn() }),
  }),
}));
vi.mock("@/lib/stores/assets/artifacts", () => ({
  useArtifacts: Object.assign((selector: (s: unknown) => unknown) => selector({ byId: {} }), {
    getState: () => ({ prune: vi.fn(), order: [], openViewer: vi.fn() }),
  }),
}));
vi.mock("@/lib/stores/assets/imports", () => ({
  useImports: Object.assign((selector: (s: unknown) => unknown) => selector({ byId: {} }), {
    getState: () => ({ remove: vi.fn() }),
  }),
}));
vi.mock("@/lib/stores/apiSecrets", () => ({ isElectronDesktop: () => false }));
vi.mock("@/lib/notes/openUserNote", () => ({
  openNoteEditor: (id: string) => openNoteEditor(id),
  citeUserNoteToMainAgent: (id: string) => citeUserNoteToMainAgent(id),
}));
vi.mock("@/components/notes/NoteRenderer", () => ({
  default: ({ content }: { content: string }) => <div data-testid="note-renderer">{content}</div>,
}));
vi.mock("@/components/review/FlipCard", () => ({ default: () => <div data-testid="flip-card" /> }));

import AgentAssetDetail from "./AgentAssetDetail";

afterEach(() => {
  cleanup();
  assetsRef.value = [noteItem];
  vi.clearAllMocks();
});

describe("AgentAssetDetail", () => {
  it("复用笔记渲染器显示正文，并给打开编辑器 / 引用到对话", () => {
    render(<AgentAssetDetail kind="note" id="n1" />);
    expect(screen.getByTestId("agent-asset-detail")).toHaveAttribute("data-asset-kind", "note");
    expect(screen.getByText("我的资产 / 笔记")).toBeInTheDocument();
    expect(screen.getByTestId("note-renderer")).toHaveTextContent("正文");
    fireEvent.click(screen.getByRole("button", { name: /打开编辑器/ }));
    expect(openNoteEditor).toHaveBeenCalledWith("n1");
    fireEvent.click(screen.getByRole("button", { name: /引用到对话/ }));
    expect(citeUserNoteToMainAgent).toHaveBeenCalledWith("n1");
    expect(push).toHaveBeenCalledWith("/agent");
  });

  it("删除必须二次确认，确认后回资产页", () => {
    render(<AgentAssetDetail kind="note" id="n1" />);
    fireEvent.click(screen.getByRole("button", { name: /^删除$/ }));
    expect(screen.getByTestId("asset-delete-confirm")).toBeInTheDocument();
    expect(removeNote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByTestId("asset-delete-confirm")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^删除$/ }));
    const confirm = screen.getByTestId("asset-delete-confirm");
    fireEvent.click(confirm.querySelectorAll("button")[0]);
    expect(removeNote).toHaveBeenCalledWith("n1");
    expect(push).toHaveBeenCalledWith("/agent/assets");
  });

  it("本机找不到这件资产时给空态与返回入口，不白屏", () => {
    assetsRef.value = [];
    render(<AgentAssetDetail kind="note" id="n1" />);
    expect(screen.getByText(/不在本机了/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /返回资产/ })).toHaveAttribute("href", "/agent/assets");
  });
});