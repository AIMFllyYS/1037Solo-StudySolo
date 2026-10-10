import { getStorageOwner } from "@/lib/storage/ownerScope";
import type { ChapterProgress, QuizAttempt, QuizSession, ProgressEntry, GlobalSummary } from "./contracts";
import { loadAll, persistAll } from "./io";
import { scopedKeyOf, keyOf, createLocalId } from "./keys";
import { toProgressEntries } from "./entries";
import { objectiveAttemptsOf, objectiveBestOf } from "./metrics";
/** 读取某章节成绩档案（无则 null）。 */
export function getChapterProgress(
  subjectId: string,
  chapterId: string,
  categoryId?: string | null,
): ChapterProgress | null {
  if (!subjectId || !chapterId) return null;
  const map = loadAll();
  if (categoryId) {
    const scoped = map[scopedKeyOf(subjectId, chapterId, categoryId)];
    if (scoped) return scoped;
    return getStorageOwner() ? null : map[keyOf(subjectId, chapterId)] ?? null;
  }
  return map[keyOf(subjectId, chapterId)] ?? null;
}

/**
 * 保存一次作答记录到本地。
 * - stage="submitted"：交卷即存（客观分已定），保证「分数先落地」。
 * - stage="final"：自评完成后存最终分，更新 best 与 attempts。
 * 返回是否写入成功（localStorage 不可用时为 false）。
 */
export function saveAttempt(
  subjectId: string,
  chapterId: string,
  attempt: QuizAttempt,
): boolean {
  if (!subjectId || !chapterId) return false;
  const map = loadAll();
  const k = scopedKeyOf(subjectId, chapterId, attempt.categoryId);
  const prev = map[k];
  const attemptId = attempt.attemptId ?? createLocalId();
  const completedAttemptIds = prev?.completedAttemptIds ?? [];
  const countedAlready = attempt.stage === "final" && completedAttemptIds.includes(attemptId);
  const hasScore = typeof attempt.percent === "number" && Number.isFinite(attempt.percent);
  const objectiveCount = attempt.objectiveCount ?? attempt.perQuestion?.filter((item) => item.correct !== null).length ?? 0;
  const hasObjectiveScore = objectiveCount > 0;
  const best = hasScore ? Math.max(prev?.best ?? 0, attempt.percent!) : (prev?.best ?? 0);
  const attempts = (prev?.attempts ?? 0) + (attempt.stage === "final" && !countedAlready ? 1 : 0);
  const objectiveIds = prev?.objectiveAttemptIds ?? [];
  const objectiveCountedAlready = objectiveIds.includes(attemptId);
  const objectiveAttempts = (prev?.objectiveAttempts ?? 0)
    + (attempt.stage === "final" && hasObjectiveScore && !objectiveCountedAlready ? 1 : 0);
  const objectiveBest = attempt.objectiveAccuracy == null
    ? (prev?.objectiveBest ?? 0)
    : Math.max(prev?.objectiveBest ?? 0, attempt.objectiveAccuracy);
  const nextCompletedIds = attempt.stage === "final" && !countedAlready
    ? [...completedAttemptIds, attemptId]
    : completedAttemptIds;
  const nextObjectiveIds = attempt.stage === "final" && hasObjectiveScore && !objectiveCountedAlready
    ? [...objectiveIds, attemptId]
    : objectiveIds;
  const savedAttempt: QuizAttempt = {
    ...attempt,
    attemptId,
    perQuestion: attempt.perQuestion?.map((item) => ({ ...item })),
  };
  delete savedAttempt.answersSnapshot;
  delete savedAttempt.selfScores;
  delete savedAttempt.currentIndex;
  delete savedAttempt.quizSnapshot;
  map[k] = {
    best,
    objectiveBest,
    last: savedAttempt,
    attempts,
    objectiveAttempts,
    completedAttemptIds: nextCompletedIds,
    objectiveAttemptIds: nextObjectiveIds,
  };
  return persistAll(map);
}

// ── 答题会话（session）持久化 ──────────────────────────────────

/** 保存最新答题会话到本地（覆盖式，仅保留一份）。 */
export function saveSession(
  subjectId: string,
  chapterId: string,
  session: QuizSession,
): boolean {
  if (!subjectId || !chapterId) return false;
  const map = loadAll();
  const k = scopedKeyOf(subjectId, chapterId, session.categoryId);
  const prev = map[k];
  // 保留已有的 best/last/attempts，仅更新 session。
  map[k] = {
    best: prev?.best ?? 0,
    last: prev?.last ?? { earned: 0, max: 0, percent: 0, completedAt: "", stage: "submitted" },
    attempts: prev?.attempts ?? 0,
    objectiveBest: prev?.objectiveBest ?? 0,
    objectiveAttempts: prev?.objectiveAttempts ?? 0,
    completedAttemptIds: prev?.completedAttemptIds ?? [],
    objectiveAttemptIds: prev?.objectiveAttemptIds ?? [],
    session,
  };
  return persistAll(map);
}

/** 读取最新答题会话（无则 null）。 */
export function getSession(
  subjectId: string,
  chapterId: string,
  categoryId?: string | null,
): QuizSession | null {
  if (!subjectId || !chapterId) return null;
  const map = loadAll();
  if (categoryId) {
    const scoped = map[scopedKeyOf(subjectId, chapterId, categoryId)]?.session;
    if (scoped) return scoped;
    return getStorageOwner() ? null : map[keyOf(subjectId, chapterId)]?.session ?? null;
  }
  return map[keyOf(subjectId, chapterId)]?.session ?? null;
}

/** 清除答题会话（重做时调用，保留 best/last/attempts）。 */
export function clearSession(
  subjectId: string,
  chapterId: string,
  categoryId?: string | null,
): boolean {
  if (!subjectId || !chapterId) return false;
  const map = loadAll();
  const k = scopedKeyOf(subjectId, chapterId, categoryId);
  const prev = map[k];
  if (!prev?.session) return true;
  map[k] = {
    best: prev.best,
    objectiveBest: prev.objectiveBest,
    last: prev.last,
    attempts: prev.attempts,
    objectiveAttempts: prev.objectiveAttempts,
    completedAttemptIds: prev.completedAttemptIds,
    objectiveAttemptIds: prev.objectiveAttemptIds,
  };
  return persistAll(map);
}

/** 读取全部章节成绩（仅含已作答的章节）。 */
export function getAllProgress(): ProgressEntry[] {
  return toProgressEntries(loadAll());
}

export function getGlobalSummary(entries?: ProgressEntry[]): GlobalSummary {
  const list = (entries ?? getAllProgress()).filter((entry) => objectiveAttemptsOf(entry.progress) > 0 && objectiveBestOf(entry.progress) !== null);
  if (list.length === 0) return { chapters: 0, avgBest: 0, totalAttempts: 0, bestEver: 0 };
  const sumBest = list.reduce((a, e) => a + (objectiveBestOf(e.progress) ?? 0), 0);
  const totalAttempts = list.reduce((a, e) => a + objectiveAttemptsOf(e.progress), 0);
  const bestEver = list.reduce((a, e) => Math.max(a, objectiveBestOf(e.progress) ?? 0), 0);
  return {
    chapters: list.length,
    avgBest: Math.round((sumBest / list.length) * 10) / 10,
    totalAttempts,
    bestEver,
  };
}

/** 清空全部成绩，返回是否成功。 */
export function clearAllProgress(): boolean {
  return persistAll({});
}

/** 删除单章成绩，返回是否成功。 */
export function clearChapterProgress(subjectId: string, chapterId: string, categoryId?: string | null): boolean {
  const map = loadAll();
  delete map[scopedKeyOf(subjectId, chapterId, categoryId)];
  return persistAll(map);
}