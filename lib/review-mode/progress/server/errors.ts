export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export class ReviewProgressError extends Error {
  constructor(readonly status: number, readonly code: string, readonly retryAfter?: number) {
    super(code);
  }
}

export function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...PRIVATE_HEADERS, ...headers } });
}

export function fail(error: unknown) {
  if (error instanceof ReviewProgressError) {
    return reply({ code: error.code }, error.status, error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {});
  }
  return reply({ code: "REVIEW_PROGRESS_UNAVAILABLE" }, 503);
}

export function mapStorageError(error: { code?: string; message?: string } | null | undefined): never {
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
