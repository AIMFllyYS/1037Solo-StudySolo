import {hasAccessTokenCookie} from "@/lib/auth/sessionCookie";
import {canonicalUrlFor,isLegacyHost,authModeForRequest,accountBackendUrl} from "@/lib/auth/authMode";
import { renewIfNeeded, downstreamHeaders, forwardCookies, isOutage, type RenewalResult } from "@/lib/auth/sign-in/session-refresh";
import { NextResponse, type NextRequest } from "next/server";
import { decideAiGate, TRUSTED_PROXY_USER_HEADER } from "@/lib/auth/aiGate";

/**
 * Next.js 16 request gate (formerly middleware.ts).
 * Blocks anonymous calls to paid AI routes. No desktop / BYOK bypass.
 * Matcher must be a compile-time literal — Next cannot parse spreads or imports.
 *
 * Matcher 覆盖整个 /api：TRUSTED_PROXY_USER_HEADER 是「proxy 已验过签」的内部
 * 信号，必须对每条 API 请求都先剥掉客户端自报值——否则 quota / redeem / share /
 * profile 这类不在付费名单上的路由会把伪造的 user-id 当成可信身份。
 *
 * 另加 /login：历史域名不在 1037solo.com 下、拿不到 Account 的共享会话 cookie，
 * 因此不再提供独立登录入口，统一 308 到正式域名。
 */
export const config = {
  matcher: ["/api/:path*", "/login"],
};

export async function proxy(request: NextRequest) {
  // 历史域名：/login 与全部 /api/account/* 一律 308 到正式域名同路径（保留查询串）。
  // 这同时关闭了旧域名上的自签 OAuth 通道——它的 state cookie 写在旧域名、回调却落在
  // 正式域名，第一次必然 invalid_state。
  if (isLegacyHost(request.headers.get("host") || request.nextUrl.host)) {
    const pathname = request.nextUrl.pathname;
    if (pathname === "/login" || pathname.startsWith("/api/account/")) {
      return NextResponse.redirect(canonicalUrlFor(pathname, request.nextUrl.search), 308);
    }
  }
  // Authenticated cookie mutations require the actual browser origin. Explicit
  // Bearer APIs are non-ambient; the backend still validates their token.
  // 2026-09-28：改用 hasAccessTokenCookie，同时接受 ss_access_token（当前写入名）
  // 与历史共享域 access_token。原先只看 AUTH_ACCESS_COOKIE，而该常量曾依赖
  // SUPABASE_OAUTH_CLIENT_ID，导致与写入端不一致、每个请求都被判为未登录。
  if (!["GET","HEAD","OPTIONS"].includes(request.method) && hasAccessTokenCookie(request.cookies) && !request.headers.get("authorization")) {
    const origin=request.headers.get("origin");
    const configured=new Set((process.env.APP_ALLOWED_ORIGINS || process.env.NEXT_PUBLIC_APP_URL || "https://notebook1b.husteread.icu,https://study.1037solo.com").split(",").map(v=>v.trim()).filter(Boolean));
    configured.add("https://studysolo.1037solo.com");
    if(process.env.NODE_ENV!=="production"){configured.add("http://localhost:35349");configured.add("http://127.0.0.1:35349");}
    if(!origin || !configured.has(origin))return NextResponse.json({error:"Trusted request origin required"},{status:403});
  }
  let renewal: RenewalResult | null = null;
  const mode = authModeForRequest(request);
  if ((request.nextUrl.pathname.startsWith("/api/connectors") || request.nextUrl.pathname.startsWith("/api/agent/") || request.nextUrl.pathname === "/api/chat") && ["account-local", "account-shared"].includes(mode) && !request.headers.get("authorization")) {
    renewal = await renewIfNeeded({ accountBackendUrl: accountBackendUrl(mode), cookieHeader: request.headers.get("cookie") ?? "", origin: request.nextUrl.origin, forwardedFor: request.headers.get("x-forwarded-for"), pathname: request.nextUrl.pathname });
    if (isOutage(renewal)) return NextResponse.json({ code: "ACCOUNT_UNAVAILABLE" }, { status: 503, headers: { "Retry-After": "5" } });
  }
  const incoming = downstreamHeaders(request.headers, renewal) ?? request.headers;
  const decision = await decideAiGate({
    pathname: request.nextUrl.pathname,
    method: request.method,
    headers: incoming,
  });
  if (decision.action === "next") {
    const headers = new Headers(incoming);
    headers.delete(TRUSTED_PROXY_USER_HEADER);
    if (decision.userId) headers.set(TRUSTED_PROXY_USER_HEADER, decision.userId);
    return forwardCookies(NextResponse.next({ request: { headers } }), renewal);
  }
  return forwardCookies(NextResponse.json(decision.body, {
    status: decision.status,
    headers: decision.headers,
  }), renewal);
}

export default proxy;
