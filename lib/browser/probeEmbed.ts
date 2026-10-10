import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { checkCustomBaseUrl } from "@/lib/ai/endpoints/customBaseUrl";
import { BlockedProbeNetworkError, fetchProbeHeaders, resolveProbeAddresses, type ProbeHeadersResponse, type ProbeResolver } from "./probeNetwork.server";



export const MAX_PROBE_REDIRECTS = 5;

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const PROBE_OK = new Set([200, 204, 206, 301, 302, 303, 304, 307, 308]);
const PROBE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*",
};

export type ProbeUrlGuard =
  | { ok: true; url: URL }
  | { ok: false; reason: "bad-url" | "non-http" | "blocked-private" };

/**
 * 可嵌入预检：抓取目标站点的响应头，判断它是否允许被本应用的 iframe 内嵌
 * （仅检测「墙 A」：X-Frame-Options / CSP frame-ancestors —— 这类是可靠可探测的）。
 *
 * 注意：Cloudflare/Turnstile 这类「墙 B」人机挑战无法靠响应头可靠预判
 * （Cloudflare 覆盖极广且多数并不挑战），故不据此阻断；保留前端「在新标签打开」兜底。
 */
function originMatchesToken(origin: string, token: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (token === "https:" && parsed.protocol === "https:") return true;
  if (token === "http:" && parsed.protocol === "http:") return true;
  const host = parsed.host.toLowerCase();
  const originToken = parsed.origin.toLowerCase();
  return token === originToken || token === `https://${host}` || token === `http://${host}` || token === host;
}

export function judge(headers: Headers, origin?: string): { embeddable: boolean; reason?: string } {
  const xfo = headers.get("x-frame-options");
  if (xfo) {
    const v = xfo.toLowerCase();
    if (v.includes("deny")) return { embeddable: false, reason: "X-Frame-Options: DENY" };
    if (v.includes("sameorigin")) return { embeddable: false, reason: "X-Frame-Options: SAMEORIGIN" };
    if (v.includes("allow-from")) {
      if (origin && originMatchesToken(origin, v.replace(/allow-from/i, "").trim())) {
        return { embeddable: true };
      }
      return { embeddable: false, reason: "X-Frame-Options: ALLOW-FROM" };
    }
  }
  const csp = headers.get("content-security-policy");
  if (csp) {
    const m = csp.match(/frame-ancestors([^;]*)/i);
    if (m) {
      const tokens = m[1].trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (tokens.includes("'none'")) return { embeddable: false, reason: "CSP frame-ancestors 'none'" };
      if (tokens.includes("*")) return { embeddable: true };
      if (origin && tokens.some((token) => originMatchesToken(origin, token))) {
        return { embeddable: true };
      }
      return { embeddable: false, reason: "CSP frame-ancestors " + m[1].trim() };
    }
  }
  return { embeddable: true };
}

/** 复用 #58 字面主机校验：只允许 http(s)，拒绝回环与私网。 */
export function guardProbeUrl(raw: string): ProbeUrlGuard {
  const check = checkCustomBaseUrl(raw);
  if (check.ok) {
    const url = new URL(check.url);
    if (url.username || url.password) return { ok: false, reason: "bad-url" };
    return { ok: true, url };
  }
  if (check.reason === "private") return { ok: false, reason: "blocked-private" };
  if (check.reason === "protocol") return { ok: false, reason: "non-http" };
  return { ok: false, reason: "bad-url" };
}

function blockedJson(reason: "blocked-private" | "blocked-redirect" | "blocked-probe-network") {
  return NextResponse.json({ embeddable: false, reason });
}

/** Injectable DNS only for trusted server tests; request data cannot replace it. */
export function createProbeHandler(resolver: ProbeResolver = resolveProbeAddresses) {
return async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return NextResponse.json({ embeddable: true, reason: "no-url" });

  const first = guardProbeUrl(url);
  if (!first.ok) {
    if (first.reason === "blocked-private") return blockedJson("blocked-private");
    return NextResponse.json({ embeddable: true, reason: first.reason });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    let current = first.url;
    let res: ProbeHeadersResponse | undefined;

    for (let hops = 0; hops <= MAX_PROBE_REDIRECTS; hops++) {
      res = await fetchProbeHeaders(current, ctrl.signal, PROBE_HEADERS, resolver);

      if (!REDIRECT_STATUS.has(res.status)) break;
      const location = res.headers.get("location");
      if (!location) break;
      if (hops === MAX_PROBE_REDIRECTS) {
        return NextResponse.json({
          embeddable: true,
          reason: "probe-failed",
          error: "too-many-redirects",
        });
      }

      let nextRaw: string;
      try {
        nextRaw = new URL(location, current).toString();
      } catch {
        return blockedJson("blocked-redirect");
      }

      const next = guardProbeUrl(nextRaw);
      if (!next.ok) {
        return blockedJson(next.reason === "blocked-private" ? "blocked-private" : "blocked-redirect");
      }
      current = next.url;
    }

    if (!res) throw new Error("no-response");

    // 403/429/503 对人机挑战探测不可靠：允许前端尝试内嵌，空白则由 iframe watchdog / 兜底面板处理。
    if (!PROBE_OK.has(res.status)) {
      return NextResponse.json({
        embeddable: true,
        reason: `HTTP ${res.status}（探测不确定）`,
        status: res.status,
        finalUrl: current.toString(),
      });
    }

    const origin = req.headers.get("origin") || req.nextUrl?.origin;
    const verdict = judge(res.headers, origin);
    return NextResponse.json({ ...verdict, status: res.status, finalUrl: current.toString() });
  } catch (e) {
    if (e instanceof BlockedProbeNetworkError) return blockedJson("blocked-probe-network");
    // 抓取失败（网络/被服务端拦截）→ 不武断阻断，允许前端尝试内嵌
    return NextResponse.json({
      embeddable: true,
      reason: "probe-failed",
      error: "network-unavailable",
    });
  } finally {
    clearTimeout(timer);
  }
};
}

export const GET = createProbeHandler();
