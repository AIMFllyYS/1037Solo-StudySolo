/** Native ecosystem OAuth client. Mirrored to Platform/StudySolo by scripts/sync-mcp-clients.mjs. */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
type ClientId = "platform" | "studysolo";
const random = () => randomBytes(32).toString("base64url");
export function kitSoloBase() {
  const base = process.env.KITSOLO_URL || process.env.NEXT_PUBLIC_KITSOLO_URL || (process.env.NODE_ENV === "production" ? "https://kitsolo.1037solo.com" : "http://localhost:3038");
  const url = new URL(base);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("KitSolo URL must use HTTPS");
  if (url.username || url.password) throw new Error("KitSolo URL must not contain credentials");
  return url.origin;
}
function callback(origin: string) { return `${origin}/api/kitsolo/callback/`; }
function cookieName(client: ClientId) { return `kitsolo_oauth_${client}`; }
export function kitSoloConnect(request: NextRequest, client: ClientId) {
  const origin = request.nextUrl.origin;
  const state = random(), verifier = random();
  const url = new URL("/connect/authorize/", kitSoloBase());
  url.search = new URLSearchParams({ client_id: client, response_type: "code", redirect_uri: callback(origin), scope: "kitsolo:tools", resource: `${kitSoloBase()}/mcp/`, state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set(cookieName(client), JSON.stringify({ state, verifier }), { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/kitsolo/", maxAge: 600 });
  return response;
}
export function sameState(expected: unknown, actual: unknown) {
  if (typeof expected !== "string" || typeof actual !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(expected) || !/^[A-Za-z0-9_-]{43}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
export async function kitSoloCallback(request: NextRequest, client: ClientId) {
  let ok = false;
  try {
    const saved = JSON.parse(request.cookies.get(cookieName(client))?.value ?? "{}");
    if (!sameState(saved.state, request.nextUrl.searchParams.get("state")) || request.nextUrl.searchParams.has("error")) throw new Error("Invalid OAuth state");
    const code = request.nextUrl.searchParams.get("code");
    if (!code || !/^[A-Za-z0-9_-]{43}$/.test(code)) throw new Error("Invalid authorization code");
    const response = await fetch(`${kitSoloBase()}/api/mcp/token/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: client, redirect_uri: callback(request.nextUrl.origin), code, code_verifier: saved.verifier, resource: `${kitSoloBase()}/mcp/` }), cache: "no-store", signal: AbortSignal.timeout(12000) });
    // Native agents use the prior-consent exchange with verified Account UUID.
    // OAuth tokens are not exposed to JS, model history, localStorage or URLs.
    const tokens = await response.json();
    ok = response.ok && tokens.token_type === "Bearer" && typeof tokens.access_token === "string";
  } catch { /* A failure stays visible in the popup and can be retried. */ }
  const message = { type: "kitsolo:connected", ok };
  const script = `if(window.opener){window.opener.postMessage(${JSON.stringify(message)},${JSON.stringify(request.nextUrl.origin)});${ok ? "window.close();" : ""}}`;
  const hash = createHash("sha256").update(script).digest("base64");
  const response = new NextResponse(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KitSolo 工具关联</title><h1>${ok ? "KitSolo 已关联" : "关联未完成"}</h1><p>${ok ? "可以关闭此窗口，回到 AI 对话中使用工具。" : "授权取消、请求过期或服务暂时不可用。请关闭窗口，从安装入口重新发起。"}</p><script>${script}</script></html>`, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": `default-src 'none'; script-src 'sha256-${hash}'; frame-ancestors 'none'; base-uri 'none'` } });
  response.cookies.set(cookieName(client), "", { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/kitsolo/", maxAge: 0 });
  if (ok) response.cookies.set(`kitsolo_connected_${client}`, "1", { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  return response;
}
export async function kitSoloAccess(accountToken: string, client: ClientId): Promise<string | null> {
  try {
    const response = await fetch(`${kitSoloBase()}/api/mcp/access/`, { method: "POST", headers: { Authorization: `Bearer ${accountToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ client_id: client }), cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const result = await response.json();
    return typeof result.access_token === "string" ? result.access_token : null;
  } catch { return null; }
}
export async function kitSoloStatus(request: NextRequest, client: ClientId) {
  const accountToken = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] || request.cookies.get("access_token")?.value;
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };
  if (!accountToken) return NextResponse.json({ connected: false, reason: "sign_in_required" }, { headers });
  try {
    const response = await fetch(`${kitSoloBase()}/api/mcp/access/`, { method: "POST", headers: { Authorization: `Bearer ${accountToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ client_id: client }), cache: "no-store", signal: AbortSignal.timeout(5000) });
    const result = NextResponse.json({ connected: response.ok, reason: response.ok ? null : response.status === 403 ? "consent_required" : response.status === 401 ? "sign_in_required" : "unavailable" }, { headers });
    if (response.ok || [401, 403].includes(response.status)) result.cookies.set(`kitsolo_connected_${client}`, response.ok ? "1" : "", { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: response.ok ? 30 * 86400 : 0 });
    return result;
  } catch { return NextResponse.json({ connected: false, reason: "unavailable" }, { headers }); }
}
