import { NextRequest } from "next/server";
import { accountBackendUrl, authModeForRequest, CANONICAL_SITE_ORIGIN } from "@/lib/auth/authMode";
import { consumeRateLimit } from "@/lib/auth/rateLimit";
import { extractAccessToken } from "@/lib/auth/sessionCookie";
import { createServiceAuthClient } from "@/lib/auth/serviceClient";
import { failureStatus, verifyAccount } from "@/lib/auth/sign-in/account-verify";
import { prepareFeedbackExcerpt, prepareFeedbackText } from "@/lib/chat/feedbackExcerpt";
import { desktopCloudBridgeEnabled, forwardDesktopAgentRequest } from "@/lib/sandbox/desktop-bridge.server";
import { sandboxFailure } from "@/lib/sandbox/config.server";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REPORT_REASONS = new Set(["inaccurate", "unsafe", "privacy", "other"]);

class FeedbackError extends Error {
  constructor(readonly status: number, readonly code: string, readonly retryAfter?: number) {
    super(code);
  }
}

function reply(value: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { ...PRIVATE_HEADERS, ...extraHeaders } });
}

function fail(error: unknown) {
  if (error instanceof FeedbackError) {
    return reply({ code: error.code }, error.status, error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {});
  }
  return reply({ code: "FEEDBACK_UNAVAILABLE" }, 503);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new FeedbackError(415, "JSON_REQUIRED");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new FeedbackError(400, "BODY_REQUIRED");

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8_192) {
      await reader.cancel();
      throw new FeedbackError(413, "BODY_TOO_LARGE");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new FeedbackError(400, "INVALID_JSON");
  }
}

function onlyKeys(body: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new FeedbackError(400, "UNKNOWN_FIELD");
}

function opaqueId(value: unknown, code: string): string {
  if (typeof value !== "string" || !OPAQUE_ID.test(value)) throw new FeedbackError(400, code);
  return value;
}

function excerpt(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || Array.from(value).length > 2_000) throw new FeedbackError(400, "INVALID_EXCERPT");
  const sanitized = prepareFeedbackExcerpt(value);
  return sanitized || null;
}

function details(value: unknown, required: boolean): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new FeedbackError(400, "FEEDBACK_TEXT_REQUIRED");
    return null;
  }
  if (typeof value !== "string" || Array.from(value).length > 2_000) throw new FeedbackError(400, "INVALID_FEEDBACK_TEXT");
  const sanitized = prepareFeedbackText(value);
  if (required && Array.from(sanitized).length < 3) throw new FeedbackError(400, "FEEDBACK_TEXT_REQUIRED");
  return sanitized || null;
}

function supabaseError(error: { code?: string; message?: string } | null | undefined): never {
  if (error?.code === "PGRST202" || error?.code === "PGRST205" || error?.code === "42P01"
    || /could not find the function|could not find the table|does not exist/i.test(error?.message ?? "")) {
    throw new FeedbackError(503, "FEEDBACK_MIGRATION_PENDING");
  }
  throw new FeedbackError(503, "FEEDBACK_STORAGE_UNAVAILABLE");
}

async function ownerFor(request: NextRequest, readOnly = false): Promise<string> {
  const token = extractAccessToken(request.headers);
  const verified = await verifyAccount(token, {
    accountBackendUrl: accountBackendUrl(authModeForRequest(request)),
    live: true,
  });
  if (verified.kind !== "ok") {
    const code = verified.kind === "unavailable" ? "ACCOUNT_UNAVAILABLE" : verified.code;
    throw new FeedbackError(failureStatus(verified), code);
  }
  if (verified.identity.mfa_required) throw new FeedbackError(403, "MFA_REQUIRED");
  if (!UUID.test(verified.identity.user_id)) throw new FeedbackError(503, "ACCOUNT_ID_INVALID");
  const limit = consumeRateLimit(`chat-feedback:${readOnly ? "read:" : ""}${verified.identity.user_id}`, { max: readOnly ? 120 : 30, windowMs: 60_000 });
  if (!limit.ok) throw new FeedbackError(429, "RATE_LIMITED", limit.retryAfterSec);
  return verified.identity.user_id;
}

function normalizeLocalHost(host: string): string {
  return host.trim().toLowerCase().replace(/^(127\.0\.0\.1|\[::1\]|::1)(?=:|$)/, "localhost");
}

function isLocalFeedbackHost(host: string): boolean {
  try {
    const url = new URL(`http://${host}`);
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase()) && url.port === "35349";
  } catch {
    return false;
  }
}

function assertSameOrigin(request: NextRequest) {
  const hostHeader = request.headers.get("host")?.trim();
  if (!hostHeader) {
    throw new FeedbackError(403, "ORIGIN_REJECTED");
  }

  const origin = request.headers.get("origin");
  if (!origin) throw new FeedbackError(403, "ORIGIN_REJECTED");
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new FeedbackError(403, "ORIGIN_REJECTED");
  }
  if (parsedOrigin.origin !== origin || parsedOrigin.username || parsedOrigin.password) {
    throw new FeedbackError(403, "ORIGIN_REJECTED");
  }

  if (isLocalFeedbackHost(hostHeader)) {
    if (process.env.NODE_ENV === "production" || request.nextUrl.protocol !== "http:" || normalizeLocalHost(request.nextUrl.host) !== normalizeLocalHost(hostHeader)
      || normalizeLocalHost(parsedOrigin.host) !== normalizeLocalHost(hostHeader)
      || parsedOrigin.protocol !== "http:") throw new FeedbackError(403, "ORIGIN_REJECTED");
  } else {
    let expected: URL;
    try {
      expected = new URL(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || CANONICAL_SITE_ORIGIN);
    } catch {
      throw new FeedbackError(503, "FEEDBACK_ORIGIN_UNCONFIGURED");
    }
    if (normalizeLocalHost(hostHeader) !== normalizeLocalHost(expected.host)
      || parsedOrigin.origin !== expected.origin) {
      throw new FeedbackError(403, "ORIGIN_REJECTED");
    }
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new FeedbackError(403, "ORIGIN_REJECTED");
}

function feedbackResult(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") throw new FeedbackError(503, "FEEDBACK_STORAGE_UNAVAILABLE");
  const record = row as Record<string, unknown>;
  if (typeof record.id !== "string" || !Number.isSafeInteger(record.revision)
    || typeof record.feedback_type !== "string" || typeof record.status !== "string") {
    throw new FeedbackError(503, "FEEDBACK_STORAGE_UNAVAILABLE");
  }
  return {
    id: record.id,
    feedbackType: record.feedback_type,
    revision: record.revision,
    status: record.status,
    reportReason: typeof record.report_reason === "string" ? record.report_reason : null,
    feedbackText: typeof record.feedback_text === "string" ? record.feedback_text : null,
    answerExcerpt: typeof record.answer_excerpt === "string" ? record.answer_excerpt : null,
  };
}

export async function POST(request: NextRequest) {
  if (desktopCloudBridgeEnabled()) {
    try {
      return await forwardDesktopAgentRequest(request);
    } catch (error) {
      return sandboxFailure(error);
    }
  }
  try {
    assertSameOrigin(request);
    const body = await readJson(request);
    const action = body.action;
    const userUuid = await ownerFor(request, action === "state");
    const db = createServiceAuthClient();

    // Keep restoration on the existing POST transport, including the desktop bridge.
    // The browser supplies only a message location; Account supplies the owner.
    if (action === "state") {
      onlyKeys(body, ["action", "sessionId", "messageId"]);
      const sessionId = opaqueId(body.sessionId, "INVALID_SESSION_ID");
      const messageId = opaqueId(body.messageId, "INVALID_MESSAGE_ID");
      const { data, error } = await db.from("ss_chat_feedback")
        .select("id,feedback_type,revision,status,report_reason,feedback_text,answer_excerpt")
        .eq("user_uuid", userUuid)
        .eq("session_id", sessionId)
        .eq("message_id", messageId)
        .limit(2);
      if (error) supabaseError(error);
      return reply({ items: (data ?? []).map(feedbackResult) });
    }

    if (action === "vote") {
      onlyKeys(body, ["action", "sessionId", "messageId", "vote"]);
      const sessionId = opaqueId(body.sessionId, "INVALID_SESSION_ID");
      const messageId = opaqueId(body.messageId, "INVALID_MESSAGE_ID");
      if (body.vote !== "like" && body.vote !== "dislike") throw new FeedbackError(400, "INVALID_VOTE");
      const { data, error } = await db.rpc("ss_chat_feedback_vote", {
        p_user_uuid: userUuid,
        p_session_id: sessionId,
        p_message_id: messageId,
        p_vote: body.vote,
      });
      if (error) supabaseError(error);
      return reply(feedbackResult(data));
    }

    if (action === "report") {
      onlyKeys(body, ["action", "sessionId", "messageId", "reason", "feedbackText", "answerExcerpt"]);
      const sessionId = opaqueId(body.sessionId, "INVALID_SESSION_ID");
      const messageId = opaqueId(body.messageId, "INVALID_MESSAGE_ID");
      if (typeof body.reason !== "string" || !REPORT_REASONS.has(body.reason)) throw new FeedbackError(400, "INVALID_REPORT_REASON");
      const feedbackText = details(body.feedbackText, true);
      const answerExcerpt = excerpt(body.answerExcerpt);
      const { data, error } = await db.rpc("ss_chat_feedback_report", {
        p_user_uuid: userUuid,
        p_session_id: sessionId,
        p_message_id: messageId,
        p_reason: body.reason,
        p_feedback_text: feedbackText,
        p_answer_excerpt: answerExcerpt,
      });
      if (error) supabaseError(error);
      return reply(feedbackResult(data));
    }

    if (action === "update-details") {
      onlyKeys(body, ["action", "feedbackId", "vote", "revision", "feedbackText", "answerExcerpt"]);
      if (typeof body.feedbackId !== "string" || !UUID.test(body.feedbackId)) throw new FeedbackError(400, "INVALID_FEEDBACK_ID");
      if (body.vote !== "like" && body.vote !== "dislike") throw new FeedbackError(400, "INVALID_VOTE");
      if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw new FeedbackError(400, "INVALID_REVISION");
      const feedbackText = details(body.feedbackText, false);
      const answerExcerpt = excerpt(body.answerExcerpt);
      if (!feedbackText && !answerExcerpt) throw new FeedbackError(400, "FEEDBACK_DETAILS_REQUIRED");

      const revision = Number(body.revision);
      const { data, error } = await db.from("ss_chat_feedback")
        .update({ feedback_text: feedbackText, answer_excerpt: answerExcerpt, revision: revision + 1, updated_at: new Date().toISOString() })
        .eq("id", body.feedbackId)
        .eq("user_uuid", userUuid)
        .eq("feedback_slot", "vote")
        .eq("feedback_type", body.vote)
        .eq("revision", revision)
        .select("id,feedback_type,revision,status,report_reason,feedback_text,answer_excerpt")
        .maybeSingle();
      if (error) supabaseError(error);
      if (data) return reply(feedbackResult(data));

      // A retry after a lost success response is safe; a different vote/revision is stale.
      const { data: current, error: currentError } = await db.from("ss_chat_feedback")
        .select("id,feedback_type,revision,status,report_reason,feedback_text,answer_excerpt")
        .eq("id", body.feedbackId)
        .eq("user_uuid", userUuid)
        .maybeSingle();
      if (currentError) supabaseError(currentError);
      if (current && current.feedback_type === body.vote && current.feedback_text === feedbackText && current.answer_excerpt === answerExcerpt) {
        return reply(feedbackResult(current));
      }
      throw new FeedbackError(409, "FEEDBACK_STALE");
    }

    throw new FeedbackError(400, "INVALID_ACTION");
  } catch (error) {
    return fail(error);
  }
}
