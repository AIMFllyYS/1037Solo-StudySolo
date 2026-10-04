import { NextResponse, type NextRequest } from "next/server";
import { ConnectorError, connectorFailure } from "./actor.server";
import { connectorOrigin } from "./config.server";
import type { OAuthConnectorId } from "./registry";

const CODES = new Set([
  "SESSION_MISSING", "SESSION_INVALID", "SIGN_IN_REQUIRED", "MFA_REQUIRED", "REAUTH_REQUIRED", "ACCOUNT_UNAVAILABLE", "ACCOUNT_DISABLED", "EMAIL_UNVERIFIED",
  "CONNECTOR_PRODUCTION_DISABLED", "OAUTH_CLIENT_NOT_CONFIGURED",
  "OAUTH_CANCELLED", "OAUTH_STATE_INVALID", "OAUTH_ALREADY_CONSUMED", "OAUTH_OWNER_CHANGED", "OAUTH_CODE_INVALID", "OAUTH_VERIFIER_INVALID",
  "GOOGLE_SCOPE_REQUIRED", "UNAPPROVED_GOOGLE_SCOPE", "ZOTERO_APPLICATION_NOT_CONFIGURED", "ZOTERO_SCOPE_MISMATCH_REVIEW_PROVIDER_KEY",
  "CONNECTOR_PREPARATION_FAILED", "OAUTH_NOT_COMPLETED_RETRY_REQUIRED", "ZOTERO_PREPARATION_FAILED", "ZOTERO_OAUTH_FAILED",
]);

/** Browser form/callback recovery. API callers retain the original status/body. */
export async function connectorBrowserFailure(request: NextRequest, provider: OAuthConnectorId, cause: unknown, fallback: string): Promise<Response> {
  const failure = cause instanceof Response ? cause : cause instanceof ConnectorError ? connectorFailure(cause) : NextResponse.json({ code: fallback }, { status: 503 });
  if (request.headers.get("sec-fetch-mode") !== "navigate" || !request.headers.get("accept")?.includes("text/html")) return failure;
  let origin: string;
  try { origin = connectorOrigin(); } catch { return failure; }
  if (request.headers.get("host")?.toLowerCase() !== new URL(origin).host) return failure;
  const body = await failure.clone().json().catch(() => null);
  const code = CODES.has(body?.code) ? body.code : CODES.has(fallback) ? fallback : "OAUTH_NOT_COMPLETED_RETRY_REQUIRED";
  const target = new URL("/agent/plugins", origin);
  target.searchParams.set("connection", provider);
  target.searchParams.set("connection_error", code);
  return NextResponse.redirect(target, 303);
}
