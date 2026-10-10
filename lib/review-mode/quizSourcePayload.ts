
import { type WrongEntry } from "@/lib/review-mode/wrongBook";

import type { WeakPoint } from './wrongQuestions';
interface AccountWrongSources { attemptIds: string[]; hasMoreAttemptRecords: boolean }
export function buildWrongQuizSource(activeWrongEntries: WrongEntry[], accountWrongAttempts: AccountWrongSources, weakPoints: WeakPoint[]) {

    const attempts = [...new Set([...activeWrongEntries.flatMap((entry) => entry.attemptIds ?? []), ...accountWrongAttempts.attemptIds])];
    const attemptIds = attempts.slice(0, 1000);
    const localCandidates = activeWrongEntries.filter((entry) => entry.question).map((entry) => ({
      key: entry.questionKey ?? entry.id,
      title: entry.source.label,
      quizId: entry.source.quizId ?? entry.source.chapterId,
      misses: Math.max(1, entry.misses),
      latestAttemptAt: entry.createdAt,
      question: entry.question!,
    }));
    const localQuestions: typeof localCandidates = [];
    let localBytes = 0;
    for (const entry of localCandidates) {
      const bytes = new TextEncoder().encode(JSON.stringify(entry)).byteLength;
      if (localQuestions.length >= 20) break;
      if (localBytes + bytes > 110_000) continue;
      localBytes += bytes;
      localQuestions.push(entry);
    }
    const scopedWeakPoints = weakPoints.filter((point) => point.categoryId).map((point) => ({
      subjectId: point.subjectId,
      categoryId: point.categoryId!,
      chapterId: point.chapterId,
      accuracy: point.lastPercent,
      wrongCount: point.wrongCount,
      answeredCount: point.answeredCount,
    }));
  return { source: {
      kind: "wrong",
      attemptIds,
      hasMoreAttemptRecords: attempts.length > attemptIds.length || accountWrongAttempts.hasMoreAttemptRecords,
      localQuestions,
      omittedLocalQuestionCount: Math.max(0, localCandidates.length - localQuestions.length),
      weakPoints: scopedWeakPoints.slice(0, 20),
      omittedWeakPointCount: Math.max(0, scopedWeakPoints.length - 20),
    }, reinforcing: activeWrongEntries.map((entry) => entry.id) };
}
