import { z } from "zod";

import { createServiceAuthClient } from "@/lib/auth/server/serviceClient";
import type { QuizQuestion } from "@/lib/quiz/types";
import { estimateReviewTokens, formatQuestionContext, type ReviewQuestionContext } from "@/lib/review-mode/quizContext";
import { ReviewQuizError } from "./errors";
import type { localQuestionSchema } from "./request";
export function safeLocalQuestion(entry: z.infer<typeof localQuestionSchema>): ReviewQuestionContext {
  const question = entry.question as unknown as QuizQuestion;
  return {
    key: entry.key,
    title: entry.title,
    quizId: entry.quizId,
    question,
    misses: entry.misses,
    latestAttemptAt: entry.latestAttemptAt,
    lastWrongAnswer: entry.lastWrongAnswer,
  };
}

interface OwnedWrongLoad {
  contexts: ReviewQuestionContext[];
  candidateKeys: string[];
  totalWrongQuestions: number;
  omittedWrongQuestions: number;
  requestedAttempts: number;
  foundAttempts: number;
}

export async function loadOwnedWrongQuestions(ownerId: string, attemptIds: string[], tokenBudget: number): Promise<OwnedWrongLoad> {
  const uniqueIds = [...new Set(attemptIds)];
  if (uniqueIds.length === 0) return { contexts: [], candidateKeys: [], totalWrongQuestions: 0, omittedWrongQuestions: 0, requestedAttempts: 0, foundAttempts: 0 };
  const db = createServiceAuthClient();
  const attempts: Array<Record<string, unknown>> = [];
  const foundIds = new Set<string>();
  // Bound each database response; an account may send up to 1,000 attempt IDs.
  for (let start = 0; start < uniqueIds.length; start += 25) {
    const batch = uniqueIds.slice(start, start + 25);
    const { data, error } = await db.from("ss_review_quiz_attempts")
      .select("attempt_id,quiz_set_id,quiz_id,title,question_results,answers,updated_at,completed_at")
      .eq("user_id", ownerId).eq("attempt_kind", "quiz").in("attempt_id", batch)
      .order("updated_at", { ascending: false }).limit(batch.length);
    if (error) throw new ReviewQuizError(503, "REVIEW_CONTEXT_UNAVAILABLE");
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      attempts.push(row);
      if (typeof row.attempt_id === "string") foundIds.add(row.attempt_id);
    }
  }
  type Latest = {
    key: string; quizSetId: string; questionId: string; title: string; quizId: string; misses: number;
    latestCorrect: boolean; latestAttemptAt: string; lastWrongAnswer?: unknown;
  };
  const byQuestion = new Map<string, Latest>();
  attempts.sort((a, b) => String(b.completed_at ?? b.updated_at ?? "").localeCompare(String(a.completed_at ?? a.updated_at ?? "")));
  for (const attempt of attempts) {
    if (typeof attempt.quiz_set_id !== "string" || !Array.isArray(attempt.question_results)) continue;
    const time = String(attempt.completed_at ?? attempt.updated_at ?? "");
    for (const raw of attempt.question_results as Array<Record<string, unknown>>) {
      if (raw.objective !== true || typeof raw.correct !== "boolean" || typeof raw.id !== "string") continue;
      const key = typeof raw.questionKey === "string" ? raw.questionKey : `${attempt.quiz_set_id}:${raw.id}`;
      const existing = byQuestion.get(key);
      if (!existing) {
        byQuestion.set(key, {
          key, quizSetId: attempt.quiz_set_id, questionId: raw.id, title: String(attempt.title ?? "Review quiz"),
          quizId: String(attempt.quiz_id ?? ""), misses: raw.correct ? 0 : 1, latestCorrect: raw.correct,
          latestAttemptAt: time,
          ...(!raw.correct ? { lastWrongAnswer: (attempt.answers as Record<string, unknown> | null)?.[raw.id] } : {}),
        });
      } else {
        if (!raw.correct) existing.misses += 1;
        if (time > existing.latestAttemptAt) {
          existing.latestCorrect = raw.correct;
          existing.latestAttemptAt = time;
          existing.title = String(attempt.title ?? existing.title);
          existing.quizId = String(attempt.quiz_id ?? existing.quizId);
          existing.quizSetId = attempt.quiz_set_id;
          existing.questionId = raw.id;
          if (!raw.correct) existing.lastWrongAnswer = (attempt.answers as Record<string, unknown> | null)?.[raw.id];
        }
      }
    }
  }
  const candidates = [...byQuestion.values()].filter((item) => !item.latestCorrect)
    .sort((a, b) => b.latestAttemptAt.localeCompare(a.latestAttemptAt) || b.misses - a.misses);
  const output: ReviewQuestionContext[] = [];
  const loadedSets = new Map<string, Record<string, unknown>>();
  let usedTokens = 0;
  let index = 0;
  while (index < candidates.length && usedTokens < tokenBudget) {
    const batch = candidates.slice(index, index + 20);
    index += batch.length;
    const missingSetIds = [...new Set(batch.map((item) => item.quizSetId).filter((id) => !loadedSets.has(id)))];
    if (missingSetIds.length) {
      const { data, error } = await db.from("ss_review_quiz_sets")
        .select("id,quiz_data,content_hash").eq("user_id", ownerId).in("id", missingSetIds).limit(missingSetIds.length);
      if (error) throw new ReviewQuizError(503, "REVIEW_CONTEXT_UNAVAILABLE");
      for (const set of (data ?? []) as Array<Record<string, unknown>>) loadedSets.set(String(set.id), set);
    }
    for (const item of batch) {
      const set = loadedSets.get(item.quizSetId);
      const quiz = set?.quiz_data as { questions?: QuizQuestion[] } | undefined;
      const question = quiz?.questions?.find((candidate) => candidate.id === item.questionId);
      if (!question) continue;
      const context: ReviewQuestionContext = {
        key: item.key, title: item.title, quizId: item.quizId, question, misses: Math.max(1, item.misses),
        latestAttemptAt: item.latestAttemptAt, lastWrongAnswer: item.lastWrongAnswer,
      };
      const cost = estimateReviewTokens(formatQuestionContext(context));
      if (usedTokens + cost > tokenBudget) {
        index = candidates.length;
        break;
      }
      output.push(context);
      usedTokens += cost;
    }
    // Release already-consumed large immutable snapshots; attempt rows remain small metadata only.
    for (const id of missingSetIds) loadedSets.delete(id);
  }
  return {
    contexts: output,
    candidateKeys: candidates.map((item) => item.key),
    totalWrongQuestions: candidates.length,
    omittedWrongQuestions: Math.max(0, candidates.length - output.length),
    requestedAttempts: uniqueIds.length,
    foundAttempts: foundIds.size,
  };
}