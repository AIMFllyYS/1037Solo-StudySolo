import type { QuizAttempt } from "@/lib/quiz-progress";
import { saveAttempt, saveOwnerLegacyImportedSummary } from "@/lib/quiz-progress";
import { asString } from "./attemptModel";
export function mergeServerScore(row: Record<string, unknown>, ownerId: string) {
  if (row.attemptKind === "legacy-summary") {
    const legacy = row.legacyData && typeof row.legacyData === "object" ? row.legacyData as Record<string, unknown> : null;
    const last = legacy?.last && typeof legacy.last === "object" ? legacy.last as Record<string, unknown> : null;
    if (typeof row.subjectId === "string" && typeof row.chapterId === "string" && legacy && last) {
      saveOwnerLegacyImportedSummary({
        ownerId,
        subjectId: row.subjectId,
        categoryId: typeof row.categoryId === "string" ? row.categoryId : null,
        chapterId: row.chapterId,
        best: Number(legacy.best ?? 0),
        attempts: Number(legacy.attempts ?? 0),
        lastPercent: typeof last.percent === "number" ? last.percent : null,
        completedAt: asString(last.completedAt) || asString(row.updatedAt, new Date(0).toISOString()),
        stage: last.stage === "submitted" ? "submitted" : "final",
      });
    }
    return;
  }
  if (row.phase !== "summary" && row.stage !== "submitted") return;
  const score = row.score && typeof row.score === "object" ? row.score as Record<string, unknown> : {};
  const objectiveCount = Number(score.objectiveCount ?? 0);
  const correctCount = Number(score.correctCount ?? 0);
  const attempt: QuizAttempt = {
    title: asString(row.title),
    attemptId: asString(row.attemptId),
    quizId: asString(row.quizId),
    sourceKind: row.sourceKind as QuizAttempt["sourceKind"],
    categoryId: typeof row.categoryId === "string" ? row.categoryId : undefined,
    earned: Number(score.earned ?? 0),
    max: Number(score.max ?? 0),
    percent: typeof score.percent === "number" ? score.percent : null,
    completedAt: asString(row.completedAt) || asString(row.updatedAt, new Date().toISOString()),
    stage: row.stage === "submitted" ? "submitted" : "final",
    objectiveCount,
    correctCount,
    scoredCount: Number(score.scoredCount ?? 0),
    objectiveAccuracy: objectiveCount > 0 ? Math.round((correctCount / objectiveCount) * 1000) / 10 : null,
  };
  const subjectId = asString(row.subjectId);
  const chapterId = asString(row.chapterId);
  if (subjectId && chapterId) saveAttempt(subjectId, chapterId, attempt);
}
