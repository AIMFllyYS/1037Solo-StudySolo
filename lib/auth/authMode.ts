/**
 * 唯一的认证模式判定。
 *
 * 2026-09-28：此前 StudySolo 同时存在两套登录通道，并用
 * `nativeOAuthClientId()`（有硬编码兜底 `|| DEFAULT_PUBLIC_OAUTH_CLIENT_ID`，因此恒为真）
 * 隐式决定走哪条。结果是 `app/api/account/[operation]/route.ts` 永远进入 OAuth 分支，
 * 后面转发到 Account 共享会话的代码成了死代码；而 OAuth 分支只认 StudySolo 自己的
 * `ss_access_token`，共享 cookie 流程从不写它，于是 `/api/account/session` 返回 401，
 * 前端把刚登录成功的用户登出。同时 `sessionCookie.ts` 的读取名也依赖同一个环境变量，
 * 造成"AI 接口放行、界面显示未登录"的不一致。
 *
 * 现在所有消费方都必须通过本模块显式判定，不得再用"某个环境变量有没有值"隐式开关。
 */

export const ROOT_SITE_HOST = "1037solo.com";
export const CANONICAL_SITE_ORIGIN = "https://studysolo.1037solo.com";

/** 不在 1037solo.com 下、拿不到共享 cookie 的历史域名。 */
export const LEGACY_SITE_HOSTS = ["notebook1b.husteread.icu", "notebook2a.husteread.icu"] as const;

export type AuthMode =
  /** 第一方域名：身份唯一来源是 Account 写在 .1037solo.com 下的共享会话。 */
  | "account-shared"
  /** 历史域名：不再单独登录，一切登录相关入口 308 到正式域名。 */
  | "redirect-canonical"
  /** 本地开发：保留自签 OAuth 通道。 */
  | "oauth-native";

/** 去掉端口与大小写差异，只比较主机名。 */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

export function isFirstPartyHost(host: string): boolean {
  const h = normalizeHost(host);
  return h === ROOT_SITE_HOST || h.endsWith(`.${ROOT_SITE_HOST}`);
}

export function isLegacyHost(host: string): boolean {
  return (LEGACY_SITE_HOSTS as readonly string[]).includes(normalizeHost(host));
}

export function authModeForHost(host: string): AuthMode {
  const h = normalizeHost(host);
  if (isFirstPartyHost(h)) return "account-shared";
  if (isLegacyHost(h)) return "redirect-canonical";
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return "oauth-native";
  // 未知主机不猜测：按本地 OAuth 处理，绝不冒充第一方去读共享会话。
  return "oauth-native";
}

/** 服务端用：以浏览器实际访问的 Host 为准（反代下 Host 头比 nextUrl 更可靠）。 */
export function authModeForRequest(request: {
  headers: { get(name: string): string | null };
  nextUrl: { host: string };
}): AuthMode {
  return authModeForHost(request.headers.get("host") || request.nextUrl.host);
}

/** 旧域名请求应该被 308 到的正式地址。 */
export function canonicalUrlFor(pathname: string, search = ""): string {
  return new URL(`${pathname}${search}`, CANONICAL_SITE_ORIGIN).toString();
}
