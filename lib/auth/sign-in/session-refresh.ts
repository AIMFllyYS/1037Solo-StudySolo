// GENERATED from 1037Solo-Shared/src/auth/session-refresh.ts by 1037Solo-Shared/scripts/sync-sign-in.mjs. Do not edit here: edit the source and re-run the script.
/**
 * Silent renewal of the shared 1037Solo sign-in, for a product's server
 * (its Next.js proxy). Design: 1037Solo-Accounts/docs/popup-signin-and-billing-20261001.md §1.6.
 *
 *   browser ── request with access_token (expired) + refresh_token ──> product proxy
 *   product proxy ── POST /api/auth/refresh (refresh_token only) ──> Account backend ──> Supabase
 *   product proxy <── Set-Cookie: new access_token / refresh_token
 *   downstream page / API sees the NEW access token; the browser stores the new cookies
 *
 * The access token lives about an hour. A product that only verifies it signs
 * the user out after an hour even though the refresh token is good for days.
 * Renewal always goes through the Account backend, never Supabase directly:
 * the backend is the only writer of the shared cookies, so there is never a
 * second copy of the refresh token that could fall behind and be "reused" —
 * which Supabase answers by revoking the whole session.
 *
 * No framework imports and no Node-only APIs: runs in any fetch-capable runtime.
 */

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
export const REMEMBER_COOKIE = "remember_me";

/** Renew this long before expiry, so a token cannot expire between proxy and handler. */
export const RENEW_BEFORE_SECONDS = 60;

export type RenewalResult =
  /** New tokens. Forward `setCookies` to the browser and `cookieHeader` to the downstream handler. */
  | { kind: "renewed"; setCookies: string[]; cookieHeader: string; accessToken: string }
  /** The Account backend rejected the refresh token: the user really is signed out. Forward `setCookies` (they clear the cookies). */
  | { kind: "signed-out"; setCookies: string[] }
  /** The Account backend or Supabase could not answer. Keep the cookies; the next request tries again. */
  | { kind: "unavailable"; status: number };

export function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

/** `exp` of a JWT in seconds, without verifying it (verification stays with the product). */
export function tokenExpiresAt(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as { exp?: unknown };
    return typeof claims.exp === "number" && Number.isFinite(claims.exp) ? claims.exp : null;
  } catch {
    return null;
  }
}

/**
 * True when the request carries a refresh token and its access token is
 * missing or about to expire. A present but undecodable access token is left
 * to the product's own verification, so a malformed cookie cannot cause a
 * refresh on every request.
 */
export function needsRenewal(cookieHeader: string | null | undefined, nowSeconds = Date.now() / 1000): boolean {
  if (!readCookie(cookieHeader, REFRESH_COOKIE)) return false;
  const access = readCookie(cookieHeader, ACCESS_COOKIE);
  if (!access) return true;
  const expiresAt = tokenExpiresAt(access);
  return expiresAt !== null && expiresAt - nowSeconds < RENEW_BEFORE_SECONDS;
}

/** The cookie header with some cookies replaced (value) or removed (null); others untouched, order kept. */
export function withCookies(cookieHeader: string | null | undefined, updates: Record<string, string | null>): string {
  const pending = new Map(Object.entries(updates));
  const parts: string[] = [];
  for (const raw of (cookieHeader ?? "").split(";")) {
    const part = raw.trim();
    if (!part) continue;
    const index = part.indexOf("=");
    const name = index < 0 ? part : part.slice(0, index).trim();
    if (pending.has(name)) {
      const value = pending.get(name);
      pending.delete(name);
      if (value !== null && value !== undefined) parts.push(`${name}=${value}`);
      continue;
    }
    parts.push(part);
  }
  for (const [name, value] of pending) if (value !== null) parts.push(`${name}=${value}`);
  return parts.join("; ");
}

/** name → value of each Set-Cookie line that sets (not deletes) a cookie. */
export function cookiesSetBy(setCookies: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of setCookies) {
    const [pair, ...attributes] = line.split(";");
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim().replace(/^"(.*)"$/, "$1");
    const deleting = !value || attributes.some((attribute) => /^\s*max-age\s*=\s*0\s*$/i.test(attribute));
    if (name && !deleting) values[name] = value;
  }
  return values;
}

function setCookieLines(headers: Headers): string[] {
  const withList = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withList.getSetCookie === "function") return withList.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

export type RenewOptions = {
  /** Account backend base URL, e.g. http://127.0.0.1:3041 (ACCOUNT_BACKEND_URL). */
  accountBackendUrl: string;
  /** The incoming request's Cookie header. Only the refresh cookies are forwarded. */
  cookieHeader: string;
  /** This product's public origin; it must be on the Account backend's CORS_ORIGINS. */
  origin: string;
  forwardedFor?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function renewSession(options: RenewOptions): Promise<RenewalResult> {
  const refreshToken = readCookie(options.cookieHeader, REFRESH_COOKIE);
  if (!refreshToken) return { kind: "unavailable", status: 0 };
  // A page fires several requests at once; each would rotate the same refresh token and all but
  // one would present an already-used token. Share one Account call, and replay its success to
  // late duplicates for a few seconds (inside Supabase's 10 s reuse interval).
  const now = Date.now();
  for (const [key, entry] of inflight) if (now - entry.at > REUSE_MS) inflight.delete(key);
  let entry = inflight.get(refreshToken);
  if (!entry) {
    const promise = callAccount(refreshToken, options);
    entry = { at: now, promise };
    inflight.set(refreshToken, entry);
    void promise.then((outcome) => { if (outcome.kind !== "renewed") inflight.delete(refreshToken); });
  }
  const outcome = await entry.promise;
  if (outcome.kind !== "renewed") return outcome;
  return {
    kind: "renewed",
    setCookies: outcome.setCookies,
    accessToken: outcome.accessToken,
    cookieHeader: withCookies(options.cookieHeader, { [ACCESS_COOKIE]: outcome.accessToken, [REFRESH_COOKIE]: outcome.refreshToken }),
  };
}

type AccountOutcome =
  | { kind: "renewed"; setCookies: string[]; accessToken: string; refreshToken: string }
  | Exclude<RenewalResult, { kind: "renewed" }>;

const REUSE_MS = 8000;
const inflight = new Map<string, { at: number; promise: Promise<AccountOutcome> }>();

/** Test hook: forget in-flight and recently replayed renewals. */
export function resetRenewals(): void {
  inflight.clear();
}

async function callAccount(refreshToken: string, options: RenewOptions): Promise<AccountOutcome> {
  const remember = readCookie(options.cookieHeader, REMEMBER_COOKIE);
  const forwarded = [`${REFRESH_COOKIE}=${refreshToken}`, ...(remember ? [`${REMEMBER_COOKIE}=${remember}`] : [])].join("; ");
  const headers: Record<string, string> = { cookie: forwarded, origin: options.origin, accept: "application/json" };
  if (options.forwardedFor) headers["x-forwarded-for"] = options.forwardedFor;

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${options.accountBackendUrl.replace(/\/+$/, "")}/api/v1/session/refresh`, {
      method: "POST",
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    });
  } catch {
    return { kind: "unavailable", status: 0 };
  }

  const setCookies = setCookieLines(response.headers);
  if (response.status === 401) return { kind: "signed-out", setCookies };
  if (!response.ok) return { kind: "unavailable", status: response.status };

  const fresh = cookiesSetBy(setCookies);
  const accessToken = fresh[ACCESS_COOKIE];
  const newRefresh = fresh[REFRESH_COOKIE];
  if (!accessToken || !newRefresh) return { kind: "unavailable", status: response.status };
  return { kind: "renewed", setCookies, accessToken, refreshToken: newRefresh };
}

/** `renewSession` when the request needs it, otherwise null (the common case: no network call). */
export async function renewIfNeeded(options: RenewOptions & { pathname?: string }): Promise<RenewalResult | null> {
  if (options.pathname && isSignOutPath(options.pathname)) return null;
  return needsRenewal(options.cookieHeader) ? renewSession(options) : null;
}

/**
 * Never renew on the way to signing out: the renewal's new cookies could land
 * after the route's clearing ones and silently sign the user back in.
 */
export function isSignOutPath(pathname: string): boolean {
  return /\/(?:logout|log-out|sign-?out)\/?$/i.test(pathname);
}

/**
 * The Account backend or Supabase is down (or rate-limiting). An API request
 * should then answer 503, not 401: a 401 would ask a user who is still signed
 * in to sign in again. A configuration refusal (403) is not an outage — it
 * falls through to the product's normal "signed out" handling.
 */
export function isOutage(renewal: RenewalResult | null): boolean {
  return renewal?.kind === "unavailable" && (renewal.status === 0 || renewal.status === 429 || renewal.status >= 500);
}

/** Request headers for the downstream handler: the renewed cookies, or none of the dead ones. Null = unchanged. */
export function downstreamHeaders(incoming: Headers, renewal: RenewalResult | null): Headers | null {
  if (!renewal || renewal.kind === "unavailable") return null;
  const headers = new Headers(incoming);
  headers.set("cookie", renewal.kind === "renewed"
    ? renewal.cookieHeader
    : withCookies(incoming.get("cookie"), { [ACCESS_COOKIE]: null, [REFRESH_COOKIE]: null, [REMEMBER_COOKIE]: null }));
  return headers;
}

/** Pass the Account backend's Set-Cookie lines on to the browser. */
export function forwardCookies<T extends { headers: Headers }>(response: T, renewal: RenewalResult | null): T {
  if (renewal && renewal.kind !== "unavailable") {
    for (const line of renewal.setCookies) response.headers.append("set-cookie", line);
  }
  return response;
}
