import { PERSIST_KEYS } from "@/lib/storage/idbStorage";
import { createPersistedStore } from "@/lib/stores/_persist";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { useToast } from "@/lib/stores/toast";
import {
  checkProposalAgainstNote,
  type NoteChangeProposal,
  type NoteChangeStatus,
} from "@/lib/notes/proposals/noteChangeProposal";

// 笔记变更的待确认收件箱。Agent 只产出候选稿，写入一律经过这里。
//
// 两条硬约束：
// 1. 未同意不落盘、不同步——approve 之外的任何路径都不碰 useUserNotes。
// 2. 幂等——appliedIds / dismissedIds 持久化，刷新页面、重放历史、重复点击都不会二次写入。

/** byId/order 只做内存缓存（正文可能很长），账本才持久化。 */
const MAX_LIVE_PROPOSALS = 60;
const MAX_LEDGER = 400;

export interface NoteChangeApproval {
  ok: boolean;
  status: NoteChangeStatus;
  reason?: string;
  /** 命中幂等账本：这次点击没有产生任何新写入。 */
  alreadyApplied?: boolean;
}

interface NoteChangeProposalsState {
  byId: Record<string, NoteChangeProposal>;
  order: string[];
  appliedIds: string[];
  dismissedIds: string[];
  ingest: (proposal: NoteChangeProposal) => void;
  ingestAll: (proposals: readonly NoteChangeProposal[]) => void;
  approve: (id: string) => NoteChangeApproval;
  dismiss: (id: string) => void;
  statusOf: (id: string) => NoteChangeStatus | undefined;
  reset: () => void;
}

function pushCapped(list: string[], id: string, cap: number): string[] {
  if (list.includes(id)) return list;
  const next = [...list, id];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

function trimLive(
  byId: Record<string, NoteChangeProposal>,
  order: string[],
): { byId: Record<string, NoteChangeProposal>; order: string[] } {
  if (order.length <= MAX_LIVE_PROPOSALS) return { byId, order };
  const keep = order.slice(order.length - MAX_LIVE_PROPOSALS);
  const nextById: Record<string, NoteChangeProposal> = {};
  for (const id of keep) nextById[id] = byId[id];
  return { byId: nextById, order: keep };
}

function statusFromLedger(id: string, applied: string[], dismissed: string[]): NoteChangeStatus {
  if (applied.includes(id)) return "applied";
  if (dismissed.includes(id)) return "dismissed";
  return "pending";
}

export const useNoteChangeProposals = createPersistedStore<NoteChangeProposalsState>(
  (set, get) => ({
    byId: {},
    order: [],
    appliedIds: [],
    dismissedIds: [],

    ingest: (proposal) => {
      const state = get();
      if (state.byId[proposal.id]) return;
      // 历史重放 / 刷新后重新扫到旧结果：只登记状态，绝不自动执行。
      const status = statusFromLedger(proposal.id, state.appliedIds, state.dismissedIds);
      const entry: NoteChangeProposal & { status?: NoteChangeStatus } = { ...proposal, status };
      set((s) => {
        const order = [...s.order, proposal.id];
        const byId = { ...s.byId, [proposal.id]: entry };
        return trimLive(byId, order);
      });
    },

    ingestAll: (proposals) => {
      for (const proposal of proposals) get().ingest(proposal);
    },

    approve: (id) => {
      const state = get();
      const proposal = state.byId[id];
      if (!proposal) return { ok: false, status: "stale", reason: "这份候选稿已经不在收件箱里了。" };
      if (state.appliedIds.includes(id)) {
        return { ok: true, status: "applied", alreadyApplied: true };
      }
      if (state.dismissedIds.includes(id)) {
        return { ok: false, status: "dismissed", reason: "这份候选稿已经被取消，不再执行。" };
      }

      const notes = useUserNotes.getState();
      const note = notes.byId[proposal.noteId];
      const check = checkProposalAgainstNote(proposal, note ? { markdown: note.markdown } : undefined);
      if (!check.ok) {
        markStatus(set, id, check.status);
        return { ok: false, status: check.status, reason: check.reason };
      }

      if (proposal.action === "delete") {
        notes.removeNote(proposal.noteId);
      } else {
        notes.updateNote(proposal.noteId, {
          markdown: proposal.markdown,
          ...(proposal.title !== undefined ? { title: proposal.title } : {}),
        });
      }

      // 幂等账本与笔记变更同一次同步提交：先记 id，再更新状态。
      set((s) => ({ appliedIds: pushCapped(s.appliedIds, id, MAX_LEDGER) }));
      markStatus(set, id, "applied");
      useToast.getState().show(proposal.action === "delete" ? "已删除笔记" : "已修改笔记");
      return { ok: true, status: "applied" };
    },

    dismiss: (id) => {
      if (get().appliedIds.includes(id)) return;
      set((s) => ({ dismissedIds: pushCapped(s.dismissedIds, id, MAX_LEDGER) }));
      markStatus(set, id, "dismissed");
    },

    statusOf: (id) => {
      const state = get();
      const entry = state.byId[id] as (NoteChangeProposal & { status?: NoteChangeStatus }) | undefined;
      return entry?.status ?? statusFromLedger(id, state.appliedIds, state.dismissedIds);
    },

    reset: () => set({ byId: {}, order: [], appliedIds: [], dismissedIds: [] }),
  }),
  {
    name: PERSIST_KEYS.noteChangeProposals,
    storage: "idb",
    version: 1,
    partialize: (s) => ({ appliedIds: s.appliedIds, dismissedIds: s.dismissedIds }),
    migrate: (persisted) => {
      const data = (persisted ?? {}) as { appliedIds?: string[]; dismissedIds?: string[] };
      return {
        appliedIds: data.appliedIds ?? [],
        dismissedIds: data.dismissedIds ?? [],
      };
    },
  },
);

/** 从消息 id 反查它所属的会话；确认卡要按会话归属展示。 */
export function sessionIdOfMessage(messageId: string): string | null {
  const history = useChatHistory.getState();
  for (const [sessionId, messages] of Object.entries(history.messagesById)) {
    if (messages.some((message) => message.id === messageId)) return sessionId;
  }
  return history.activeSessionId ?? null;
}

function markStatus(
  set: (fn: (s: NoteChangeProposalsState) => Partial<NoteChangeProposalsState>) => void,
  id: string,
  status: NoteChangeStatus,
): void {
  set((s) => {
    const entry = s.byId[id];
    if (!entry) return {};
    return { byId: { ...s.byId, [id]: { ...entry, status } } };
  });
}
