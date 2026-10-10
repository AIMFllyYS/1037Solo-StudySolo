import { type SessionRunRecord } from "@/lib/stores/chat/sessionRuns";

import type { SessionMeta } from "@/lib/storage/chatStorage";

/**
 * 项目折叠时把成员会话的真实运行态聚成一条徽标。
 * 优先级为 running > 未读错误 > 未读完成；没有未读结果时保留最新终态的淡提示。
 */
export function aggregateProjectRun(
  sessions: SessionMeta[],
  byId: Record<string, SessionRunRecord>,
): SessionRunRecord | undefined {
  const runs = sessions.map((s) => byId[s.id]).filter(Boolean) as SessionRunRecord[];
  const latest = (candidates: SessionRunRecord[]) =>
    candidates.reduce<SessionRunRecord | undefined>(
      (current, run) => !current || run.startedAt > current.startedAt ? run : current,
      undefined,
    );
  return latest(runs.filter((run) => run.phase === "running"))
    ?? latest(runs.filter((run) => run.unseen && (run.phase === "error" || run.phase === "interrupted")))
    ?? latest(runs.filter((run) => run.unseen && run.phase === "done"))
    // When the group is collapsed, retain the newest real terminal state in a faint tone too.
    ?? latest(runs.filter((run) => run.phase !== "running"));
}