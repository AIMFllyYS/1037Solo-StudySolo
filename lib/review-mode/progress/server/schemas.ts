import type { NextRequest } from "next/server";
import { z } from "zod";

import type { UserAnswer } from "@/lib/quiz/types";

import { ReviewProgressError } from "./errors";
import { UUID, SOURCE_KINDS, SOURCE_QUERY_KINDS, ANSWER_BYTES_LIMIT, byteLength } from "./limits";
export const answerSchema: z.ZodType<UserAnswer> = z.union([
  z.number().finite(),
  z.array(z.number().int().safe()).max(500),
  z.string().max(20_000),
  z.record(z.string(), z.unknown()).refine((value) => byteLength(value) <= ANSWER_BYTES_LIMIT),
  z.null(),
]);
export const answersSchema = z.record(z.string().min(1).max(300), answerSchema)
  .refine((value) => byteLength(value) <= ANSWER_BYTES_LIMIT, "answers too large");
export const selfScoresSchema = z.record(z.string().min(1).max(300), z.number().finite().min(0).max(100_000));
export const quizQuestionSchema = z.object({
  id: z.string().min(1).max(300),
  type: z.enum(["single_choice", "multiple_choice", "true_false", "analysis", "fill_blank", "essay", "reading", "cloze", "translation"]),
  difficulty: z.enum(["basic", "medium", "hard"]).default("medium"),
  source: z.enum(["current_chapter", "review"]).default("current_chapter"),
  sourceChapter: z.string().max(160).optional(),
  label: z.string().max(200).optional(),
  points: z.number().finite().min(0).max(100_000),
  stem: z.string().min(1).max(20_000),
  options: z.array(z.string().max(5_000)).max(100).optional(),
  answer: z.union([z.number().finite(), z.array(z.number().int().safe()).max(500), z.string().max(20_000)]),
  passage: z.string().max(30_000).optional(),
  subQuestions: z.array(z.object({ id: z.string().min(1).max(300), type: z.enum(["single_choice", "multiple_choice", "true_false"]), stem: z.string().min(1).max(10_000), options: z.array(z.string().max(2_000)).max(100).optional(), answer: z.union([z.number().finite(), z.array(z.number().int().safe()).max(500)]), explanation: z.string().max(8_000).optional(), points: z.number().finite().min(0).max(100_000) }).strip()).max(100).optional(),
  blanks: z.array(z.object({ id: z.string().min(1).max(300), options: z.array(z.string().max(2_000)).max(100), answer: z.number().int().safe(), explanation: z.string().max(8_000).optional(), points: z.number().finite().min(0).max(100_000).optional() }).strip()).max(100).optional(),
  items: z.array(z.object({ id: z.string().min(1).max(300), source: z.string().max(8_000), reference: z.string().max(8_000), explanation: z.string().max(8_000).optional(), points: z.number().finite().min(0).max(100_000) }).strip()).max(100).optional(),
  hint: z.string().max(8_000).optional(),
  explanation: z.string().max(20_000).optional(),
  sourceRef: z.object({ path: z.string().max(500).optional(), label: z.string().max(500).optional(), source: z.enum(["recording", "minutes", "notes", "cards", "textbook", "detail"]).optional(), blockId: z.string().max(300).optional() }).strip().optional(),
  reasoning: z.string().max(10_000).optional(),
  scoring_criteria: z.array(z.string().max(4_000)).max(100).optional(),
  total_points: z.number().finite().min(0).max(100_000).optional(),
  manimVideoId: z.string().max(300).optional(),
}).strip();
export const quizDataSchema = z.object({
  subjectId: z.string().min(1).max(100),
  chapterId: z.string().min(1).max(160),
  generatedAt: z.string().min(1).max(100),
  examConfig: z.object({ source: z.string().max(500), totalPoints: z.number().finite().min(0).max(1_000_000), timeLimit: z.number().finite().min(0).max(100_000).optional() }).strip(),
  questions: z.array(quizQuestionSchema).min(1).max(100),
  summary: z.object({ totalQuestions: z.number().int().nonnegative(), byType: z.record(z.string(), z.number().int().nonnegative()), bySource: z.record(z.string(), z.number().int().nonnegative()), byDifficulty: z.record(z.string(), z.number().int().nonnegative()) }).strip().optional(),
  contentRef: z.object({ lessonId: z.string().min(1).max(300), revision: z.number().int().nonnegative(), recordingHash: z.string().max(256).optional(), notesTextHash: z.string().max(256).optional() }).strip().optional(),
}).strip();

export const legacyEntrySchema = z.object({
  subjectId: z.string().min(1).max(100),
  categoryId: z.string().min(1).max(100).nullable(),
  chapterId: z.string().min(1).max(160),
  title: z.string().min(1).max(300),
  progress: z.object({
    best: z.number().finite().min(0).max(100),
    attempts: z.number().int().min(0).max(1_000_000),
    last: z.object({
      earned: z.number().finite().min(0).max(1_000_000),
      max: z.number().finite().min(0).max(1_000_000),
      percent: z.number().finite().min(0).max(100).nullable(),
      completedAt: z.string().max(100),
      stage: z.enum(["submitted", "final"]),
      perQuestion: z.array(z.object({ id: z.string().min(1).max(300), awarded: z.number().finite().min(0).max(100_000), max: z.number().finite().min(0).max(100_000), correct: z.boolean().nullable() }).strip()).max(500).optional(),
    }).strip(),
  }).strip(),
}).strip();

export function readQuery(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const allowed = new Set(["view", "sourceKind", "subjectId", "categoryId", "chapterId", "attemptId", "cursor", "limit"]);
  for (const key of params.keys()) if (!allowed.has(key)) throw new ReviewProgressError(400, "UNKNOWN_QUERY_FIELD");
  for (const key of allowed) if (params.getAll(key).length > 1) throw new ReviewProgressError(400, "DUPLICATE_QUERY_FIELD");
  const get = (key: string) => params.get(key) ?? undefined;
  const view = get("view") ?? "summary";
  if (view !== "summary" && view !== "resume" && view !== "attempts") throw new ReviewProgressError(400, "INVALID_VIEW");
  const sourceKind = get("sourceKind");
  if (sourceKind && !(SOURCE_QUERY_KINDS as readonly string[]).includes(sourceKind)) throw new ReviewProgressError(400, "INVALID_SOURCE_KIND");
  const subjectId = get("subjectId");
  const chapterId = get("chapterId");
  const categoryId = get("categoryId");
  if (!!subjectId !== !!chapterId) throw new ReviewProgressError(400, "INVALID_CHAPTER_SCOPE");
  if (categoryId && !subjectId) throw new ReviewProgressError(400, "INVALID_CHAPTER_SCOPE");
  if (subjectId && (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(subjectId)
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(chapterId!)
    || (categoryId && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(categoryId)))) {
    throw new ReviewProgressError(400, "INVALID_CHAPTER_SCOPE");
  }
  const attemptId = get("attemptId");
  if (attemptId && !UUID.safeParse(attemptId).success) throw new ReviewProgressError(400, "INVALID_ATTEMPT_ID");
  const cursor = get("cursor");
  if (cursor && !UUID.safeParse(cursor).success) throw new ReviewProgressError(400, "INVALID_CURSOR");
  const rawLimit = get("limit");
  const limit = rawLimit ? Number(rawLimit) : 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ReviewProgressError(400, "INVALID_LIMIT");
  if (attemptId && (cursor || subjectId || sourceKind || categoryId || chapterId)) throw new ReviewProgressError(400, "INVALID_ATTEMPT_QUERY");
  if (view === "resume" && cursor) throw new ReviewProgressError(400, "INVALID_RESUME_QUERY");
  return { view, sourceKind, subjectId, categoryId, chapterId, attemptId, cursor, limit };
}

export const operationIdSchema = z.string().uuid();
export const attemptBaseSchema = z.object({
  attemptId: UUID,
  expectedRevision: z.number().int().min(0).max(1_000_000),
  operationId: operationIdSchema,
  sourceKind: z.enum(SOURCE_KINDS),
  subjectId: z.string().min(1).max(100),
  categoryId: z.string().min(1).max(100).nullable(),
  chapterId: z.string().min(1).max(160),
  quizId: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  phase: z.enum(["answering", "scoring", "summary"]),
  stage: z.enum(["submitted", "final"]).nullable(),
  answers: answersSchema,
  currentIndex: z.number().int().min(0).max(500),
  revealedQuestionIds: z.array(z.string().min(1).max(300)).max(500),
  hintsUsed: z.array(z.string().min(1).max(300)).max(500),
  selfScores: selfScoresSchema,
  completedAt: z.string().datetime().nullable(),
});
export const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("seed-attempt"), attempt: attemptBaseSchema.extend({ quizSetId: z.null(), quizData: quizDataSchema }) }).strict(),
  z.object({ action: z.literal("save-attempt"), attempt: attemptBaseSchema.extend({ quizSetId: UUID }) }).strict(),
  z.object({ action: z.literal("import-legacy"), importId: UUID, entry: legacyEntrySchema }).strict(),
]);
