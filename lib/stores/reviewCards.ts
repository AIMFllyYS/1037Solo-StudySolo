import { PERSIST_KEYS } from "@/lib/storage/idbStorage";
import { createPersistedStore } from "@/lib/stores/_persist";
import { retargetCardSourceLabel } from "@/lib/notes/flashcardSubjects";
import { scheduleCloudTombstone, scheduleCloudUpsert } from "@/lib/sync/schedule";
import type {
  ReviewCard,
  ReviewCardContext,
  RecordCardAI,
  ReviewExport,
  RecordMode,
} from "@/lib/review/types";

// 复习卡片仓库（IndexedDB 持久化，复用 useArtifacts 范式）。
// 写入路径：addSaved（先存原文，绝不丢）→ markProcessing（用户选模式）→ finalize / markError（流式成卡回填）。
// 预览窗的临时 UI 态（拖拽位置等）不在此持久化。

const genId = () => Math.random().toString(36).slice(2, 11);

interface ReviewCardsState {
  byId: Record<string, ReviewCard>;
  order: string[];
  /** IndexedDB 异步水合完成标志。 */
  _hasHydrated: boolean;
  _setHasHydrated: (v: boolean) => void;

  /** 落库一张 saved 卡（持有原文，等待用户选模式），返回卡片 id。 */
  addSaved: (originalText: string, ctx: ReviewCardContext) => string;
  /** 用户选择模式后 / 重试成卡：置为 processing 并记录模式（清错误）。 */
  markProcessing: (id: string, mode: RecordMode) => void;
  /** 后台成卡成功，回填卡片内容并置为 ready。 */
  finalize: (id: string, ai: RecordCardAI, model: string) => void;
  /** 后台成卡失败，置为 error（原文仍在，可重试/删除）。 */
  markError: (id: string, message: string) => void;
  /** 删除一张卡。 */
  remove: (id: string) => void;
  /** 更换这张卡绑定的科目（写现有 subjectId / sourceLabel，不另开存储）。 */
  setSubject: (id: string, subjectId: string) => void;
  /** 取某科目下的卡片（按创建时间倒序，最新在前）。 */
  bySubject: (subjectId: string) => ReviewCard[];
  /** 导出某科目 / 全部为可下载结构。 */
  exportSubject: (subjectId: string) => ReviewExport;
  exportAll: () => ReviewExport;
}

function orderedCards(state: ReviewCardsState): ReviewCard[] {
  return state.order.map((id) => state.byId[id]).filter(Boolean);
}

export const useReviewCards = createPersistedStore<ReviewCardsState>(
    (set, get) => ({
      byId: {},
      order: [],
      _hasHydrated: false,
      _setHasHydrated: (v) => set({ _hasHydrated: v }),

      addSaved: (originalText, ctx) => {
        const id = genId();
        const now = Date.now();
        const card: ReviewCard = {
          id,
          subjectId: ctx.subjectId,
          categoryId: ctx.categoryId,
          itemId: ctx.itemId,
          sourceLabel: ctx.sourceLabel,
          originalText,
          cardType: "qa",
          front: "",
          back: "",
          status: "saved",
          createdAt: now,
          // 见 finalize 的注释：设备端变更必须推进版本号。
          updatedAt: now,
        };
        set((s) => ({ byId: { ...s.byId, [id]: card }, order: [...s.order, id] }));
        scheduleCloudUpsert("review-card", id);
        return id;
      },

      finalize: (id, ai, model) =>
        set((s) => {
          const prev = s.byId[id];
          if (!prev) return s;
          scheduleCloudUpsert("review-card", id);
          return {
            byId: {
              ...s.byId,
              [id]: {
                ...prev,
                mode: ai.mode,
                cardType: ai.cardType,
                front: ai.front,
                back: ai.back,
                blanks: ai.blanks,
                explanation: ai.explanation,
                status: "ready",
                error: undefined,
                model,
                // 每次本机改动都要推进版本号。否则本机永远停在 createdAt，
                // 而别处（Platform Wiki）写过一次就会一直赢，用户在本机的编辑
                // 会在下一次 push 时被静默丢弃。
                updatedAt: Date.now(),
              },
            },
          };
        }),

      markProcessing: (id, mode) =>
        set((s) => {
          const prev = s.byId[id];
          if (!prev) return s;
          scheduleCloudUpsert("review-card", id);
          return { byId: { ...s.byId, [id]: { ...prev, status: "processing", mode, error: undefined, updatedAt: Date.now() } } };
        }),

      markError: (id, message) =>
        set((s) => {
          const prev = s.byId[id];
          if (!prev) return s;
          scheduleCloudUpsert("review-card", id);
          return { byId: { ...s.byId, [id]: { ...prev, status: "error", error: message, updatedAt: Date.now() } } };
        }),

      remove: (id) =>
        set((s) => {
          if (!s.byId[id]) return s;
          const byId = { ...s.byId };
          delete byId[id];
          scheduleCloudTombstone("review-card", id);
          return { byId, order: s.order.filter((x) => x !== id) };
        }),

      setSubject: (id, subjectId) =>
        set((s) => {
          const prev = s.byId[id];
          if (!prev || prev.subjectId === subjectId) return s;
          scheduleCloudUpsert("review-card", id);
          return {
            byId: {
              ...s.byId,
              [id]: {
                ...prev,
                subjectId,
                sourceLabel: retargetCardSourceLabel(prev.sourceLabel, subjectId),
                updatedAt: Date.now(),
              },
            },
          };
        }),

      bySubject: (subjectId) =>
        orderedCards(get())
          .filter((c) => c.subjectId === subjectId)
          .reverse(),

      exportSubject: (subjectId) => {
        const cards = orderedCards(get()).filter((c) => c.subjectId === subjectId);
        return {
          app: "gailvlun",
          kind: "review-cards",
          version: 1,
          exportedAt: Date.now(),
          scope: "subject",
          subjectId,
          count: cards.length,
          cards,
        };
      },

      exportAll: () => {
        const cards = orderedCards(get());
        return {
          app: "gailvlun",
          kind: "review-cards",
          version: 1,
          exportedAt: Date.now(),
          scope: "all",
          count: cards.length,
          cards,
        };
      },
    }),
    {
      name: PERSIST_KEYS.reviewCards,
      storage: "idb",
      partialize: (s) => ({ byId: s.byId, order: s.order }),
      onRehydrateStorage: () => (state) => {
        // 水合后把上次未完成的 processing/parsing 卡转为 error（原文仍在，可删/可重试），
        // 避免卡死在「处理中」。saved 态保持不变（还没开始处理，不需报错）。
        if (state) {
          for (const id of state.order) {
            const c = state.byId[id];
            if (c && (c.status === "processing" || c.status === "parsing")) {
              state.byId[id] = { ...c, status: "error", error: "上次处理未完成" };
            }
          }
        }
        state?._setHasHydrated(true);
      },
    },
);
