// GENERATED from 1037Solo-Shared/src/auth/account-verify.ts by 1037Solo-Shared/scripts/sync-sign-in.mjs. Do not edit here: edit the source and re-run the script.
/**
 * Who is behind this access token? — for a product's SERVER (Next proxy, route handler).
 * Contract: 1037Solo-Accounts/docs/integration-protocol.md §5-6.
 *
 * The answer comes from the Account backend (`GET /api/v1/introspect`), the only place that
 * decides "signed in", "disabled", "needs two-step verification" and "administrator". Products
 * do not verify signatures, read user_profiles for identity, or keep their own admin lists.
 *
 * Positive answers are reused for up to `cacheSeconds` (never past the token's own expiry) and
 * concurrent checks of one token share one call. Pass `live: true` for sensitive operations.
 *
 * No framework imports and no Node-only APIs: runs in any fetch-capable runtime.
 */

export type AccountIdentity = {
  active: true;
  user_id: string;
  email: string;
  email_verified: boolean;
  name: string | null;
  avatar_url: string | null;
  role: string;
  plan_id: string;
  aal: "aal1" | "aal2";
  mfa_enrolled: boolean;
  /** The session must complete two-step verification before it may be used. */
  mfa_required: boolean;
  /** The ecosystem's single administrator definition (Account decides). */
  is_admin: boolean;
  session_id: string;
  exp: number;
  /** Seconds since epoch of the latest two-step verification in this session, or null. */
  recent_mfa_at: number | null;
  last_auth_at: number | null;
  /** Linked sign-in methods: "email" (password), "github", "google". */
  providers: string[];
  created_at: string | null;
};

export type VerifyResult =
  | { kind: "ok"; identity: AccountIdentity }
  /** 401: no session or it ended. Renew once (session-refresh.ts), then send the user to sign in. */
  | { kind: "signed-out"; code: string }
  /** 403: the account may not be used (ACCOUNT_DISABLED, EMAIL_UNVERIFIED). Signing in again does not help. */
  | { kind: "forbidden"; code: string }
  /** Account could not answer. The user is NOT signed out: answer 503 and let them retry. */
  | { kind: "unavailable" };

export type VerifyOptions = {
  /** Account backend base URL, e.g. http://127.0.0.1:3041 (ACCOUNT_BACKEND_URL). */
  accountBackendUrl: string;
  /** Skip every cache (here and in Account). Use for admin writes, payments, deletions. */
  live?: boolean;
  cacheSeconds?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

const MAX_ENTRIES = 5000;
const cache = new Map<string, { until: number; identity: AccountIdentity }>();
const pending = new Map<string, Promise<VerifyResult>>();

/** Test hook. */
export function resetVerifier(): void {
  cache.clear();
  pending.clear();
}

export async function verifyAccount(token: string | null | undefined, options: VerifyOptions): Promise<VerifyResult> {
  if (!token) return { kind: "signed-out", code: "SESSION_MISSING" };
  const now = (options.now ?? Date.now)();
  if (!options.live) {
    const hit = cache.get(token);
    if (hit && hit.until > now) return { kind: "ok", identity: hit.identity };
    if (hit) cache.delete(token);
  }
  const key = options.live ? `live:${token}` : token;
  let flight = pending.get(key);
  if (!flight) {
    flight = introspect(token, options).finally(() => pending.delete(key));
    pending.set(key, flight);
  }
  const result = await flight;
  if (result.kind === "ok") {
    const ttl = (options.cacheSeconds ?? 60) * 1000;
    const until = Math.min(now + ttl, result.identity.exp * 1000);
    if (until > now) {
      if (cache.size >= MAX_ENTRIES) {
        for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
        while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
      }
      cache.set(token, { until, identity: result.identity });
    }
  }
  return result;
}

async function introspect(token: string, options: VerifyOptions): Promise<VerifyResult> {
  const url = `${options.accountBackendUrl.replace(/\/+$/, "")}/api/v1/introspect${options.live ? "?live=true" : ""}`;
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    });
  } catch {
    return { kind: "unavailable" };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const code = typeof body?.code === "string" ? body.code : "";
  if (response.status === 401) return { kind: "signed-out", code: code || "SESSION_INVALID" };
  if (response.status === 403) return { kind: "forbidden", code: code || "ACCOUNT_DISABLED" };
  if (!response.ok || !body || body.active !== true || typeof body.user_id !== "string") return { kind: "unavailable" };
  return { kind: "ok", identity: body as unknown as AccountIdentity };
}

/** Bearer header first, then the shared `access_token` cookie. */
export function requestToken(headers: { get(name: string): string | null }): string | null {
  const bearer = headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (bearer) return bearer;
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === "access_token") return part.slice(index + 1).trim() || null;
  }
  return null;
}

/** True when the session completed two-step verification within `seconds` (sensitive actions: 600). */
export function verifiedRecently(identity: Pick<AccountIdentity, "recent_mfa_at">, seconds = 600, nowMs = Date.now()): boolean {
  return identity.recent_mfa_at !== null && nowMs / 1000 - identity.recent_mfa_at <= seconds;
}

/** HTTP status a product API should answer for a non-ok result. */
export function failureStatus(result: Exclude<VerifyResult, { kind: "ok" }>): 401 | 403 | 503 {
  return result.kind === "signed-out" ? 401 : result.kind === "forbidden" ? 403 : 503;
}
