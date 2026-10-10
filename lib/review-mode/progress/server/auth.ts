import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { accountBackendUrl, authModeForRequest, CANONICAL_SITE_ORIGIN } from "@/lib/auth/authMode";
import { consumeRateLimit } from "@/lib/auth/server/rateLimit";
import { extractAccessToken } from "@/lib/auth/sessions/sessionCookie";

import { failureStatus, verifyAccount } from "@/lib/auth/sign-in/account-verify";

import { ReviewProgressError } from "./errors";
import { MAX_REQUEST_BYTES } from "./limits";
export function normalizeLocalHost(host: string): string {
  return host.trim().toLowerCase().replace(/^(127\.0\.0\.1|\[::1\]|::1)(?=:|$)/, "localhost");
}

export function isLocalReviewHost(host: string): boolean {
  try {
    const url = new URL(`http://${host}`);
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase()) && url.port === "35349";
  } catch {
    return false;
  }
}

/** The reverse proxy owns Host and APP_URL; Next's internal initURL is not an external-origin signal. */
export function assertReviewOrigin(request: NextRequest, requireOrigin: boolean) {
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

export async function ownerFor(request: NextRequest): Promise<string> {
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

export function assertExpectedOwnerBinding(request: Request, ownerId: string) {
  const value = request.headers.get("x-studysolo-owner-binding") ?? "";
  const expected = createHash("sha256").update(`studysolo-review-owner-binding-v1:${ownerId}`).digest();
  let received: Buffer;
  try { received = Buffer.from(value, "hex"); } catch { received = Buffer.alloc(0); }
  if (!/^[a-f0-9]{64}$/i.test(value) || received.byteLength !== expected.byteLength || !timingSafeEqual(received, expected)) {
    throw new ReviewProgressError(409, "REVIEW_OWNER_CHANGED");
  }
}

export async function readBody(request: Request): Promise<unknown> {
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
