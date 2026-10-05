import { create } from "zustand";
import { translateNow } from "@/lib/i18n";
import { useWindowManager } from "@/lib/stores/windowManager";
import { useChatHistory } from "@/lib/stores/chatHistory";
import {
  collectMemoryToolEvents,
  memoryCommitOf,
  shouldAcceptProposal,
  type MemoryCommitEvent,
  type MemoryProposalEvent,
} from "@/lib/memory/memoryLoop";
import { applyCommitFlashcards, applyCommitNotes } from "@/lib/memory/applyMemoryTools";
import {
  currentMemoryCommitChatContext,
  runMemoryCommitWithRuntime,
} from "@/lib/memory/runMemoryCommit";
import { classifySendError } from "@/lib/chat/classifySendError";
import { loadSessionMessages } from "@/lib/storage/chatStorage";
import { memoryProposalWindowId } from "@/lib/notes/userNote";
import type { MemoryKind } from "@/lib/ai/agent/tools/proposeMemory/types";
import type { ChatMessage } from "@/lib/types/chat";
import type { RecordMode } from "@/lib/review/types";
import { getOwnerEpoch, onStorageOwnerChange } from "@/lib/storage/ownerScope";

export type MemoryProposalStatus = "proposed" | "committing" | "done" | "dismissed";

export interface MemoryProposal {
  id: string;
  kind: MemoryKind;
  reason: string;
  titleHint?: string;
  suggestedMode?: RecordMode;
  messageId: string;
  toolCallId: string;
  /** 提案归属的会话：commit 用它全量装配上下文（旧条目可能没有，退回扫描+活跃会话兜底）。 */
  sessionId?: string;
  status: MemoryProposalStatus;
  titleDraft: string;
  modeDraft: RecordMode;
  commitToolCallId?: string;
  createdNoteId?: string;
  createdCardIds?: string[];
  error?: string;
  /** 旁路请求的本地 assistant，不进主 thread。 */
  commitMessage?: ChatMessage;
}

interface MemoryInboxState {
  byId: Record<string, MemoryProposal>;
  order: string[];
  appliedCommitIds: string[];
  /** 已见过的提议（含刷新时从旧对话扫到的），避免再开云。 */
  seenProposalIds: string[];
  ingestProposal: (event: MemoryProposalEvent) => void;
  ingestCommit: (event: MemoryCommitEvent) => void;
  acknowledgeHistory: (proposals: MemoryProposalEvent[], commits: MemoryCommitEvent[]) => void;
  setDraft: (id: string, patch: { titleDraft?: string; modeDraft?: RecordMode }) => void;
  confirm: (id: string) => void;
  dismiss: (id: string) => void;
}

function liveKinds(state: MemoryInboxState): MemoryKind[] {
  return state.order
    .map((id) => state.byId[id])
    .filter((item): item is MemoryProposal => Boolean(item) && (item.status === "proposed" || item.status === "committing"))
    .map((item) => item.kind);
}

function cloudGeometry(index: number) {
  if (typeof window === "undefined") {
    return { pos: { x: 48, y: 96 + index * 28 }, size: { width: 360, height: 240 } };
  }
  const width = 360;
  const height = 248;
  const right = document.getElementById("right-panel");
  const rect = right?.getBoundingClientRect();
  const x = rect
    ? Math.max(16, rect.left - width - 12)
    : Math.max(16, window.innerWidth - width - 28);
  const y = Math.max(64, (rect?.top ?? 72) + 40 + index * 28);
  return { pos: { x, y }, size: { width, height } };
}

const memoryCommitAborts = new Map<string, AbortController>();

async function sessionForMessage(
  messageId: string,
  knownSessionId?: string,
): Promise<{ sessionId: string | null; messages: ChatMessage[] }> {
  const history = useChatHistory.getState();
  let sessionId = knownSessionId ?? null;
  if (!sessionId) {
    for (const [sid, messages] of Object.entries(history.messagesById)) {
      if (messages.some((message) => message.id === messageId)) {
        sessionId = sid;
        break;
      }
    }
  }
  if (!sessionId) sessionId = history.activeSessionId;
  // commit 的上下文必须是整段会话：messagesById 只是尾部窗口，直接全量装配读。
  // 读不到（非浏览器/存储损坏）退回内存窗口——比空上下文强。
  const messages = sessionId
    ? (await loadSessionMessages(sessionId)) ?? useChatHistory.getState().messagesById[sessionId] ?? []
    : [];
  return { sessionId, messages };
}

function uniquePush(list: string[], ids: readonly string[]): string[] {
  const next = [...list];
  for (const id of ids) {
    if (id && !next.includes(id)) next.push(id);
  }
  return next;
}

function emptyCommitError(kind: MemoryProposal["kind"]): string {
  return kind === "note" ? "没有写出笔记，请再试一次。" : "没有写出闪卡，请再试一次。";
}

function commitSucceeded(item: MemoryProposal): boolean {
  return Boolean(item.createdNoteId || item.createdCardIds?.length);
}

async function startMemoryCommit(id: string): Promise<void> {
  const prev = useMemoryInbox.getState().byId[id];
  if (!prev || prev.status !== "committing") return;
  if (prev.kind !== "note" && prev.kind !== "flashcard") return;

  memoryCommitAborts.get(id)?.abort();
  const abortController = new AbortController();
  const ownerEpoch = getOwnerEpoch();
  const isCurrent = () => !abortController.signal.aborted && ownerEpoch === getOwnerEpoch();
  memoryCommitAborts.set(id, abortController);
  const { sessionId, messages } = await sessionForMessage(prev.messageId, prev.sessionId);
  if (!isCurrent()) return;

  try {
    const result = await runMemoryCommitWithRuntime({
      historyMessages: messages,
      memoryCommit: memoryCommitOf(prev.kind),
      title: prev.titleDraft,
      mode: prev.modeDraft,
      chatContext: currentMemoryCommitChatContext(),
      sessionId: sessionId ?? undefined,
      abortController,
      onWrite: (message) => {
        if (!isCurrent()) return;
        const live = useMemoryInbox.getState().byId[id];
        if (!live || live.status !== "committing") return;
        useMemoryInbox.setState((s) => ({
          byId: { ...s.byId, [id]: { ...s.byId[id]!, commitMessage: message } },
        }));
      },
    });
    if (!isCurrent() || useMemoryInbox.getState().byId[id]?.status !== "committing") return;

    const { commits } = collectMemoryToolEvents([result]);
    const commit = commits.find((item) => {
      if (item.kind !== prev.kind) return false;
      return prev.kind === "note" ? Boolean(item.notes) : Boolean(item.flashcards);
    });
    if (!commit) {
      useMemoryInbox.setState((s) => {
        const live = s.byId[id];
        if (!live) return s;
        return {
          byId: {
            ...s.byId,
            [id]: { ...live, status: "proposed", error: emptyCommitError(prev.kind) },
          },
        };
      });
      return;
    }
    useMemoryInbox.getState().ingestCommit(commit);
    const after = useMemoryInbox.getState().byId[id];
    if (after && commitSucceeded(after)) {
      useMemoryInbox.getState().dismiss(id);
      return;
    }
    if (after?.error) {
      useMemoryInbox.setState((s) => {
        const live = s.byId[id];
        if (!live) return s;
        return { byId: { ...s.byId, [id]: { ...live, status: "proposed" } } };
      });
    }
  } catch (error) {
    if (!isCurrent()) return;
    const message = classifySendError(error, { stalled: false, aborted: abortController.signal.aborted });
    useMemoryInbox.setState((s) => {
      const live = s.byId[id];
      if (!live) return s;
      return {
        byId: {
          ...s.byId,
          [id]: { ...live, status: "proposed", error: message ?? "整理失败，请再试一次。" },
        },
      };
    });
  } finally {
    if (memoryCommitAborts.get(id) === abortController) memoryCommitAborts.delete(id);
  }
}

function openCloud(proposal: MemoryProposal, index: number) {
  const { pos, size } = cloudGeometry(index);
  useWindowManager.getState().openWindow({
    id: memoryProposalWindowId(proposal.id),
    type: "memory-proposal",
    // 标签条标题与窗内标题（MemoryProposalCloud → window.memory.titleNote）用同一个 key：
    // 以前标签条写「整理成笔记？」、窗内写「笔记提议」，同一个窗两个名字。
    title: proposal.kind === "note" ? translateNow("window.memory.titleNote") : translateNow("window.memory.titleFlashcard"),
    pos,
    size,
    data: { proposalId: proposal.id },
  });
}

export const useMemoryInbox = create<MemoryInboxState>((set, get) => ({
  byId: {},
  order: [],
  appliedCommitIds: [],
  seenProposalIds: [],

  acknowledgeHistory: (proposals, commits) => {
    set((s) => ({
      seenProposalIds: uniquePush(s.seenProposalIds, proposals.map((item) => item.proposalId)),
      appliedCommitIds: uniquePush(s.appliedCommitIds, commits.map((item) => item.toolCallId)),
    }));
  },

  ingestProposal: (event) => {
    const state = get();
    if (state.seenProposalIds.includes(event.proposalId) || state.byId[event.proposalId]) return;
    if (!shouldAcceptProposal(liveKinds(state), event, Boolean(state.byId[event.proposalId]))) return;
    const proposal: MemoryProposal = {
      id: event.proposalId,
      kind: event.kind,
      reason: event.reason,
      titleHint: event.titleHint,
      suggestedMode: event.suggestedMode,
      messageId: event.messageId,
      toolCallId: event.toolCallId,
      sessionId: event.sessionId,
      status: "proposed",
      titleDraft: event.titleHint || "",
      modeDraft: event.suggestedMode || "cloze",
    };
    set((s) => ({
      byId: { ...s.byId, [proposal.id]: proposal },
      order: s.order.includes(proposal.id) ? s.order : [...s.order, proposal.id],
      seenProposalIds: uniquePush(s.seenProposalIds, [proposal.id]),
    }));
    openCloud(proposal, get().order.length - 1);
  },

  ingestCommit: (event) => {
    if (get().appliedCommitIds.includes(event.toolCallId)) return;
    const committing = get()
      .order
      .map((id) => get().byId[id])
      .find((item) => item && item.status === "committing" && item.kind === event.kind);
    if (!committing) {
      set((s) => ({ appliedCommitIds: uniquePush(s.appliedCommitIds, [event.toolCallId]) }));
      return;
    }

    try {
      if (event.kind === "note" && event.notes) {
        const noteId = applyCommitNotes(event.notes);
        set((s) => ({
          appliedCommitIds: uniquePush(s.appliedCommitIds, [event.toolCallId]),
          byId: {
            ...s.byId,
            [committing.id]: {
              ...committing,
              status: "done",
              commitToolCallId: event.toolCallId,
              createdNoteId: noteId,
            },
          },
        }));
        return;
      }
      if (event.kind === "flashcard" && event.flashcards) {
        const cardIds = applyCommitFlashcards(event.flashcards);
        set((s) => ({
          appliedCommitIds: uniquePush(s.appliedCommitIds, [event.toolCallId]),
          byId: {
            ...s.byId,
            [committing.id]: {
              ...committing,
              status: "done",
              commitToolCallId: event.toolCallId,
              createdCardIds: cardIds,
            },
          },
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "写入失败";
      set((s) => ({
        byId: { ...s.byId, [committing.id]: { ...committing, error: message } },
      }));
    }
  },

  setDraft: (id, patch) => {
    const prev = get().byId[id];
    if (!prev) return;
    set((s) => ({ byId: { ...s.byId, [id]: { ...prev, ...patch } } }));
  },

  confirm: (id) => {
    const prev = get().byId[id];
    if (!prev || prev.status !== "proposed") return;
    set((s) => ({
      byId: {
        ...s.byId,
        [id]: { ...prev, status: "committing", error: undefined, commitMessage: undefined },
      },
    }));
    useWindowManager.getState().updateWindow(memoryProposalWindowId(id), {
      title: prev.kind === "note" ? translateNow("window.memory.committingNote") : translateNow("window.memory.committingFlashcard"),
      size: { width: 380, height: 420 },
    });
    void startMemoryCommit(id);
  },

  dismiss: (id) => {
    memoryCommitAborts.get(id)?.abort();
    memoryCommitAborts.delete(id);
    useWindowManager.getState().closeWindow(memoryProposalWindowId(id));
    const prev = get().byId[id];
    if (!prev) return;
    set((s) => ({ byId: { ...s.byId, [id]: { ...prev, status: "dismissed" } } }));
  },
}));

const acknowledgedSessionIds = new Set<string>();

onStorageOwnerChange(() => {
  for (const controller of memoryCommitAborts.values()) controller.abort();
  memoryCommitAborts.clear();
  const inbox = useMemoryInbox.getState();
  for (const id of inbox.order) useWindowManager.getState().closeWindow(memoryProposalWindowId(id));
  useMemoryInbox.setState({ byId: {}, order: [], appliedCommitIds: [], seenProposalIds: [] });
  acknowledgedSessionIds.clear();
});

export function resetMemoryInboxSessionAcks(): void {
  acknowledgedSessionIds.clear();
}

/**
 * 每个会话第一次看到的 propose/commit 只记入已见集合，不弹云、不重写库。
 * 之后该会话新增的工具事件才 ingest（当前轮对话）。
 */
export function syncMemoryInboxFromSessions(
  messagesById: Record<string, ChatMessage[] | undefined>,
): void {
  const inbox = useMemoryInbox.getState();
  for (const [sessionId, messages] of Object.entries(messagesById)) {
    if (!messages) continue;
    const { proposals, commits } = collectMemoryToolEvents(messages, sessionId);
    if (!acknowledgedSessionIds.has(sessionId)) {
      inbox.acknowledgeHistory(proposals, commits);
      acknowledgedSessionIds.add(sessionId);
      continue;
    }
    for (const proposal of proposals) inbox.ingestProposal(proposal);
    for (const commit of commits) inbox.ingestCommit(commit);
  }
}
