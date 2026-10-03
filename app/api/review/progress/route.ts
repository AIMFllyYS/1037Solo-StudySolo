import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { readQuiz } from "@/lib/content/loader";
import { accountBackendUrl, authModeForRequest, CANONICAL_SITE_ORIGIN } from "@/lib/auth/authMode";
import { consumeRateLimit } from "@/lib/auth/rateLimit";
import { extractAccessToken } from "@/lib/auth/sessionCookie";
import { createServiceAuthClient } from "@/lib/auth/serviceClient";
import { failureStatus, verifyAccount } from "@/lib/auth/sign-in/account-verify";
import { autoGrade, isObjectivelyGradableQuestion, maxPointsOf } from "@/lib/quiz/types";
import type { QuizData, QuizQuestion, UserAnswer } from "@/lib/quiz/types";
import { canonicalJson, questionLocationKey } from "@/lib/review-mode/quizSnapshot";
import { desktopCloudBridgeEnabled, forwardDesktopAgentRequest } from "@/lib/sandbox/desktop-bridge.server";
import { sandboxFailure } from "@/lib/sandbox/config.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
const UUID = z.string().uuid();
const SOURCE_KINDS = ["static", "review-wrong", "review-chapter", "classroom"] as const;
const SOURCE_QUERY_KINDS = [...SOURCE_KINDS, "legacy-import"] as const;
const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_QUIZ_SNAPSHOT_BYTES = 360_000;
const RESPONSE_BYTES_SOFT_LIMIT = 420_000;
const ANSWER_BYTES_LIMIT = 120_000;

class ReviewProgressError extends Error {
  constructor(readonly status: number, readonly code: string, readonly retryAfter?: number) {
    super(code);
  }
}

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...PRIVATE_HEADERS, ...headers } });
}

function fail(error: unknown) {
  if (error instanceof ReviewProgressError) {
    return reply({ code: error.code }, error.status, error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {});
  }
  return reply({ code: "REVIEW_PROGRESS_UNAVAILABLE" }, 503);
}

function normalizeLocalHost(host: string): string {
  return host.trim().toLowerCase().replace(/^(127\.0\.0\.1|\[::1\]|::1)(?=:|$)/, "localhost");
}

function isLocalReviewHost(host: string): boolean {
  try {
    const url = new URL(`http://${host}`);
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase()) && url.port === "35349";
  } catch {
    return false;
  }
}

/** The reverse proxy owns Host and APP_URL; Next's internal initURL is not an external-origin signal. */
function assertReviewOrigin(request: NextRequest, requireOrigin: boolean) {
  const host = request.headers.get("host")?.trim();
  if (!host) throw new ReviewProgressError(403, "ORIGIN_REJECTED");
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") throw new ReviewProgressError(403, "ORIGIN_REJECTED");
  const localHost = isLocalReviewHost(host);
  let expected: URL | null = null;
  if (localHost) {
    if (process.env.NODE_ENV === "production" || request.nextUrl.protocol !== "http:"
      || normalizeLocalHost(request.nextUrl.host) !== normalizeLocalHost(host)) throw new ReviewProgressError(403, "ORIGIN_REJECTED");
  } else {
    try {
      expected = new URL(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || CANONICAL_SITE_ORIGIN);
    } catch {
      throw new ReviewProgressError(503, "REVIEW_ORIGIN_UNCONFIGURED");
    }
    if (host.toLowerCase() !== expected.host.toLowerCase()) throw new ReviewProgressError(403, "ORIGIN_REJECTED");
  }

  if (!origin) {
    if (requireOrigin) throw new ReviewProgressError(403, "ORIGIN_REJECTED");
    return;
  }
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new ReviewProgressError(403, "ORIGIN_REJECTED");
  }
  if (parsedOrigin.origin !== origin || parsedOrigin.username || parsedOrigin.password) throw new ReviewProgressError(403, "ORIGIN_REJECTED");
  if (localHost) {
    if (normalizeLocalHost(parsedOrigin.host) !== normalizeLocalHost(host) || parsedOrigin.protocol !== "http:") {
      throw new ReviewProgressError(403, "ORIGIN_REJECTED");
    }
  } else if (parsedOrigin.origin !== expected!.origin) {
    throw new ReviewProgressError(403, "ORIGIN_REJECTED");
  }
}

async function ownerFor(request: NextRequest): Promise<string> {
  const verified = await verifyAccount(extractAccessToken(request.headers), {
    accountBackendUrl: accountBackendUrl(authModeForRequest(request)),
    live: true,
  });
  if (verified.kind !== "ok") {
    const code = verified.kind === "unavailable" ? "ACCOUNT_UNAVAILABLE" : verified.code;
    throw new ReviewProgressError(failureStatus(verified), code);
  }
  if (verified.identity.mfa_required) throw new ReviewProgressError(403, "MFA_REQUIRED");
  if (!z.string().uuid().safeParse(verified.identity.user_id).success) throw new ReviewProgressError(503, "ACCOUNT_ID_INVALID");
  const limit = consumeRateLimit(`review-progress:${verified.identity.user_id}`, { max: 120, windowMs: 60_000 });
  if (!limit.ok) throw new ReviewProgressError(429, "RATE_LIMITED", limit.retryAfterSec);
  return verified.identity.user_id;
}

function assertExpectedOwnerBinding(request: Request, ownerId: string) {
  const value = request.headers.get("x-studysolo-owner-binding") ?? "";
  const expected = createHash("sha256").update(`studysolo-review-owner-binding-v1:${ownerId}`).digest();
  let received: Buffer;
  try { received = Buffer.from(value, "hex"); } catch { received = Buffer.alloc(0); }
  if (!/^[a-f0-9]{64}$/i.test(value) || received.byteLength !== expected.byteLength || !timingSafeEqual(received, expected)) {
    throw new ReviewProgressError(409, "REVIEW_OWNER_CHANGED");
  }
}

async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ReviewProgressError(415, "JSON_REQUIRED");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ReviewProgressError(400, "BODY_REQUIRED");
  const parts: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new ReviewProgressError(413, "REVIEW_PROGRESS_BODY_TOO_LARGE");
    }
    parts.push(value);
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) {
    buffer.set(part, offset);
    offset += part.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
  } catch {
    throw new ReviewProgressError(400, "INVALID_JSON");
  }
}

const answerSchema: z.ZodType<UserAnswer> = z.union([
  z.number().finite(),
  z.array(z.number().int().safe()).max(500),
  z.string().max(20_000),
  z.record(z.string(), z.unknown()).refine((value) => byteLength(value) <= ANSWER_BYTES_LIMIT),
  z.null(),
]);
const answersSchema = z.record(z.string().min(1).max(300), answerSchema)
  .refine((value) => byteLength(value) <= ANSWER_BYTES_LIMIT, "answers too large");
const selfScoresSchema = z.record(z.string().min(1).max(300), z.number().finite().min(0).max(100_000));
const quizQuestionSchema = z.object({
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
const quizDataSchema = z.object({
  subjectId: z.string().min(1).max(100),
  chapterId: z.string().min(1).max(160),
  generatedAt: z.string().min(1).max(100),
  examConfig: z.object({ source: z.string().max(500), totalPoints: z.number().finite().min(0).max(1_000_000), timeLimit: z.number().finite().min(0).max(100_000).optional() }).strip(),
  questions: z.array(quizQuestionSchema).min(1).max(100),
  summary: z.object({ totalQuestions: z.number().int().nonnegative(), byType: z.record(z.string(), z.number().int().nonnegative()), bySource: z.record(z.string(), z.number().int().nonnegative()), byDifficulty: z.record(z.string(), z.number().int().nonnegative()) }).strip().optional(),
  contentRef: z.object({ lessonId: z.string().min(1).max(300), revision: z.number().int().nonnegative(), recordingHash: z.string().max(256).optional(), notesTextHash: z.string().max(256).optional() }).strip().optional(),
}).strip();

const legacyEntrySchema = z.object({
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

function byteLength(value: unknown): number {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; } catch { return Number.POSITIVE_INFINITY; }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function derivedUuid(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function createQuizKey(sourceKind: typeof SOURCE_KINDS[number], subjectId: string, categoryId: string | null, chapterId: string, quizId: string, contentHash: string): string {
  // The canonical hash includes every source locator and the full snapshot.
  void subjectId; void categoryId; void chapterId; void quizId;
  return `ss-review-v1|${sourceKind}|${contentHash}`;
}

function mapStorageError(error: { code?: string; message?: string } | null | undefined): never {
  const message = error?.message ?? "";
  if (error?.code === "PGRST202" || error?.code === "PGRST205" || error?.code === "42P01"
    || /could not find the function|could not find the table|does not exist/i.test(message)) {
    throw new ReviewProgressError(503, "REVIEW_PROGRESS_MIGRATION_PENDING");
  }
  if (/storage_quota_exceeded/i.test(message)) throw new ReviewProgressError(413, "REVIEW_STORAGE_QUOTA");
  if (/review_quiz_idempotency_key_reused/i.test(message)) throw new ReviewProgressError(409, "REVIEW_IDEMPOTENCY_KEY_REUSED");
  if (/review_quiz_snapshot_conflict|review_quiz_set_unavailable|review_quiz_attempt_identity_immutable/i.test(message)) {
    throw new ReviewProgressError(409, "REVIEW_QUIZ_SNAPSHOT_CONFLICT");
  }
  throw new ReviewProgressError(503, "REVIEW_PROGRESS_STORAGE_UNAVAILABLE");
}

function safeRow(row: Record<string, unknown>, quizData?: QuizData | null, includeFullLegacy = false, includeAttemptState = false) {
  const legacy = row.legacy_data && typeof row.legacy_data === "object" ? row.legacy_data as Record<string, unknown> : null;
  const legacyLast = legacy?.last && typeof legacy.last === "object" ? legacy.last as Record<string, unknown> : null;
  return {
    attemptId: row.attempt_id,
    attemptKind: row.attempt_kind,
    quizSetId: row.quiz_set_id,
    sourceKind: row.source_kind,
    subjectId: row.subject_id,
    categoryId: row.category_id,
    chapterId: row.chapter_id,
    quizId: row.quiz_id,
    title: row.title,
    phase: row.phase,
    stage: row.stage,
    ...(includeAttemptState ? {
      answers: row.answers,
      currentIndex: row.current_index,
      revealedQuestionIds: row.revealed_question_ids,
      hintsUsed: row.hints_used,
      selfScores: row.self_scores,
    } : {}),
    questionResults: row.question_results,
    score: {
      earned: row.earned,
      max: row.max_score,
      percent: row.percent,
      objectiveCount: row.objective_count,
      correctCount: row.correct_count,
    },
    ...(legacy ? {
      legacyData: includeFullLegacy ? legacy : {
        version: legacy.version,
        best: legacy.best,
        attempts: legacy.attempts,
        last: legacyLast ? {
          percent: legacyLast.percent,
          completedAt: legacyLast.completedAt,
          stage: legacyLast.stage,
        } : null,
      },
    } : {}),
    revision: row.revision,
    operationId: row.operation_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(quizData ? { quizData } : {}),
  };
}

async function readOwnedQuizSet(db: ReturnType<typeof createServiceAuthClient>, ownerId: string, setId: string) {
  const { data, error } = await db.from("ss_review_quiz_sets")
    .select("id,quiz_key,source_kind,subject_id,category_id,chapter_id,quiz_id,title,content_hash,quiz_data")
    .eq("user_id", ownerId).eq("id", setId).maybeSingle();
  if (error) mapStorageError(error);
  if (!data) throw new ReviewProgressError(404, "REVIEW_ATTEMPT_NOT_FOUND");
  return data as Record<string, unknown>;
}

async function withQuizSnapshot(db: ReturnType<typeof createServiceAuthClient>, ownerId: string, row: Record<string, unknown>) {
  if (row.attempt_kind === "legacy-summary" || typeof row.quiz_set_id !== "string") return safeRow(row, null, true);
  const set = await readOwnedQuizSet(db, ownerId, row.quiz_set_id);
  const parsed = quizDataSchema.safeParse(set.quiz_data);
  if (!parsed.success) throw new ReviewProgressError(503, "REVIEW_SNAPSHOT_INVALID");
  return {
    ...safeRow(row, parsed.data, false, true),
    quizKey: set.quiz_key,
    contentHash: set.content_hash,
  };
}

async function findAttempt(db: ReturnType<typeof createServiceAuthClient>, ownerId: string, attemptId: string) {
  const { data, error } = await db.from("ss_review_quiz_attempts")
    .select("id,attempt_id,attempt_kind,quiz_set_id,source_kind,subject_id,category_id,chapter_id,quiz_id,title,phase,stage,answers,current_index,revealed_question_ids,hints_used,self_scores,question_results,earned,max_score,percent,objective_count,correct_count,legacy_data,revision,operation_id,completed_at,created_at,updated_at")
    .eq("user_id", ownerId).eq("attempt_id", attemptId).maybeSingle();
  if (error) mapStorageError(error);
  return data as Record<string, unknown> | null;
}

function readQuery(request: NextRequest) {
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

export async function GET(request: NextRequest) {
  if (desktopCloudBridgeEnabled()) {
    try { return await forwardDesktopAgentRequest(request); } catch (error) { return sandboxFailure(error); }
  }
  try {
    assertReviewOrigin(request, false);
    const ownerId = await ownerFor(request);
    const query = readQuery(request);
    const db = createServiceAuthClient();
    if (query.attemptId) {
      const row = await findAttempt(db, ownerId, query.attemptId);
      if (!row) throw new ReviewProgressError(404, "REVIEW_ATTEMPT_NOT_FOUND");
      return reply(await withQuizSnapshot(db, ownerId, row));
    }

    if (query.view === "resume") {
      let builder = db.from("ss_review_quiz_attempts")
        .select("id,attempt_id,attempt_kind,quiz_set_id,source_kind,subject_id,category_id,chapter_id,quiz_id,title,phase,stage,answers,current_index,revealed_question_ids,hints_used,self_scores,question_results,earned,max_score,percent,objective_count,correct_count,legacy_data,revision,operation_id,completed_at,created_at,updated_at")
        .eq("user_id", ownerId).eq("attempt_kind", "quiz").neq("phase", "summary")
        .order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(1);
      if (query.sourceKind) builder = builder.eq("source_kind", query.sourceKind);
      if (query.subjectId) {
        builder = builder.eq("subject_id", query.subjectId).eq("chapter_id", query.chapterId);
        if (query.categoryId) builder = builder.eq("category_id", query.categoryId);
      }
      const { data, error } = await builder;
      if (error) mapStorageError(error);
      const row = data?.[0] as Record<string, unknown> | undefined;
      return reply(row ? await withQuizSnapshot(db, ownerId, row) : { attempt: null });
    }

    let cursorCreatedAt: string | null = null;
    if (query.cursor) {
      const cursorRow = await db.from("ss_review_quiz_attempts").select("id,created_at")
        .eq("user_id", ownerId).eq("id", query.cursor).maybeSingle();
      if (cursorRow.error) mapStorageError(cursorRow.error);
      if (typeof cursorRow.data?.created_at !== "string") throw new ReviewProgressError(400, "INVALID_CURSOR");
      cursorCreatedAt = cursorRow.data.created_at;
    }
    let builder = db.from("ss_review_quiz_attempts")
      .select("id,attempt_id,attempt_kind,quiz_set_id,source_kind,subject_id,category_id,chapter_id,quiz_id,title,phase,stage,question_results,legacy_data,earned,max_score,percent,objective_count,correct_count,revision,operation_id,completed_at,created_at,updated_at")
      .eq("user_id", ownerId);
    if (cursorCreatedAt && query.cursor) {
      const escapedTimestamp = cursorCreatedAt.replaceAll(",", "");
      builder = builder.or(`created_at.lt.${escapedTimestamp},and(created_at.eq.${escapedTimestamp},id.lt.${query.cursor})`);
    }
    builder = builder.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(query.limit + 1);
    if (query.sourceKind) builder = builder.eq("source_kind", query.sourceKind);
    if (query.subjectId) {
      builder = builder.eq("subject_id", query.subjectId).eq("chapter_id", query.chapterId);
      if (query.categoryId) builder = builder.eq("category_id", query.categoryId);
    }
    const { data, error } = await builder;
    if (error) mapStorageError(error);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const page: Array<Record<string, unknown>> = [];
    for (const row of rows.slice(0, query.limit)) {
      const candidate = { ...safeRow(row, null), cursor: row.id };
      if (page.length && byteLength({ rows: [...page, candidate], nextCursor: null }) > RESPONSE_BYTES_SOFT_LIMIT) break;
      page.push(candidate);
    }
    const hasMore = rows.length > page.length;
    const nextCursor = hasMore ? String(page.at(-1)?.cursor ?? "") || null : null;
    return reply({ rows: page, nextCursor });
  } catch (error) {
    return fail(error);
  }
}

const operationIdSchema = z.string().uuid();
const attemptBaseSchema = z.object({
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
const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("seed-attempt"), attempt: attemptBaseSchema.extend({ quizSetId: z.null(), quizData: quizDataSchema }) }).strict(),
  z.object({ action: z.literal("save-attempt"), attempt: attemptBaseSchema.extend({ quizSetId: UUID }) }).strict(),
  z.object({ action: z.literal("import-legacy"), importId: UUID, entry: legacyEntrySchema }).strict(),
]);

function prepareQuizSet(input: z.infer<typeof quizDataSchema>, source: { sourceKind: typeof SOURCE_KINDS[number]; subjectId: string; categoryId: string | null; chapterId: string; quizId: string; title: string }) {
  if (input.subjectId !== source.subjectId || input.chapterId !== source.chapterId) throw new ReviewProgressError(400, "QUIZ_SNAPSHOT_SCOPE_MISMATCH");
  const bytes = byteLength(input);
  if (bytes > MAX_QUIZ_SNAPSHOT_BYTES) throw new ReviewProgressError(413, "QUIZ_SNAPSHOT_TOO_LARGE");
  let quizData = input;
  if (source.sourceKind === "static") {
    const bank = readQuiz(source.subjectId, source.chapterId);
    const bankResult = quizDataSchema.safeParse(bank);
    if (!bankResult.success || canonicalJson(bankResult.data) !== canonicalJson(input)) {
      throw new ReviewProgressError(409, "STATIC_QUIZ_CHANGED");
    }
    quizData = bankResult.data;
  }
  const identity = {
    sourceKind: source.sourceKind,
    subjectId: source.subjectId,
    categoryId: source.categoryId,
    chapterId: source.chapterId,
    quizId: source.quizId,
    title: source.title,
    quizData,
  };
  const contentHash = hash(canonicalJson(identity));
  const quizKey = createQuizKey(source.sourceKind, source.subjectId, source.categoryId, source.chapterId, source.quizId, contentHash);
  if (quizKey.length > 320) throw new ReviewProgressError(400, "QUIZ_KEY_TOO_LARGE");
  return { quizData, quizKey, contentHash };
}

function calculateResults(attempt: z.infer<typeof attemptBaseSchema>, quizData: QuizData, contentHash: string) {
  if (attempt.phase === "answering") {
    return { questionResults: [], score: { earned: 0, max: 0, percent: null, objectiveCount: 0, correctCount: 0, scoredCount: 0 } };
  }
  const isReview = attempt.sourceKind !== "static";
  const revealed = new Set(attempt.revealedQuestionIds);
  const questionResults = quizData.questions.map((question) => {
    const objective = isObjectivelyGradableQuestion(question);
    const shouldScore = objective
      ? !isReview || revealed.has(question.id) || Object.hasOwn(attempt.answers, question.id)
      : Object.hasOwn(attempt.selfScores, question.id);
    const max = maxPointsOf(question);
    if (objective && shouldScore) {
      const [awarded, correct] = autoGrade(question as QuizQuestion, attempt.answers[question.id] ?? null);
      return { id: question.id, questionKey: questionLocationKey(contentHash, question.id), awarded, max, correct, objective, scored: true };
    }
    if (objective) return { id: question.id, questionKey: questionLocationKey(contentHash, question.id), awarded: 0, max, correct: null, objective, scored: false };
    const awarded = shouldScore ? Math.min(max, attempt.selfScores[question.id] ?? 0) : 0;
    return { id: question.id, questionKey: questionLocationKey(contentHash, question.id), awarded, max, correct: null, objective, scored: shouldScore };
  });
  const scored = questionResults.filter((row) => row.scored);
  const objectiveRows = questionResults.filter((row) => row.objective && row.correct !== null);
  const earned = scored.reduce((sum, row) => sum + row.awarded, 0);
  const max = scored.reduce((sum, row) => sum + row.max, 0);
  const correctCount = objectiveRows.filter((row) => row.correct === true).length;
  return {
    questionResults,
    score: {
      earned: Math.round(earned * 1000) / 1000,
      max: Math.round(max * 1000) / 1000,
      percent: max > 0 ? Math.round((earned / max) * 1000) / 10 : null,
      objectiveCount: objectiveRows.length,
      correctCount,
      scoredCount: scored.length,
    },
  };
}

function normalizeRpcResult(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") throw new ReviewProgressError(503, "REVIEW_PROGRESS_STORAGE_UNAVAILABLE");
  const record = row as Record<string, unknown>;
  if (record.status === "conflict") {
    throw new ReviewProgressError(409, "REVIEW_ATTEMPT_STALE");
  }
  if (record.status !== "saved" || typeof record.attemptId !== "string" || !Number.isSafeInteger(record.revision)) {
    throw new ReviewProgressError(503, "REVIEW_PROGRESS_STORAGE_UNAVAILABLE");
  }
  return {
    attemptId: record.attemptId,
    revision: record.revision,
    operationId: record.operationId,
    quizSetId: record.quizSetId,
    updatedAt: record.updatedAt,
  };
}

async function persistAttempt(db: ReturnType<typeof createServiceAuthClient>, ownerId: string, request: Record<string, unknown>) {
  const { data, error } = await db.rpc("ss_review_quiz_save_attempt", { p_user_id: ownerId, p_request: request });
  if (error) mapStorageError(error);
  return normalizeRpcResult(data);
}

export async function POST(request: NextRequest) {
  if (desktopCloudBridgeEnabled()) {
    try { return await forwardDesktopAgentRequest(request); } catch (error) { return sandboxFailure(error); }
  }
  try {
    assertReviewOrigin(request, true);
    const ownerId = await ownerFor(request);
    assertExpectedOwnerBinding(request, ownerId);
    const raw = await readBody(request);
    const parsed = postSchema.safeParse(raw);
    if (!parsed.success) throw new ReviewProgressError(400, "INVALID_REVIEW_PROGRESS");
    const body = parsed.data;
    const db = createServiceAuthClient();

    if (body.action === "import-legacy") {
      const entry = body.entry;
      let priorQuery = db.from("ss_review_quiz_attempts")
        .select("attempt_id,revision,operation_id")
        .eq("user_id", ownerId).eq("attempt_kind", "legacy-summary")
        .eq("subject_id", entry.subjectId).eq("chapter_id", entry.chapterId);
      priorQuery = entry.categoryId === null ? priorQuery.is("category_id", null) : priorQuery.eq("category_id", entry.categoryId);
      const prior = await priorQuery.maybeSingle();
      if (prior.error) mapStorageError(prior.error);
      const attemptId = derivedUuid(`${ownerId}|legacy-summary|${entry.subjectId}|${entry.categoryId ?? ""}|${entry.chapterId}`);
      const operationId = derivedUuid(`${ownerId}|legacy-import|${body.importId}|${entry.subjectId}|${entry.categoryId ?? ""}|${entry.chapterId}`);
      const objectiveRows = entry.progress.last.perQuestion?.filter((item) => item.correct !== null) ?? [];
      const correctCount = objectiveRows.filter((item) => item.correct === true).length;
      const legacyData = { version: 1, best: entry.progress.best, attempts: entry.progress.attempts, last: entry.progress.last };
      const requestData: Record<string, unknown> = {
        attemptId,
        // Keep a deterministic importId replay byte-for-byte identical so the RPC's
        // operation-hash check can distinguish a retry from a new import payload.
        expectedRevision: prior.data?.operation_id === operationId ? 0 : prior.data?.revision ?? 0,
        operationId,
        attemptKind: "legacy-summary",
        sourceKind: "legacy-import",
        subjectId: entry.subjectId,
        categoryId: entry.categoryId,
        chapterId: entry.chapterId,
        quizId: "legacy-import-v1",
        title: entry.title,
        phase: "summary",
        stage: "final",
        currentIndex: 0,
        score: {
          earned: entry.progress.last.earned,
          max: entry.progress.last.max,
          percent: entry.progress.last.max > 0 ? entry.progress.last.percent : null,
          objectiveCount: objectiveRows.length,
          correctCount,
          scoredCount: entry.progress.last.perQuestion?.filter((item) => item.correct !== null || item.awarded > 0).length ?? 0,
        },
        questionResults: (entry.progress.last.perQuestion ?? []).map((item) => ({ ...item })),
        legacyData,
        completedAt: entry.progress.last.completedAt || null,
      };
      const saved = await persistAttempt(db, ownerId, requestData);
      return reply(saved);
    }

    const attempt = body.attempt;
    if (body.action === "seed-attempt" && (attempt.expectedRevision !== 0 || attempt.phase !== "answering" || attempt.stage !== null
      || Object.keys(attempt.answers).length > 0 || attempt.revealedQuestionIds.length > 0 || attempt.hintsUsed.length > 0)) {
      throw new ReviewProgressError(400, "INVALID_REVIEW_ATTEMPT_SEED");
    }
    let quizData: QuizData | null = null;
    let quizKey = "";
    let contentHash = "";
    let quizSetId: string | null = null;

    if (body.action === "seed-attempt") {
      const prepared = prepareQuizSet(body.attempt.quizData, attempt);
      quizData = prepared.quizData;
      quizKey = prepared.quizKey;
      contentHash = prepared.contentHash;
    } else {
      const set = await readOwnedQuizSet(db, ownerId, body.attempt.quizSetId);
      if (set.source_kind !== attempt.sourceKind || set.subject_id !== attempt.subjectId
        || set.category_id !== attempt.categoryId || set.chapter_id !== attempt.chapterId || set.quiz_id !== attempt.quizId) {
        throw new ReviewProgressError(409, "REVIEW_QUIZ_SNAPSHOT_CONFLICT");
      }
      const validatedSet = quizDataSchema.safeParse(set.quiz_data);
      if (!validatedSet.success) throw new ReviewProgressError(503, "REVIEW_SNAPSHOT_INVALID");
      quizData = validatedSet.data;
      quizKey = String(set.quiz_key);
      contentHash = String(set.content_hash);
      quizSetId = String(set.id);
    }

    if (!quizData) throw new ReviewProgressError(503, "REVIEW_SNAPSHOT_INVALID");
    const { questionResults, score } = calculateResults(attempt, quizData, contentHash);
    const rpcRequest = {
      attemptId: attempt.attemptId,
      expectedRevision: attempt.expectedRevision,
      operationId: attempt.operationId,
      attemptKind: "quiz",
      sourceKind: attempt.sourceKind,
      subjectId: attempt.subjectId,
      categoryId: attempt.categoryId,
      chapterId: attempt.chapterId,
      quizId: attempt.quizId,
      title: attempt.title,
      quizKey,
      contentHash,
      ...(body.action === "seed-attempt" ? { quizData } : { quizSetId }),
      phase: attempt.phase,
      stage: attempt.stage,
      answers: attempt.answers,
      currentIndex: attempt.currentIndex,
      revealedQuestionIds: attempt.revealedQuestionIds,
      hintsUsed: attempt.hintsUsed,
      selfScores: attempt.selfScores,
      questionResults,
      score,
      completedAt: attempt.completedAt,
    };
    if (byteLength(rpcRequest) > MAX_REQUEST_BYTES) throw new ReviewProgressError(413, "REVIEW_PROGRESS_BODY_TOO_LARGE");
    const saved = await persistAttempt(db, ownerId, rpcRequest);
    return reply({ ...saved, quizKey, contentHash, score, questionResults });
  } catch (error) {
    return fail(error);
  }
}
