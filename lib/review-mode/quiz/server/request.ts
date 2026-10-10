import { z } from "zod";

import { ReviewQuizError } from "./errors";
export const uuid = z.string().uuid();
const MAX_REQUEST_BYTES = 180_000;
const MAX_ATTEMPT_IDS = 1_000;
const safeId = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const questionSchema = z.record(z.string(), z.unknown()).refine((value) =>
  typeof value.id === "string" && value.id.length <= 300
  && typeof value.stem === "string" && value.stem.length > 0 && value.stem.length <= 20_000
  && typeof value.type === "string" && value.type.length <= 40
  && (() => { try { return Buffer.byteLength(JSON.stringify(value), "utf8") <= 48_000; } catch { return false; } })(),
);
export const localQuestionSchema = z.object({
  key: z.string().min(1).max(800),
  title: z.string().min(1).max(300),
  quizId: z.string().min(1).max(200),
  misses: z.number().int().min(1).max(1_000_000),
  latestAttemptAt: z.string().max(100),
  lastWrongAnswer: z.unknown().optional(),
  question: questionSchema,
}).strict();
export const weakPointSchema = z.object({
  subjectId: safeId(100),
  categoryId: safeId(100),
  chapterId: safeId(160),
  accuracy: z.number().min(0).max(100),
  wrongCount: z.number().int().min(0).max(500),
  answeredCount: z.number().int().min(0).max(500),
}).strict();
export const requestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("chapter"),
    subjectId: safeId(100), categoryId: safeId(100), chapterId: safeId(160),
  }).strict(),
  z.object({
    kind: z.literal("classroom"),
    sessionId: uuid,
  }).strict(),
  z.object({
    kind: z.literal("wrong"),
    attemptIds: z.array(uuid).max(MAX_ATTEMPT_IDS),
    localQuestions: z.array(localQuestionSchema).max(20),
    weakPoints: z.array(weakPointSchema).max(20),
    hasMoreAttemptRecords: z.boolean().default(false),
    omittedLocalQuestionCount: z.number().int().min(0).max(1_000_000).default(0),
    omittedWeakPointCount: z.number().int().min(0).max(1_000_000).default(0),
  }).strict(),
]);
export const bodySchema = z.object({ source: requestSchema }).strict();

export async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ReviewQuizError(415, "JSON_REQUIRED");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ReviewQuizError(400, "BODY_REQUIRED");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new ReviewQuizError(413, "REVIEW_CONTEXT_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
  catch { throw new ReviewQuizError(400, "INVALID_JSON"); }
}