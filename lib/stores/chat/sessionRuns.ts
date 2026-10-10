import { createPersistedStore } from "@/lib/stores/_persist";

/**
 * 每条会话的「后台运行」状态：让多条对话像 Codex 任务一样并发跑、切走继续跑。
 *
 * - **本地存储、不同步云**：只写 localStorage，不碰 scheduleCloudUpsert——
 *   运行状态是这台机器上「页面还活着」的事实，同步到别的设备只会撒谎。
 * - `running` 只在内存里真实存在：页面刷新/关闭会把在飞的 fetch 一起杀掉，
 *   所以 rehydrate 时把所有 `running` 归一化成 `interrupted` 并置 unseen——
 *   用户重开时在侧栏看到红色警示，而不是永远转圈。
 * - `unseen`（蓝点/红点的开关）在**运行结束那一刻**判定：用户没在看这条会话
 *   （不是当前 active，或整个标签页在后台）就置 true；`markViewed` 消掉。
 *   正在看的时候结束 → 不亮徽标（人已经看到结果/错误横幅了）。
 * - AbortController 不能持久化，放在模块级 Map 里（`registerController`/`abortRun`），
 *   与 byId 记录同生命周期：markRunning 时登记、终态/删除时清掉。
 */

export type SessionRunPhase = "running" | "done" | "error" | "interrupted";

export interface SessionRunRecord {
  phase: SessionRunPhase;
  /** 终态还没被用户看过 → 侧栏亮蓝点（done）/红点（error、interrupted）。 */
  unseen: boolean;
  /** error 阶段的说明；interrupted（刷新中断）不填——横幅交给「已停止」的消息态。 */
  error?: string;
  /** 流内瞬时提示（如「请求过大已截断」）；partialize 时不落盘。 */
  info?: string;
  startedAt: number;
  updatedAt: number;
}

const controllers = new Map<string, AbortController>();

interface SessionRunsState {
  byId: Record<string, SessionRunRecord>;
  /** 开始一次运行：清掉上一条终态/错误/提示，登记 abort 句柄。 */
  markRunning: (sessionId: string, controller: AbortController) => void;
  /** 正常结束（含用户主动停止——停止也是一种「看完了」）。unseen 由调用方按可见性算好。 */
  markDone: (sessionId: string, unseen: boolean) => void;
  /** 失败结束（含 stall 看门狗判死）。unseen 同上。 */
  markError: (sessionId: string, error: string, unseen: boolean) => void;
  /** 用户打开了这条会话：蓝点/红点熄灭。 */
  markViewed: (sessionId: string) => void;
  /** 流内 info（不落盘）。 */
  setInfo: (sessionId: string, info: string | null) => void;
  /** 清掉 error 文案（横幅关闭按钮）；不改 phase。 */
  clearError: (sessionId: string) => void;
  /** abort 这次运行（终态由 useChat 的 catch/finally 收口，这里只发信号）。 */
  abortRun: (sessionId: string) => void;
  /** 会话被删/被淘汰：abort + 抹掉记录。 */
  remove: (sessionId: string) => void;
  /** 启动后按真实会话清单清孤儿记录（别的设备删掉的、MAX_SESSIONS 淘汰的）。 */
  prune: (validSessionIds: ReadonlySet<string>) => void;
  /** 清 abort 句柄（请求终结后由 useChat 调用；按身份比对防误删新句柄）。 */
  releaseController: (sessionId: string, controller: AbortController) => void;
  /** rehydrate 后归一化：running 一律变 interrupted + unseen。 */
  _reconcileAfterRehydrate: () => void;
}

function put(
  byId: Record<string, SessionRunRecord>,
  sessionId: string,
  patch: Partial<SessionRunRecord>,
): Record<string, SessionRunRecord> {
  const prev = byId[sessionId];
  const base: SessionRunRecord = prev ?? {
    phase: "done",
    unseen: false,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  return { ...byId, [sessionId]: { ...base, ...patch, updatedAt: Date.now() } };
}

export const useSessionRuns = createPersistedStore<SessionRunsState>(
  (set, get) => ({
    byId: {},

    markRunning: (sessionId, controller) => {
      controllers.set(sessionId, controller);
      set((state) => ({
        byId: put(state.byId, sessionId, {
          phase: "running",
          unseen: false,
          error: undefined,
          info: undefined,
          startedAt: Date.now(),
        }),
      }));
    },

    markDone: (sessionId, unseen) => {
      controllers.delete(sessionId);
      // info 不清：终态横幅（如「已切换备用 API」）要留到用户关掉或下一次开跑。
      set((state) => ({
        byId: put(state.byId, sessionId, { phase: "done", unseen }),
      }));
    },

    markError: (sessionId, error, unseen) => {
      controllers.delete(sessionId);
      set((state) => ({
        byId: put(state.byId, sessionId, { phase: "error", error, unseen }),
      }));
    },

    markViewed: (sessionId) => {
      const run = get().byId[sessionId];
      if (!run || !run.unseen) return;
      set((state) => ({ byId: put(state.byId, sessionId, { unseen: false }) }));
    },

    setInfo: (sessionId, info) => {
      set((state) => ({ byId: put(state.byId, sessionId, { info: info ?? undefined }) }));
    },

    clearError: (sessionId) => {
      const run = get().byId[sessionId];
      if (!run?.error) return;
      set((state) => ({ byId: put(state.byId, sessionId, { error: undefined }) }));
    },

    abortRun: (sessionId) => {
      controllers.get(sessionId)?.abort();
    },

    remove: (sessionId) => {
      controllers.get(sessionId)?.abort();
      controllers.delete(sessionId);
      if (!get().byId[sessionId]) return;
      set((state) => {
        const byId = { ...state.byId };
        delete byId[sessionId];
        return { byId };
      });
    },

    prune: (validSessionIds) => {
      set((state) => {
        let changed = false;
        const byId: Record<string, SessionRunRecord> = {};
        for (const [id, run] of Object.entries(state.byId)) {
          // running 记录即使会话不在列表也先留着：会话可能还没水合完。
          if (run.phase === "running" || validSessionIds.has(id)) {
            byId[id] = run;
          } else {
            changed = true;
          }
        }
        return changed ? { byId } : state;
      });
    },

    releaseController: (sessionId, controller) => {
      if (controllers.get(sessionId) === controller) controllers.delete(sessionId);
    },

    _reconcileAfterRehydrate: () => {
      set((state) => {
        let changed = false;
        const byId: Record<string, SessionRunRecord> = {};
        for (const [id, run] of Object.entries(state.byId)) {
          if (run.phase === "running") {
            byId[id] = { ...run, phase: "interrupted", unseen: true, info: undefined, updatedAt: Date.now() };
            changed = true;
          } else {
            byId[id] = run;
          }
        }
        return changed ? { byId } : state;
      });
    },
  }),
  {
    name: "studysolo-session-runs",
    storage: "local",
    version: 1,
    // 只落 byId；info 是流内瞬时不写盘（undefined 序列化时自然消失）。
    partialize: (state) => ({ byId: state.byId }),
    onRehydrateStorage: () => (state) => {
      state?._reconcileAfterRehydrate();
    },
  },
);

/** 当前是否有任何会话在跑（侧栏「全局在跑」提示可用）。 */
export function selectAnySessionRunning(byId: Record<string, SessionRunRecord>): boolean {
  return Object.values(byId).some((run) => run.phase === "running");
}

/** 测试用：清内存句柄表。 */
export function __resetSessionRunControllers(): void {
  controllers.clear();
}
