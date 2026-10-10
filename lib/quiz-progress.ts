// Stable progress-book API; ownership/keys, IO, explicit legacy import, events and record/metric logic are separate responsibilities.
export type { QuestionScore, QuizAttempt, ChapterProgress, QuizSession, ProgressEntry, GlobalSummary } from "./quizProgress/contracts";
export { getLegacyLocalProgress, hasLegacyLocalProgress, getLegacyImportState, beginLegacyImport, completeLegacyImport, importLegacyProgressLocally, getOwnerLegacyImportedProgress, saveOwnerLegacyImportedSummary } from "./quizProgress/legacy";
export { getQuizProgressVersion, subscribeQuizProgress } from "./quizProgress/events";
export { objectiveBestOf, objectiveAttemptsOf, objectiveAccuracyOf, chapterLabel, compareChapter, scoreGrade } from "./quizProgress/metrics";
export { getChapterProgress, saveAttempt, saveSession, getSession, clearSession, getAllProgress, getGlobalSummary, clearAllProgress, clearChapterProgress } from "./quizProgress/records";
