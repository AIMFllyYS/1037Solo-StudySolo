import { create } from "zustand";
import type { QuizData, UserAnswer } from "@/lib/quiz/types";
import { autoGrade, isObjectivelyGradableQuestion, maxPointsOf } from "@/lib/quiz/types";
import { saveAttempt, getSession, clearSession } from "@/lib/quiz-progress";

import type { ReviewQuizSet } from "@/lib/review-mode/attemptTypes";
import { createQuizSetIdentity } from "@/lib/review-mode/quizSnapshot";
import { createAndCheckpointReviewAttempt, createReviewAttempt, findResumableReviewAttempt, loadLatestCompletedStaticAttempt, loadReviewAttemptById } from "@/lib/review-mode/progressSync";
import { getStorageOwner } from "@/lib/storage/ownerScope";
import { recordQuestionOutcomes } from "@/lib/review-mode/wrongBook";
import type { QuizState, QuizPhase, QuestionResult } from "./quiz/contracts";
import { newAttemptId, bankQuizId } from "./quiz/identity";
import { persistSession } from "./quiz/persistence";
import { rebuildResults, buildAttempt } from "./quiz/model";
import { createQuizCheckpoint } from "./quiz/checkpoint";
export type { QuizStatus, QuizPhase, QuestionResult, QuizState, QuizScoreBreakdown } from "./quiz/contracts";
export { buildAttempt, computeBreakdown } from "./quiz/model";
const ANSWERING_DEFAULTS = {
  phase: "answering" as QuizPhase,
  currentIndex: 0,
  answers: {} as Record<string, UserAnswer>,
  hintsUsed: [] as string[],
  results: [] as QuestionResult[],
};

export const useQuizStore = create<QuizState>((set, get) => {
  const checkpoint = createQuizCheckpoint(set, get);

  return {
    status: "idle",
    data: null,
    subjectId: "",
    chapterId: "",
    categoryId: "",
    quizId: "",
    attemptId: "",
    sourceKind: "static",
    quizSet: null,
    reviewAttempt: null,
    loadedKey: null,
    errorMessage: null,
    persistenceError: null,
    ...ANSWERING_DEFAULTS,

    load: async (subjectId, chapterId, categoryId = "") => {
      const key = `${subjectId}/${categoryId}/${chapterId}`;
      // 已是同一套题且加载成功，无需重复请求。
      if (get().loadedKey === key && get().status === "ready") return;
      if (!subjectId || !chapterId) {
        set({ status: "empty", data: null, subjectId, chapterId, categoryId, quizId: "", attemptId: "", sourceKind: "static", loadedKey: key, ...ANSWERING_DEFAULTS });
        return;
      }
      set({
        status: "loading",
        errorMessage: null,
        persistenceError: null,
        subjectId,
        chapterId,
        categoryId,
        loadedKey: key,
        ...ANSWERING_DEFAULTS,
      });
      try {
        const res = await fetch(
          `/api/quiz?subjectId=${encodeURIComponent(subjectId)}&chapterId=${encodeURIComponent(chapterId)}`,
        );
        // 当前章节未生成题目：API 返回 404。
        if (res.status === 404) {
          if (get().loadedKey === key) set({ status: "empty", data: null });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { quiz: QuizData | null };
        if (get().loadedKey !== key) return; // 期间已切换章节，丢弃过期结果
        if (!json.quiz || !json.quiz.questions?.length) {
          set({ status: "empty", data: null });
          return;
        }
        const quizId = bankQuizId(subjectId, categoryId, chapterId, json.quiz.generatedAt);
        const capturedOwner = getStorageOwner();
        const title = json.quiz.examConfig?.source?.trim() || `${subjectId} · ${chapterId}`;
        const identity = await createQuizSetIdentity({
          sourceKind: "static", subjectId, categoryId: categoryId || null, chapterId, quizId, title, quizData: json.quiz,
        });
        if (get().loadedKey !== key || getStorageOwner() !== capturedOwner) return;
        const quizSet: ReviewQuizSet = {
          ...identity, sourceKind: "static", subjectId, categoryId: categoryId || null, chapterId,
          quizId, title, quizData: json.quiz,
        };
        const saved = getSession(subjectId, chapterId, categoryId);
        const resumable = await findResumableReviewAttempt({ sourceKind: "static", subjectId, categoryId: categoryId || null, chapterId }, capturedOwner);
        if (get().loadedKey !== key || getStorageOwner() !== capturedOwner) return;
        if (resumable) {
          const restoredData = resumable.set.quizData;
          const restoredAttempt = resumable.attempt;
          const results = restoredAttempt.phase === "scoring" || restoredAttempt.phase === "summary"
            ? rebuildResults(restoredData.questions, restoredAttempt.answers, restoredAttempt.selfScores)
            : [];
          set({
            status: "ready", data: restoredData, quizSet: resumable.set, reviewAttempt: restoredAttempt,
            quizId: restoredAttempt.quizId, attemptId: restoredAttempt.attemptId, sourceKind: "static",
            answers: restoredAttempt.answers, phase: restoredAttempt.phase,
            currentIndex: Math.min(restoredAttempt.currentIndex, restoredData.questions.length - 1),
            hintsUsed: restoredAttempt.hintsUsed, results,
          });
          return;
        }
        const priorCompleted = saved?.attemptId
          ? await loadReviewAttemptById(saved.attemptId, capturedOwner).catch(() => null)
          : await loadLatestCompletedStaticAttempt({ subjectId, categoryId: categoryId || null, chapterId }, capturedOwner).catch(() => null);
        if (get().loadedKey !== key || getStorageOwner() !== capturedOwner) return;
        if (priorCompleted?.attempt.sourceKind === "static" && priorCompleted.attempt.phase === "summary"
          && priorCompleted.attempt.subjectId === subjectId && priorCompleted.attempt.chapterId === chapterId
          && priorCompleted.attempt.categoryId === (categoryId || null)) {
          const restoredAttempt = priorCompleted.attempt;
          const restoredData = priorCompleted.set.quizData;
          const results = rebuildResults(restoredData.questions, restoredAttempt.answers, restoredAttempt.selfScores);
          set({
            status: "ready", data: restoredData, quizSet: priorCompleted.set, reviewAttempt: restoredAttempt,
            quizId: restoredAttempt.quizId, attemptId: restoredAttempt.attemptId, sourceKind: "static",
            answers: restoredAttempt.answers, phase: "summary",
            currentIndex: Math.min(restoredAttempt.currentIndex, restoredData.questions.length - 1),
            hintsUsed: restoredAttempt.hintsUsed, results,
          });
          return;
        }
        if (saved?.phase === "summary" && !priorCompleted) {
          const currentIds = new Set(json.quiz.questions.map((q) => q.id));
          const savedIds = Object.keys(saved.answers);
          const matchCount = savedIds.filter((id) => currentIds.has(id)).length;
          const matchRate = savedIds.length > 0 ? matchCount / savedIds.length : 1;
          if (matchRate >= 0.5 && (!saved.quizId || saved.quizId === quizId)) {
            const restoredAnswers = { ...saved.answers };
            for (const id of savedIds) if (!currentIds.has(id)) delete restoredAnswers[id];
            set({
              status: "ready", data: json.quiz, quizSet, reviewAttempt: null,
              quizId: saved.quizId ?? quizId, attemptId: saved.attemptId ?? "", sourceKind: "static",
              answers: restoredAnswers, phase: "summary",
              currentIndex: Math.min(saved.currentIndex, json.quiz.questions.length - 1),
              hintsUsed: saved.hintsUsed,
              results: rebuildResults(json.quiz.questions, restoredAnswers, saved.selfScores),
            });
            return;
          }
        }
        const createdAttempt = await createAndCheckpointReviewAttempt(quizSet, capturedOwner);
        if (get().loadedKey !== key || getStorageOwner() !== capturedOwner) return;
        if (saved) {
          const currentIds = new Set(json.quiz.questions.map((q) => q.id));
          const savedIds = Object.keys(saved.answers);
          const matchCount = savedIds.filter((id) => currentIds.has(id)).length;
          const matchRate = savedIds.length > 0 ? matchCount / savedIds.length : 1;
          if (matchRate >= 0.5 && (!saved.quizId || saved.quizId === quizId)) {
            // 清理已不存在的题目答案
            const restoredAnswers = { ...saved.answers };
            for (const id of savedIds) {
              if (!currentIds.has(id)) delete restoredAnswers[id];
            }
            // 重建 results（若上次已交卷/已完成）
            const results =
              saved.phase === "scoring" || saved.phase === "summary"
                ? rebuildResults(json.quiz.questions, restoredAnswers, saved.selfScores)
                : [];
            set({
              status: "ready",
              data: json.quiz,
              quizSet,
              reviewAttempt: {
                ...createdAttempt,
                answers: restoredAnswers,
                phase: saved.phase,
                currentIndex: Math.min(saved.currentIndex, json.quiz.questions.length - 1),
                hintsUsed: saved.hintsUsed,
                selfScores: saved.selfScores,
                completedAt: saved.phase === "summary" ? saved.savedAt : null,
              },
              quizId,
              attemptId: createdAttempt.attemptId,
              sourceKind: "static",
              answers: restoredAnswers,
              phase: saved.phase,
              currentIndex: Math.min(saved.currentIndex, json.quiz.questions.length - 1),
              hintsUsed: saved.hintsUsed,
              results,
            });
            checkpoint(get());
            return;
          }
        }
        set({
          status: "ready",
          data: json.quiz,
          quizSet,
          reviewAttempt: createdAttempt,
          quizId,
          attemptId: createdAttempt.attemptId,
          sourceKind: "static",
          ...ANSWERING_DEFAULTS,
        });
      } catch (e) {
        if (get().loadedKey !== key) return;
        set({ status: "error", errorMessage: e instanceof Error ? e.message : "加载失败" });
      }
    },

    reset: () =>
      set({
        status: "idle",
        data: null,
        subjectId: "",
        chapterId: "",
        categoryId: "",
        quizId: "",
        attemptId: "",
        sourceKind: "static",
        quizSet: null,
        reviewAttempt: null,
        loadedKey: null,
        errorMessage: null,
        persistenceError: null,
        ...ANSWERING_DEFAULTS,
      }),

    setAnswer: (id, answer) => {
      set((s) => ({ answers: { ...s.answers, [id]: answer } }));
      persistSession(get());
      checkpoint(get());
    },

    useHint: (id) => {
      set((s) => (s.hintsUsed.includes(id) ? s : { hintsUsed: [...s.hintsUsed, id] }));
      persistSession(get());
      checkpoint(get());
    },

    goTo: (index) => {
      const total = get().data?.questions.length ?? 0;
      set({ currentIndex: Math.max(0, Math.min(index, Math.max(0, total - 1))) });
      persistSession(get());
      checkpoint(get());
    },
    next: () => get().goTo(get().currentIndex + 1),
    prev: () => get().goTo(get().currentIndex - 1),

    submit: () => {
      const { data, answers } = get();
      if (!data) return;
      const results: QuestionResult[] = data.questions.map((q) => {
        const answer = answers[q.id] ?? null;
        const max = maxPointsOf(q);
        const objective = isObjectivelyGradableQuestion(q);
        if (objective) {
          const [awarded, correct] = autoGrade(q, answer);
          return { question: q, answer, awarded, max, correct, objective, selfScored: false };
        }
        // 主观题：待用户自评，初始 0 分。
        return { question: q, answer, awarded: 0, max, correct: false, objective, selfScored: false };
      });
      set({ results, phase: "scoring" });
      // 「分数首先确保存储在本地」：交卷即把客观分落地（随后才在评分页展示解析）。
      const s = get();
      const attempt = buildAttempt(s, "submitted");
      saveAttempt(s.subjectId, s.chapterId, attempt);
      if (s.reviewAttempt?.contentHash && s.reviewAttempt.attemptId) {
        recordQuestionOutcomes(
          s.results.map((result) => ({ question: result.question, correct: result.objective ? result.correct : null, answer: result.answer })),
          {
            subjectId: s.subjectId,
            chapterId: s.chapterId,
            categoryId: s.categoryId || undefined,
            label: s.quizSet?.title ?? s.chapterId,
            quizId: s.quizId,
            attemptId: s.reviewAttempt.attemptId,
            contentHash: s.reviewAttempt.contentHash,
          },
          s.reviewAttempt.contentHash,
          s.reviewAttempt.attemptId,
        );
        if (typeof window !== "undefined") window.dispatchEvent(new Event("studysolo:review-wrong-book-change"));
      }
      persistSession(s);
      checkpoint(s);
    },

    setSelfScore: (id, awarded) => {
      set((s) => ({
        results: s.results.map((r) =>
          r.question.id === id
            ? { ...r, awarded: Math.max(0, Math.min(awarded, r.max)), selfScored: true }
            : r,
        ),
      }));
      persistSession(get());
      checkpoint(get());
    },

    finishScoring: () => {
      set({ phase: "summary" });
      const s = get();
      // 自评完成 → 存最终成绩，更新历史最佳与作答次数。
      saveAttempt(s.subjectId, s.chapterId, buildAttempt(s, "final"));
      persistSession(s);
      checkpoint(s);
    },
    backToScoring: () => {
      set({ phase: "scoring" });
      persistSession(get());
      checkpoint(get());
    },

    restart: () => {
      const s = get();
      if (s.subjectId && s.chapterId) clearSession(s.subjectId, s.chapterId, s.categoryId);
      const reviewAttempt = s.quizSet ? createReviewAttempt(s.quizSet, s.reviewAttempt?.ownerId ?? getStorageOwner()) : null;
      set({ ...ANSWERING_DEFAULTS, attemptId: reviewAttempt?.attemptId ?? newAttemptId(), reviewAttempt });
      checkpoint(get());
    },
  };
});
