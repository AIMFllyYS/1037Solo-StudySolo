/** Zotero uses OAuth 1.0a to issue an API key, not the MCP OAuth 2 flow. */
import { createHmac, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { digest, equalDigest, ownerOf, requireDevelopment, developmentAuthorizationPage, type DevelopmentGrant } from "./development-oauth.server";
import { readRecord, writeRecord, claimRecord } from "./development-vault.server";
import { withLease } from "./persistence.server";
import { requireConnectorOrigin, ConnectorError, connectorFailure } from "./actor.server";
import { connectorResponseText, connectorResponseJson } from "./response.server";
const callbackPath = "/api/connectors/zotero/callback/";
const cookie = "connector_dev_zotero";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const random = () => randomBytes(32).toString("base64url");
const failure = (code: string, status = 400) => NextResponse.json({ code }, { status, headers });
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
type Pending = { owner: string; state: string; token: string; secret: string; bindingHash: string; expiresAt: number; callback: string };
type KeyIdentity = { userID?: unknown; access?: { user?: { library?: boolean; notes?: boolean; write?: boolean }; groups?: Record<string, { library?: boolean; write?: boolean }> } };

export function oauth1Header(url: string, clientKey: string, clientSecret: string, extra: Record<string, string>, tokenSecret = "", nonce = random(), timestamp = String(Math.floor(Date.now() / 1000))) {
  const params: Record<string, string> = { oauth_consumer_key: clientKey, oauth_nonce: nonce, oauth_signature_method: "HMAC-SHA1", oauth_timestamp: timestamp, oauth_version: "1.0", ...extra };
  const normalized = Object.entries(params).map(([key, value]) => [encode(key), encode(value)]).sort(([a, av], [b, bv]) => a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0).map(([key, value]) => `${key}=${value}`).join("&");
  params.oauth_signature = createHmac("sha1", `${encode(clientSecret)}&${encode(tokenSecret)}`).update(`POST&${encode(url)}&${encode(normalized)}`).digest("base64");
  return `OAuth ${Object.entries(params).map(([key, value]) => `${encode(key)}="${encode(value)}"`).join(", ")}`;
}

function application() {
  const key = process.env.ZOTERO_CONNECTOR_CLIENT_KEY?.trim(), secret = process.env.ZOTERO_CONNECTOR_CLIENT_SECRET?.trim();
  if (!key || !secret || /[\r\n\0]/.test(key + secret) || process.env.NEXT_PUBLIC_ZOTERO_CONNECTOR_CLIENT_SECRET) throw failure("ZOTERO_APPLICATION_NOT_CONFIGURED", 503);
  return { key, secret };
}

async function exchange(url: string, extras: Record<string, string>, tokenSecret = "") {
  const app = application();
  const response = await fetch(url, { method: "POST", headers: { Authorization: oauth1Header(url, app.key, app.secret, extras, tokenSecret), "Content-Type": "application/x-www-form-urlencoded" }, body: "", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
  const raw = await connectorResponseText(response, 16384);
  return new URLSearchParams(raw);
}

export async function zoteroDevelopmentConnect(request: NextRequest) {
  try {
    const origin = requireConnectorOrigin(request, true);
    const owner = await ownerOf(request), state = random(), binding = random();
    const callback = `${origin}${callbackPath}?state=${state}`;
    const tokens = await exchange("https://www.zotero.org/oauth/request", { oauth_callback: callback });
    const token = tokens.get("oauth_token"), secret = tokens.get("oauth_token_secret");
    if (!token || !secret || tokens.get("oauth_callback_confirmed") !== "true") throw new Error("zotero_request_token_invalid");
    await writeRecord(`pending:${state}`, { owner, state, token, secret, bindingHash: digest(binding), expiresAt: Date.now() + 600000, callback } satisfies Pending);
    const url = new URL("https://www.zotero.org/oauth/authorize");
    url.search = new URLSearchParams({ oauth_token: token, name: origin.startsWith("https:") ? "1037Solo StudySolo" : "1037Solo StudySolo Development", library_access: "1", notes_access: "0", write_access: "0", all_groups: "none" }).toString();
    const response = developmentAuthorizationPage(url, "zotero");
    response.cookies.set(cookie, binding, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: "/api/connectors/zotero/", maxAge: 600 });
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  } catch (cause) { return cause instanceof Response ? cause : cause instanceof ConnectorError ? connectorFailure(cause) : failure("ZOTERO_PREPARATION_FAILED", 503); }
}

export async function zoteroDevelopmentCallback(request: NextRequest) {
  let result: Response;
  let phase = "state";
  try {
    const origin = requireConnectorOrigin(request), state = request.nextUrl.searchParams.get("state") ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw failure("OAUTH_STATE_INVALID");
    const pending = await readRecord<Pending>(`pending:${state}`);
    const token = request.nextUrl.searchParams.get("oauth_token") ?? "";
    const verifier = request.nextUrl.searchParams.get("oauth_verifier") ?? "";
    if (!pending || !equalDigest(digest(pending.token), digest(token)) || pending.expiresAt <= Date.now() || !equalDigest(pending.bindingHash, digest(request.cookies.get(cookie)?.value ?? ""))) throw failure("OAUTH_STATE_INVALID");
    phase = "account";
    const owner = await ownerOf(request);
    if (owner !== pending.owner) throw failure("OAUTH_OWNER_CHANGED", 403);
    if (!verifier || verifier.length > 4096 || /[\r\n\0]/.test(verifier)) throw failure("OAUTH_VERIFIER_INVALID");
    if (!await claimRecord(`pending:${state}`)) throw failure("OAUTH_ALREADY_CONSUMED");
    phase = "exchange";
    const tokens = await exchange("https://www.zotero.org/oauth/access", { oauth_token: token, oauth_verifier: verifier }, pending.secret);
    // OAuth 1.0a credentials can differ; keep both candidates encrypted until verified.
    let accessToken = tokens.get("oauth_token");
    const accountId = tokens.get("userID");
    if (!accessToken || !accountId) throw new Error("zotero_access_key_missing");
    // Retain an encrypted candidate before scope validation; never expose/use it as a grant yet.
    await writeRecord(`candidate:${owner}:zotero`, { owner, accessToken, tokenSecret: tokens.get("oauth_token_secret"), accountId, state, createdAt: new Date().toISOString() });
    phase = "identity";
    const identityFor = async (key: string) => {
      const response = await fetch("https://api.zotero.org/keys/current", { headers: { "Zotero-API-Key": key, "Zotero-API-Version": "3" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
      return { ok: response.ok, identity: await connectorResponseJson(response, 16384).catch(() => null) as KeyIdentity | null };
    };
    let checked = await identityFor(accessToken);
    const tokenSecret = tokens.get("oauth_token_secret");
    if ((!checked.ok || !checked.identity) && tokenSecret && tokenSecret !== accessToken) {
      checked = await identityFor(tokenSecret);
      if (checked.ok && checked.identity) accessToken = tokenSecret;
    }
    const identity = checked.identity;
    if (!checked.ok || !identity) throw new Error("zotero_key_identity_unavailable");
    const user = identity.access?.user;
    const groups = Object.values(identity.access?.groups ?? {}) as { library?: boolean; write?: boolean }[];
    if (String(identity.userID) !== accountId || user?.library !== true || user?.notes || user?.write || groups.some(group => group.library || group.write)) throw failure("ZOTERO_SCOPE_MISMATCH_REVIEW_PROVIDER_KEY", 403);
    const grant: DevelopmentGrant = { owner, provider: "zotero", accountId, accessToken, expiresAt: null, scope: "library:read notes:none write:none groups:none", issuer: "https://www.zotero.org", resource: "https://api.zotero.org", callback: `${origin}${callbackPath}`, createdAt: new Date().toISOString(), defaultWritePolicy: "disabled" };
    phase = "storage";
    await withLease(`refresh:${owner}:zotero`, () => writeRecord(`grant:${owner}:zotero`, grant));
    result = NextResponse.redirect(`${origin}/agent/plugins?connected=zotero`, 303);
  } catch (cause) {
    const code = cause instanceof Response ? (await cause.json().catch(() => null))?.code : `ZOTERO_OAUTH_FAILED_${phase.toUpperCase()}`;
    const safeCode = typeof code === "string" && /^[A-Z_]{1,100}$/.test(code) ? code : "ZOTERO_OAUTH_FAILED";
    // This browser result is explicitly unsuccessful; do not turn a failed JSON navigation into a blank browser error.
    result = new NextResponse(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Zotero 开发认证未完成</title><h1>Zotero 开发认证未完成</h1><p>${safeCode}</p><p>没有将本次授权标记为可用。</p><a href="/api/connectors/development">回到开发认证入口</a></html>`, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" } });
  }
  for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
  if (result instanceof NextResponse) result.cookies.set(cookie, "", { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/api/connectors/zotero/", maxAge: 0 });
  return result;
}

export async function zoteroDevelopmentReview(request: NextRequest) {
  try {
    requireDevelopment(request);
    const owner = await ownerOf(request);
    const candidate = await readRecord<{ owner: string; accessToken: string; tokenSecret?: string; accountId: string }>(`candidate:${owner}:zotero`);
    if (!candidate || candidate.owner !== owner) throw failure("ZOTERO_NO_CANDIDATE", 404);
    const inspect = async (key: string) => {
      const response = await fetch("https://api.zotero.org/keys/current", { headers: { "Zotero-API-Key": key, "Zotero-API-Version": "3" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
      return await connectorResponseJson(response, 16384).catch(() => null) as KeyIdentity | null;
    };
    let identity = await inspect(candidate.accessToken);
    if (!identity && candidate.tokenSecret && candidate.tokenSecret !== candidate.accessToken) identity = await inspect(candidate.tokenSecret);
    if (!identity) throw failure("ZOTERO_CANDIDATE_UNAVAILABLE", 503);
    const user = identity.access?.user;
    const groups = Object.values(identity.access?.groups ?? {}) as { library?: boolean; write?: boolean }[];
    const summary = { userMatches: String(identity.userID) === candidate.accountId, personalLibraryRead: user?.library === true, notesRead: user?.notes === true, libraryWrite: user?.write === true, groupsRead: groups.some(group => group.library), groupsWrite: groups.some(group => group.write), authorized: false };
    return new NextResponse(`<!doctype html><html><meta charset="utf-8"><title>Zotero 权限检查</title><h1>Zotero 权限检查</h1><pre>${JSON.stringify(summary, null, 2)}</pre></html>`, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  } catch (cause) {
    const code = cause instanceof Response ? (await cause.json().catch(() => null))?.code : "ZOTERO_CANDIDATE_REVIEW_UNAVAILABLE";
    const safeCode = typeof code === "string" && /^[A-Z_]{1,100}$/.test(code) ? code : "ZOTERO_CANDIDATE_REVIEW_UNAVAILABLE";
    return new NextResponse(`<!doctype html><html><meta charset="utf-8"><title>Zotero 权限检查未完成</title><h1>Zotero 权限检查未完成</h1><p>${safeCode}</p></html>`, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  }
}
