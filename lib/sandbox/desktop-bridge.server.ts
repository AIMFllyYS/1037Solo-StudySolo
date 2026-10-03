import type { NextRequest } from "next/server";
import { extractAccessToken } from "@/lib/auth/sessionCookie";
import { SandboxError } from "./config.server";
import { desktopModelRequest } from "./desktop-model.server";

const cloudOrigin = "https://studysolo.1037solo.com";
const maximumBytes = 20 * 1024 * 1024;
/** Electron injects this flag into its local server, never the renderer. */
export function desktopCloudBridgeEnabled() { return process.env.STUDYSOLO_DESKTOP_RUNTIME === "true" && process.env.NODE_ENV === "production"; }
function validateDesktopRequest(request: NextRequest, agentSurfaceOnly: boolean) {
  if (!desktopCloudBridgeEnabled() || !["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname) || request.nextUrl.port !== "35349") throw new SandboxError("DESKTOP_AGENT_BRIDGE_REJECTED", 403);
  // NextURL normalizes 127.0.0.1 to localhost. Match the browser's actual Host,
  // otherwise the packaged Electron origin is incorrectly rejected.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\]):35349$/i.test(host)) throw new SandboxError("DESKTOP_AGENT_BRIDGE_REJECTED", 403);
  const origin = `http://${host.toLowerCase()}`;
  if (request.method !== "GET" && request.headers.get("origin") !== origin) throw new SandboxError("SANDBOX_ORIGIN_REJECTED", 403);
  let referer: URL;
  try { referer = new URL(request.headers.get("referer") ?? ""); } catch { throw new SandboxError("AGENT_SURFACE_REQUIRED", 403); }
  if (referer.origin !== origin || (agentSurfaceOnly && !/^\/(?:agent(?:\/plugins(?:\/(?:mcp|skills)\/[a-z0-9-]+)?)?|c\/[A-Za-z0-9_.:-]{1,100})\/?$/.test(referer.pathname))) throw new SandboxError("AGENT_SURFACE_REQUIRED", 403);
  return referer.pathname;
}
export function validateDesktopAgentRequest(request: NextRequest) { return validateDesktopRequest(request, true); }
/** Fixed destination, Account token only. Cloud/MCP operator keys stay on the website. */
export async function forwardDesktopAgentRequest(request: NextRequest): Promise<Response> {
  const targetPath = request.nextUrl.pathname.replace(/\/$/, "");
  // Feedback is available throughout the product. This exception authorizes only
  // its exact endpoint; command and connector routes still require the Agent UI.
  const feedbackRoute = targetPath === "/api/feedback/chat" && request.method === "POST";
  const pathname = validateDesktopRequest(request, !feedbackRoute);
  const agentRoute = /^\/api\/agent\/(?:chat|skills|sandbox(?:\/artifacts\/[a-f0-9-]{36})?)$/.test(targetPath);
  const connectorRoute = /^\/api\/connectors(?:\/inspect|\/actions\/[a-f0-9-]{36}(?:\/(?:confirm|cancel))?|\/(?:notion|todoist|google|github|zotero)\/disconnect)?$/.test(targetPath);
  if (!agentRoute && !connectorRoute && !feedbackRoute) throw new SandboxError("DESKTOP_AGENT_BRIDGE_REJECTED", 403);
  const token = extractAccessToken(request.headers);
  if (!token) throw new SandboxError("SIGN_IN_REQUIRED", 401);
  const headers = new Headers({ Authorization: `Bearer ${token}`, Origin: cloudOrigin, Referer: cloudOrigin + pathname });
  const key = request.headers.get("idempotency-key");
  if (key && /^[A-Za-z0-9_-]{1,128}$/.test(key)) headers.set("Idempotency-Key", key);
  let body: string | undefined;
  if (request.method !== "GET") {
    body = await request.text();
    if (Buffer.byteLength(body) > (feedbackRoute ? 8192 : 800 * 1024)) throw new SandboxError("SANDBOX_REQUEST_TOO_LARGE", 413);
    if (targetPath === "/api/agent/chat") {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(body); } catch { throw new SandboxError("SANDBOX_REQUEST_INVALID"); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SandboxError("SANDBOX_REQUEST_INVALID");
      body = JSON.stringify(desktopModelRequest(parsed));
    }
    headers.set("Content-Type", "application/json");
  }
  const target = new URL(targetPath + "/", cloudOrigin);
  if (targetPath.includes("/artifacts/")) {
    const conversation = request.nextUrl.searchParams.get("conversation");
    if (!conversation || !/^[A-Za-z0-9_.:-]{1,100}$/.test(conversation)) throw new SandboxError("SANDBOX_CONVERSATION_REQUIRED");
    target.searchParams.set("conversation", conversation);
  }
  const response = await fetch(target, { method: request.method, headers, body, redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(15 * 60 * 1000)]), cache: "no-store" });
  const outgoing = new Headers({ "Cache-Control": "private, no-store", Vary: "Cookie, Authorization", "X-Content-Type-Options": "nosniff" });
  for (const name of ["content-type", "content-disposition", "content-security-policy", "x-vercel-ai-ui-message-stream", "retry-after"]) {
    const value = response.headers.get(name); if (value) outgoing.set(name, value);
  }
  let bytes = 0;
  const stream = response.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { bytes += chunk.byteLength; if (bytes > maximumBytes) throw new SandboxError("SANDBOX_RESPONSE_TOO_LARGE", 502); controller.enqueue(chunk); } }));
  return new Response(stream ?? null, { status: response.status, headers: outgoing });
}
export function desktopConnectorAuthorizationPage(request: NextRequest, provider: string) {
  validateDesktopAgentRequest(request);
  if (!["notion", "todoist", "google", "github", "zotero"].includes(provider)) throw new SandboxError("PROVIDER_NOT_SUPPORTED", 404);
  // Authorization happens on the same origin as the callback and grant vault.
  return Response.redirect(`${cloudOrigin}/agent/plugins/mcp/${provider}`, 303);
}
