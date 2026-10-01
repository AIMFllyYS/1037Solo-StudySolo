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

/**
 * 本机开发时的统一账号（RootSolo 本地启动面板：前端 3040、后端 3041）。
 * 浏览器必须去 localhost:3040——本机 Account 的登录态写在 localhost 上，
 * 线上 Account 的写在 .1037solo.com，本机页面读不到。
 * 后端用 127.0.0.1：uvicorn 只绑 IPv4，localhost 在 Windows 上可能先解析成 ::1。
 */
export const LOCAL_ACCOUNT_URL = "http://localhost:3040";
export const LOCAL_ACCOUNT_BACKEND_URL = "http://127.0.0.1:3041";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type AuthMode =
  /** 第一方域名：身份唯一来源是 Account 写在 .1037solo.com 下的共享会话。 */
  | "account-shared"
  /** 本机开发：与线上同一套共享会话，只是 Account 跑在本机（LOCAL_ACCOUNT_URL）。 */
  | "account-local"
  /** 历史域名：不再单独登录，一切登录相关入口 308 到正式域名。 */
  | "redirect-canonical"
  /** 生产构建里的 localhost 与未知主机：保留自签 OAuth 通道。 */
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

/**
 * 本机开发主机。只在非生产构建下成立：生产构建里 localhost 仍按未知主机处理，
 * 线上行为不因此改变。
 */
export function isLocalDevHost(host: string, nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv !== "production" && LOCAL_HOSTNAMES.has(normalizeHost(host));
}

/** 地址是否指向本机（用来拒绝"本机开发却配置了线上 Account"）。 */
export function isLocalUrl(value: string): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function authModeForHost(host: string, nodeEnv = process.env.NODE_ENV): AuthMode {
  const h = normalizeHost(host);
  if (isFirstPartyHost(h)) return "account-shared";
  if (isLegacyHost(h)) return "redirect-canonical";
  if (isLocalDevHost(h, nodeEnv)) return "account-local";
  // 未知主机不猜测：按自签 OAuth 处理，绝不冒充第一方去读共享会话。
  return "oauth-native";
}

/**
 * 服务端转发共享会话用的 Account 后端地址。
 * - 线上只认 ACCOUNT_BACKEND_URL；未配置返回空串，由调用方明确报 503。
 * - 本机开发未配置时用本机后端；配置成线上地址也改用本机——本机 Account 的
 *   cookie 送到线上后端既验不过、Origin 也会被拒，只会得到难以定位的 401/403。
 */
export function accountBackendUrl(mode: AuthMode, configured = process.env.ACCOUNT_BACKEND_URL): string {
  const base = (configured || "").trim().replace(/\/$/, "");
  if (mode !== "account-local") return base;
  return base && isLocalUrl(base) ? base : LOCAL_ACCOUNT_BACKEND_URL;
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
