// 题目测试成绩本地持久化（localStorage）。
// 交卷评分后，分数「首先确保存储在本地」，随后才展示详细解析；刷新/重进不丢成绩。
// 与 useSettings 一致的轻量 load/persist 模式，纯客户端使用（SSR 安全降级）。
// 答题会话（session）仅保留一份最新，用于恢复退出前的答题现场。

import type { QuizData, UserAnswer } from "@/lib/quiz/types";
import { getStorageOwner, onStorageOwnerChange, ownedStorageKeyFor } from "@/lib/storage/ownerScope";

const LS_KEY = "gailvlun-quiz-progress-v1";
const OWNER_PROGRESS_KEY = "review-quiz-progress-v2";
const LEGACY_IMPORT_STATE_KEY = "review-quiz-legacy-import-v1";
const OWNER_LEGACY_IMPORTED_KEY = "review-quiz-legacy-imported-v1";
const CHANGE_EVENT = "studysolo:quiz-progress-change";

/** 单题得分快照（用于回看 / 统计）。 */
export interface QuestionScore {
  id: string;
  /** Stable location id: static questions include subject/category/chapter; generated questions include quizId. */
  questionKey?: string;
  awarded: number;
  max: number;
  /** 客观题是否完全答对；主观题为 null。 */
  correct: boolean | null;
  /** 主观题只有用户明确自评后才计入分母。 */
  scored?: boolean;
}

/** 一次作答记录。 */
export interface QuizAttempt {
  /** Human-readable source title; generated quiz namespaces aren't chapter labels. */
  title?: string;
  earned: number;
  max: number;
  /** 百分制得分（保留一位小数）。 */
  percent: number | null;
  /** 完成时间（ISO 字符串）。 */
  completedAt: string;
  /** 阶段：submitted=刚交卷(客观分已定)，final=自评完成。 */
  stage: "submitted" | "final";
  hintsUsed?: number;
  perQuestion?: QuestionScore[];
  attemptId?: string;
  quizId?: string;
  categoryId?: string;
  sourceKind?: "static" | "review-wrong" | "review-chapter" | "classroom" | "legacy-import";
  objectiveCount?: number;
  correctCount?: number;
  scoredCount?: number;
  /** Accuracy over objectively gradable questions only. */
  objectiveAccuracy?: number | null;
  answersSnapshot?: Record<string, UserAnswer>;
  selfScores?: Record<string, number>;
  currentIndex?: number;
  quizSnapshot?: QuizData;
  /** Local idempotency ledger: prevents a repeated final/save from counting twice. */
  completedAttemptIds?: string[];
}

/** 某章节的成绩档案。 */
export interface ChapterProgress {
  /** 历史最佳百分制。 */
  best: number;
  /** 最近一次作答。 */
  last: QuizAttempt;
  /** 累计作答次数（仅统计 final）。 */
  attempts: number;
  objectiveBest?: number;
  objectiveAttempts?: number;
  objectiveAttemptIds?: string[];
  completedAttemptIds?: string[];
  /** 最新答题会话（用于恢复退出前的答题现场，仅保留一份）。 */
  session?: QuizSession;
}

/** 答题会话快照（仅保留一份最新，用于恢复退出前的答题现场）。 */
export interface QuizSession {
  answers: Record<string, UserAnswer>;
  phase: "answering" | "scoring" | "summary";
  currentIndex: number;
  hintsUsed: string[];
  /** 主观题自评分快照（questionId → awarded），用于恢复 scoring/summary 阶段。 */
  selfScores: Record<string, number>;
  savedAt: string;
  attemptId?: string;
  quizId?: string;
  categoryId?: string;
  sourceKind?: "static" | "review-wrong" | "review-chapter" | "classroom";
}

type ProgressMap = Record<string, ChapterProgress>;

function keyOf(subjectId: string, chapterId: string): string {
  return `${subjectId}/${chapterId}`;
}

function scopedKeyOf(subjectId: string, chapterId: string, categoryId?: string | null): string {
  return categoryId ? `${subjectId}/${categoryId}/${chapterId}` : keyOf(subjectId, chapterId);
}

function activeProgressKey(): string | null {
  const owner = getStorageOwner();
  return owner ? ownedStorageKeyFor(owner, OWNER_PROGRESS_KEY) : LS_KEY;
}

function readAt(key: string | null): ProgressMap {
  if (typeof window === "undefined" || !key) return {};
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ProgressMap : {};
  } catch {
    return {};
  }
}

function loadAll(): ProgressMap {
  if (typeof window === "undefined") return {};
  return readAt(activeProgressKey());
}

function persistAll(map: ProgressMap): boolean {
  if (typeof window === "undefined") return false;
  const key = activeProgressKey();
  if (!key) return false;
  try {
    localStorage.setItem(key, JSON.stringify(map));
    notifyQuizProgressChanged();
    return true;
  } catch {
    return false;
  }
}

/** The v1 key has no owner; it remains a separate local-only history until the user imports it. */
export function getLegacyLocalProgress(): ProgressEntry[] {
  if (typeof window === "undefined") return [];
  return toProgressEntries(readAt(LS_KEY));
}

export function hasLegacyLocalProgress(): boolean {
  return getLegacyLocalProgress().length > 0;
}

export function getLegacyImportState(ownerId = getStorageOwner()): { importId: string; status: "pending" | "complete"; localImported?: boolean } | null {
  if (!ownerId || typeof window === "undefined") return null;
  try {
    const key = ownedStorageKeyFor(ownerId, LEGACY_IMPORT_STATE_KEY);
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record.importId !== "string" || (record.status !== "pending" && record.status !== "complete")) return null;
    return { importId: record.importId, status: record.status, localImported: record.localImported === true };
  } catch {
    return null;
  }
}

/** Create/reuse a per-owner idempotency marker only after an explicit user action. */
export function beginLegacyImport(ownerId = getStorageOwner()): { importId: string; entries: ProgressEntry[] } | null {
  if (!ownerId || ownerId !== getStorageOwner() || !hasLegacyLocalProgress() || getLegacyImportState(ownerId)?.status === "complete") return null;
  const current = getLegacyImportState(ownerId);
  const importId = current?.importId ?? createLocalId();
  try {
    localStorage.setItem(ownedStorageKeyFor(ownerId, LEGACY_IMPORT_STATE_KEY), JSON.stringify({ importId, status: "pending" }));
  } catch {
    return null;
  }
  return { importId, entries: getLegacyLocalProgress() };
}

export function completeLegacyImport(ownerId: string, importId: string): boolean {
  if (ownerId !== getStorageOwner()) return false;
  const current = getLegacyImportState(ownerId);
  if (!current || current.importId !== importId) return false;
  try {
    localStorage.setItem(ownedStorageKeyFor(ownerId, LEGACY_IMPORT_STATE_KEY), JSON.stringify({ importId, status: "complete" }));
    notifyQuizProgressChanged();
    return true;
  } catch {
    return false;
  }
}

/** Explicit one-time merge, called only after the import API has persisted the same legacy rows. */
export function importLegacyProgressLocally(ownerId: string): boolean {
  if (!ownerId || ownerId !== getStorageOwner()) return false;
  const marker = getLegacyImportState(ownerId);
  if (!marker || marker.status === "complete") return false;
  if (marker.localImported) return true;
  const legacy = readAt(LS_KEY);
  if (!Object.keys(legacy).length) return false;
  try {
    // Keep historical aggregates visibly separate from objective mastery and snapshots.
    localStorage.setItem(ownedStorageKeyFor(ownerId, OWNER_LEGACY_IMPORTED_KEY), JSON.stringify(legacy));
    localStorage.setItem(ownedStorageKeyFor(ownerId, LEGACY_IMPORT_STATE_KEY), JSON.stringify({ ...marker, localImported: true }));
    notifyQuizProgressChanged();
    return true;
  } catch {
    return false;
  }
}

/** Explicitly imported v1 aggregates are available for history UI, never as question context. */
export function getOwnerLegacyImportedProgress(ownerId = getStorageOwner()): ProgressEntry[] {
  if (!ownerId || ownerId !== getStorageOwner()) return [];
  return toProgressEntries(readAt(ownedStorageKeyFor(ownerId, OWNER_LEGACY_IMPORTED_KEY)));
}

/** Hydrate a server summary on another device without treating it as current mastery or question context. */
export function saveOwnerLegacyImportedSummary(input: {
  ownerId: string;
  subjectId: string;
  categoryId: string | null;
  chapterId: string;
  best: number;
  attempts: number;
  lastPercent: number | null;
  completedAt: string;
  stage: "submitted" | "final";
}): boolean {
  if (!input.ownerId || input.ownerId !== getStorageOwner() || !input.subjectId || !input.chapterId) return false;
  const key = ownedStorageKeyFor(input.ownerId, OWNER_LEGACY_IMPORTED_KEY);
  const map = readAt(key);
  const scope = scopedKeyOf(input.subjectId, input.chapterId, input.categoryId);
  // A locally imported full v1 summary is richer than the intentionally compact server page.
  if (map[scope]) return true;
  map[scope] = {
    best: input.best,
    attempts: input.attempts,
    objectiveBest: 0,
    objectiveAttempts: 0,
    completedAttemptIds: [],
    objectiveAttemptIds: [],
    last: {
      earned: 0,
      max: 0,
      percent: input.lastPercent,
      completedAt: input.completedAt,
      stage: input.stage,
    },
  };
  try {
    localStorage.setItem(key, JSON.stringify(map));
    notifyQuizProgressChanged();
    return true;
  } catch {
    return false;
  }
}

function createLocalId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* test/older browser fallback below */
  }
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

const progressListeners = new Set<() => void>();
let storageListenerBound = false;
let progressVersion = 0;
export function getQuizProgressVersion(): number {
  return progressVersion;
}
export function subscribeQuizProgress(listener: () => void): () => void {
  progressListeners.add(listener);
  if (!storageListenerBound && typeof window !== "undefined") {
    storageListenerBound = true;
    window.addEventListener("storage", (event) => {
      const key = activeProgressKey();
      if (key && event.key === key) notifyQuizProgressChanged(false);
    });
  }
  return () => progressListeners.delete(listener);
}

onStorageOwnerChange(() => notifyQuizProgressChanged());

function notifyQuizProgressChanged(dispatch = true): void {
  progressVersion++;
  for (const listener of [...progressListeners]) listener();
  if (dispatch && typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

function toProgressEntries(map: ProgressMap): ProgressEntry[] {
  return Object.entries(map).map(([k, progress]) => {
    const parts = k.split("/");
    const scoped = parts.length >= 3;
    return {
      subjectId: parts[0] ?? k,
      ...(scoped ? { categoryId: parts[1] } : {}),
      chapterId: scoped ? parts.slice(2).join("/") : parts.slice(1).join("/"),
      progress,
    };
  });
}

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

// ── 全局成绩（设置面板「全局分数」消费）─────────────────────────

/** 一条章节成绩档案（已带回 subject/chapter 标识，便于聚合展示）。 */
export interface ProgressEntry {
  subjectId: string;
  categoryId?: string;
  chapterId: string;
  progress: ChapterProgress;
}

/** 读取全部章节成绩（仅含已作答的章节）。 */
export function getAllProgress(): ProgressEntry[] {
  return toProgressEntries(loadAll());
}

/** Objective-only mastery fields; legacy-only scores intentionally return null/zero. */
export function objectiveBestOf(progress: ChapterProgress): number | null {
  return typeof progress.objectiveBest === "number" && Number.isFinite(progress.objectiveBest) ? progress.objectiveBest : null;
}

export function objectiveAttemptsOf(progress: ChapterProgress): number {
  if (typeof progress.objectiveAttempts === "number") return progress.objectiveAttempts;
  const attempt = progress.last;
  if (typeof attempt?.objectiveCount === "number") return attempt.objectiveCount > 0 ? progress.attempts : 0;
  return attempt?.perQuestion?.some((item) => item.correct !== null) ? progress.attempts : 0;
}

export function objectiveAccuracyOf(progress: ChapterProgress): number | null {
  const attempt = progress.last;
  if (typeof attempt?.objectiveAccuracy === "number" && Number.isFinite(attempt.objectiveAccuracy)) return attempt.objectiveAccuracy;
  const perQuestion = attempt?.perQuestion?.filter((item) => item.correct !== null) ?? [];
  if (perQuestion.length) return Math.round((perQuestion.filter((item) => item.correct === true).length / perQuestion.length) * 1000) / 10;
  if (typeof attempt?.objectiveCount === "number" && attempt.objectiveCount > 0 && typeof attempt.correctCount === "number") {
    return Math.round((attempt.correctCount / attempt.objectiveCount) * 1000) / 10;
  }
  return null;
}

/** 全局成绩汇总。 */
export interface GlobalSummary {
  /** 已测验的章节数 */
  chapters: number;
  /** 各章历史最佳分的平均（百分制，保留一位小数） */
  avgBest: number;
  /** 累计作答次数（final） */
  totalAttempts: number;
  /** 单章最高分 */
  bestEver: number;
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

// ── 展示辅助（标签 / 排序 / 评级）──────────────────────────────

/** 章节 id → 中文短标签：ch07→「第 7 章」、rec-03→「录音 3」、sum-01→「纪要 1」。 */
export function chapterLabel(chapterId: string): string {
  const m = /^([a-z]+)-?0*(\d+)$/i.exec(chapterId);
  if (m) {
    const prefix = m[1].toLowerCase();
    const n = m[2];
    if (prefix === "ch") return `第 ${n} 章`;
    if (prefix === "rec") return `录音 ${n}`;
    if (prefix === "sum") return `纪要 ${n}`;
  }
  return chapterId;
}

function chapterRank(id: string): [number, number] {
  const m = /^([a-z]+)-?0*(\d+)/i.exec(id);
  const prefix = (m?.[1] ?? id).toLowerCase();
  const num = m ? parseInt(m[2], 10) : 0;
  const order = prefix === "ch" ? 0 : prefix === "rec" ? 1 : prefix === "sum" ? 2 : 3;
  return [order, num];
}

/** 章节排序：ch < rec < sum，组内按编号升序。 */
export function compareChapter(a: string, b: string): number {
  const [ra, na] = chapterRank(a);
  const [rb, nb] = chapterRank(b);
  return ra - rb || na - nb;
}

/** 百分制 → 评级（与 QuizSummary 一致的色阶）。 */
export function scoreGrade(percent: number): { label: string; color: string } {
  if (percent >= 90) return { label: "优秀", color: "var(--color-success)" };
  if (percent >= 80) return { label: "良好", color: "var(--color-info)" };
  if (percent >= 60) return { label: "及格", color: "var(--color-warning)" };
  return { label: "待加强", color: "var(--md-sys-color-error)" };
}
