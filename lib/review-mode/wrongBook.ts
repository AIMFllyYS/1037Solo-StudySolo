// Review 模式错题本（Classolo issue #74：错题反向定位知识点并自动加固）。
//
// quiz-progress 只记每章得分，不存题干，无法「针对这道错题」出加固题。错题本补上这一环：
// 交卷时把答错的客观题连同出处（学科/章节 或 某节课）存下来，
// 错题智能出题与单题「加固」都以真实错题为依据；出处可一键跳回对应知识点。
//
// 存储：按统一账号 owner 分区（ss-user:<uuid>:review-wrong-book），未登录不落盘，
// 绝不把一个账号的错题带给下一个登录的人。

import { ownedStorageKey } from "@/lib/storage/ownerScope";
import type { QuizQuestion } from "@/lib/quiz/types";

export interface WrongSource {
  /** 学科 id；课堂来源为 "classroom"。 */
  subjectId: string;
  /** 章节 id；课堂来源为课堂 session id。 */
  chapterId: string;
  /** 章节所在板块（Studio 路由 /<subject>/<category>/<item>）；缺省 detail。 */
  categoryId?: string;
  /** 人类可读出处，如「概率论 · 随机事件与概率」「课堂 · 定积分」。 */
  label: string;
  quizId?: string;
  attemptId?: string;
  contentHash?: string;
}

export interface WrongEntry {
  id: string;
  stem: string;
  options?: string[];
  /** 正确答案的可读描述（如「C. A∩B̄」）。 */
  correct: string;
  explanation?: string;
  source: WrongSource;
  createdAt: string;
  /** 最近一次针对它生成加固题的时间。 */
  reinforcedAt?: string;
  /** Snapshot with the real stem/options/answer/explanation; legacy entries may lack it. */
  question?: QuizQuestion;
  questionKey?: string;
  contentHash?: string;
  attemptIds?: string[];
  /** Latest known objective outcome. Historical misses remain in `misses`. */
  latestCorrect?: boolean;
  lastWrongAnswer?: unknown;
  /** 答错次数（同一题再次答错会累加，而不是重复入库）。 */
  misses: number;
}

const NAME = "review-wrong-book";
export const WRONG_BOOK_LIMIT = 200;

type Store = Pick<Storage, "getItem" | "setItem">;
function storage(): Store | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readWrongBook(store: Store | null = storage(), key = ownedStorageKey(NAME)): WrongEntry[] {
  if (!store || !key) return [];
  try {
    const parsed = JSON.parse(store.getItem(key) || "[]");
    return Array.isArray(parsed) ? (parsed as WrongEntry[]).filter((e) => e && typeof e.stem === "string") : [];
  } catch {
    return [];
  }
}

function write(entries: WrongEntry[], store: Store | null, key: string | null): void {
  if (!store || !key) return;
  try {
    store.setItem(key, JSON.stringify(entries));
  } catch {
    /* 配额满时不静默删除用户已有错题，只放弃本次写入。 */
  }
}

/** 同一题的判定：题干去空白后一致即视为同一题（AI 每次出题 id 都不同）。 */
function fingerprint(stem: string): string {
  return stem.replace(/\s+/g, "").slice(0, 300);
}

export interface QuestionOutcome {
  question: QuizQuestion;
  correct: boolean | null;
  answer?: unknown;
}

/** Preserve immutable question context and count each attempt at most once. */
export function recordQuestionOutcomes(
  outcomes: readonly QuestionOutcome[],
  source: WrongSource,
  contentHash: string,
  attemptId: string,
  now = new Date(),
  store: Store | null = storage(),
  key = ownedStorageKey(NAME),
): number {
  if (!store || !key || outcomes.length === 0) return 0;
  const entries = readWrongBook(store, key);
  const byKey = new Map(entries.map((entry) => [entry.questionKey ?? `legacy:${fingerprint(entry.stem)}`, entry]));
  let changed = 0;
  for (const { question, correct, answer } of outcomes) {
    if (correct === null) continue;
    const questionKey = `ssq-v1:${contentHash}:${encodeURIComponent(question.id)}`;
    const existing = byKey.get(questionKey);
    if (existing) {
      const attempts = new Set(existing.attemptIds ?? []);
      const isNewAttempt = !attempts.has(attemptId);
      attempts.add(attemptId);
      existing.question = question;
      existing.questionKey = questionKey;
      existing.contentHash = contentHash;
      existing.latestCorrect = correct;
      if (!correct && answer !== undefined) existing.lastWrongAnswer = answer;
      existing.attemptIds = [...attempts];
      existing.misses += isNewAttempt && !correct ? 1 : 0;
      existing.createdAt = now.toISOString();
      existing.source = source;
      changed += 1;
      continue;
    }
    // Only create an entry after an actual miss. A later correct attempt updates it
    // without erasing its historical miss count.
    if (correct) continue;
    // Keep existing local history intact. The owner-bound attempt store remains the
    // source of truth when the bounded on-device convenience book is full.
    if (entries.length >= WRONG_BOOK_LIMIT) continue;
    const entry: WrongEntry = {
      id: `wb_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      stem: question.stem,
      options: question.options,
      correct: describeCorrect(question),
      explanation: typeof question.explanation === "string" ? question.explanation : undefined,
      source,
      createdAt: now.toISOString(),
      question,
      questionKey,
      contentHash,
      attemptIds: [attemptId],
      latestCorrect: false,
      ...(answer !== undefined ? { lastWrongAnswer: answer } : {}),
      misses: 1,
    };
    entries.unshift(entry);
    byKey.set(questionKey, entry);
    changed += 1;
  }
  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  write(entries, store, key);
  return changed;
}

export function describeCorrect(q: Pick<QuizQuestion, "type" | "options" | "answer">): string {
  const answer = q.answer as unknown;
  const letter = (i: number) => String.fromCharCode(65 + i);
  if (q.type === "true_false") return answer === 1 || answer === true ? "正确" : "错误";
  if (Array.isArray(answer)) return answer.map((i) => `${letter(Number(i))}. ${q.options?.[Number(i)] ?? ""}`).join("；");
  if (typeof answer === "number" && q.options) return `${letter(answer)}. ${q.options[answer] ?? ""}`;
  return typeof answer === "string" ? answer : JSON.stringify(answer ?? "");
}

/** 把本次答错的题并入错题本；返回新增/更新条数。 */
export function recordWrongQuestions(
  questions: readonly QuizQuestion[],
  source: WrongSource,
  now = new Date(),
  store: Store | null = storage(),
  key = ownedStorageKey(NAME),
): number {
  if (questions.length === 0 || !store || !key) return 0;
  if (source.attemptId && source.contentHash) {
    return recordQuestionOutcomes(questions.map((question) => ({ question, correct: false })), source, source.contentHash, source.attemptId, now, store, key);
  }
  const entries = readWrongBook(store, key);
  const byPrint = new Map(entries.map((e) => [fingerprint(e.stem), e]));
  let changed = 0;
  for (const q of questions) {
    const print = fingerprint(q.stem);
    const existing = byPrint.get(print);
    if (existing) {
      existing.misses += 1;
      existing.createdAt = now.toISOString();
      changed += 1;
      continue;
    }
    if (entries.length >= WRONG_BOOK_LIMIT) continue;
    const entry: WrongEntry = {
      id: `wb_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      stem: q.stem,
      options: q.options,
      correct: describeCorrect(q),
      explanation: typeof q.explanation === "string" ? q.explanation : undefined,
      source,
      createdAt: now.toISOString(),
      misses: 1,
      latestCorrect: false,
      question: q,
    };
    entries.unshift(entry);
    byPrint.set(print, entry);
    changed += 1;
  }
  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  write(entries, store, key);
  return changed;
}

export function markReinforced(ids: readonly string[], now = new Date(), store: Store | null = storage(), key = ownedStorageKey(NAME)): void {
  const set = new Set(ids);
  const entries = readWrongBook(store, key).map((e) => (set.has(e.id) ? { ...e, reinforcedAt: now.toISOString() } : e));
  write(entries, store, key);
}

/** 错题 → 出处页面（反向定位知识点）。 */
export function sourceHref(source: WrongSource): string | null {
  if (source.subjectId === "classroom") return `/class?session=${encodeURIComponent(source.chapterId)}`;
  if (!source.subjectId || source.subjectId === "review") return null;
  return `/${encodeURIComponent(source.subjectId)}/${encodeURIComponent(source.categoryId || "detail")}/${encodeURIComponent(source.chapterId)}`;
}

/** 以真实错题为依据的加固出题指令；entries 为空返回 null。 */
export function buildReinforcePrompt(entries: readonly WrongEntry[], limit = 8): string | null {
  const eligible = entries.filter((entry) => entry.latestCorrect !== true);
  const picked = eligible.slice(0, limit);
  if (picked.length === 0) return null;
  const blocks = picked.map((e, i) => {
    const options = e.options?.length ? `\n  选项：${e.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o}`).join("  ")}` : "";
    return `${i + 1}. 【${e.source.label}】${e.stem}${options}\n  正确答案：${e.correct}${e.explanation ? `\n  解析：${e.explanation}` : ""}\n  已答错 ${e.misses} 次`;
  });
  return (
    `以下是我真实答错且目前未正确掌握的题目。本次覆盖 ${picked.length}/${eligible.length} 道；` +
    `${eligible.length - picked.length} 道因本轮上下文上限未纳入，仍保留在错题本中。请先判断每道题考查的知识点，再针对这些知识点出一套加固题` +
    "（intent=diagnose，6–10 道）：每个知识点至少 1 道变式题，换数据/换情境/换问法，不要原题照抄；" +
    "每题 explanation 写明对应哪道错题的哪个易错点。\n\n" +
    blocks.join("\n\n")
  );
}
