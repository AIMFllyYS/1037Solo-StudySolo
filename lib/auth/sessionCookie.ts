/** First-party cookie that mirrors the Supabase access token for the AI gate. */

/**
 * 唯一的写入名。`oauthServer.oauthCookies()` 写入的就是 `ss_access_token`，
 * 因此读取必须用同一个名字。
 *
 * 2026-09-28 修复：这里原本写成
 *   `process.env.SUPABASE_OAUTH_CLIENT_ID ? "ss_access_token" : "access_token"`
 * 于是当部署环境没有配置 SUPABASE_OAUTH_CLIENT_ID 时，读取会去找 `access_token`，
 * 而该 cookie 从来没有被写过（写入端硬编码 ss_ 前缀）。后果是：OAuth 回调成功、
 * 浏览器也拿到了 ss_access_token，但中间件与 AI 网关一律判定为未登录——
 * 现象就是「统一登录成功，回到应用仍是未登录」。
 * 而且 `nativeOAuthClientId()` 有硬编码兜底，所以 /start 仍然正常，
 * 使这个不一致很难从外部察觉。
 */
export const AUTH_ACCESS_COOKIE = "ss_access_token";

/**
 * 历史共享域 cookie 名。只读兜底，绝不写入：用于仍然依赖 Account 写在
 * `.1037solo.com` 上的共享 cookie 的过渡期部署。优先使用 AUTH_ACCESS_COOKIE。
 */
export const LEGACY_ACCESS_COOKIE = "access_token";

/** 读取时接受的 cookie 名，按优先级排列。 */
export const ACCESS_COOKIE_NAMES = [AUTH_ACCESS_COOKIE, LEGACY_ACCESS_COOKIE] as const;

const BEARER_RE = /^Bearer\s+(\S+)/i;

export function sessionAccessToken(session: unknown): string | null {
  if (!session || typeof session !== "object") return null;
  const token = (session as { access_token?: unknown }).access_token;
  return typeof token === "string" && token ? token : null;
}

export function serializeAccessTokenCookie(
  token: string,
  opts?: { maxAgeSec?: number; secure?: boolean },
): string {
  const maxAge = opts?.maxAgeSec ?? 3600;
  const parts = [
    `${AUTH_ACCESS_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (opts?.secure) parts.push("Secure");
  return parts.join("; ");
}

export function serializeClearedAccessTokenCookie(opts?: { secure?: boolean }): string {
  const parts = [
    `${AUTH_ACCESS_COOKIE}=`,
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (opts?.secure) parts.push("Secure");
  return parts.join("; ");
}

export function readAccessTokenFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  const found = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    if (!raw) continue;
    if (found.has(name)) continue;
    try {
      found.set(name, decodeURIComponent(raw));
    } catch {
      found.set(name, raw);
    }
  }
  for (const name of ACCESS_COOKIE_NAMES) {
    const value = found.get(name);
    if (value) return value;
  }
  return null;
}

export function extractAccessToken(headers: { get(name: string): string | null }): string | null {
  const bearer = headers.get("authorization")?.match(BEARER_RE)?.[1];
  if (bearer) return bearer;
  return readAccessTokenFromCookieHeader(headers.get("cookie"));
}

/** 该请求是否携带任一形态的访问 token cookie（中间件用）。 */
export function hasAccessTokenCookie(cookies: { has(name: string): boolean }): boolean {
  return ACCESS_COOKIE_NAMES.some((name) => cookies.has(name));
}

/** Compatibility no-op: only Account may write shared HttpOnly session cookies. */
export function applySessionCookie(_session: unknown): void { void _session; }
