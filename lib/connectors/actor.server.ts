import type { NextRequest } from "next/server";
import { accountBackendUrl, authModeForRequest } from "@/lib/auth/authMode";
import { requestToken, verifyAccount, verifiedRecently, failureStatus } from "@/lib/auth/sign-in/account-verify";
import { connectorOrigin } from "./config.server";
export class ConnectorError extends Error { constructor(readonly code: string, readonly status = 400) { super(code); } }
export function requireConnectorOrigin(request: NextRequest, mutation = false): string {
  if (process.env.NODE_ENV === "production" && process.env.CONNECTOR_ALLOW_PRODUCTION !== "true") throw new ConnectorError("CONNECTOR_PRODUCTION_DISABLED", 403);
  const origin = connectorOrigin();
  if (request.nextUrl.origin !== origin || request.headers.get("host") !== new URL(origin).host || mutation && request.headers.get("origin") !== origin) throw new ConnectorError("ORIGIN_REJECTED", 403);
  return origin;
}
export async function connectorOwner(request: NextRequest, sensitive = false): Promise<string> {
  const result = await verifyAccount(requestToken(request.headers), { accountBackendUrl: accountBackendUrl(authModeForRequest(request)), live: true });
  if (result.kind !== "ok") throw new ConnectorError(result.kind === "unavailable" ? "ACCOUNT_UNAVAILABLE" : result.code, failureStatus(result));
  const identity = result.identity;
  if (identity.mfa_required) throw new ConnectorError("MFA_REQUIRED", 403);
  if (sensitive && identity.mfa_enrolled && !verifiedRecently(identity, 600)) throw new ConnectorError("REAUTH_REQUIRED", 403);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(identity.user_id)) throw new ConnectorError("ACCOUNT_ID_INVALID", 503);
  return identity.user_id;
}
export function connectorFailure(error: unknown) {
  return Response.json({ code: error instanceof ConnectorError ? error.code : "CONNECTOR_UNAVAILABLE" }, { status: error instanceof ConnectorError ? error.status : 503, headers: { "Cache-Control": "private, no-store" } });
}
