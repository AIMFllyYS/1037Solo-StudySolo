/** Authenticated metadata acceptance only. Never calls a content tool. */
import { NextResponse, type NextRequest } from "next/server";
import { requireDevelopment, ownerOf, type DevelopmentGrant } from "./development-oauth.server";
import { readRecord, writeRecord } from "./development-vault.server";
import { GOOGLE_CONNECTOR_SCOPES } from "./config.server";

export async function readRpcResponse(response: Response, expectedId: number): Promise<Record<string, unknown>> {
  if (!response.ok || !response.body) throw new Error("mcp_metadata_unavailable");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let raw = "", bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (!chunk.done) { bytes += chunk.value.byteLength; raw += decoder.decode(chunk.value, { stream: true }); }
      if (bytes > 524288) throw new Error("mcp_metadata_too_large");
      const candidates = response.headers.get("content-type")?.includes("text/event-stream")
        ? raw.split(/\r?\n\r?\n/).slice(0, -1).map(frame => frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n"))
        : [raw];
      for (const candidate of candidates) {
        let data: Record<string, unknown>;
        try { data = JSON.parse(candidate); } catch { continue; }
        if (data.id !== expectedId || data.jsonrpc !== "2.0") continue;
        if (data.error || !data.result || typeof data.result !== "object") throw new Error("mcp_metadata_rejected");
        return data.result as Record<string, unknown>;
      }
      if (chunk.done) throw new Error("mcp_metadata_missing");
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function inspectMcp(provider: "notion" | "todoist" | "github", grant: DevelopmentGrant) {
  const endpoint = provider === "notion" ? "https://mcp.notion.com/mcp" : provider === "todoist" ? "https://ai.todoist.net/mcp" : "https://api.githubcopilot.com/mcp/";
  if (grant.provider !== provider || grant.expiresAt !== null && grant.expiresAt <= Date.now()) throw new Error("expired_grant");
  if (provider !== "github" && grant.resource !== endpoint) throw new Error("grant_resource_mismatch");
  let session: string | null = null, protocol = "2025-11-25";
  const post = (body: unknown) => fetch(endpoint, {
    method: "POST", headers: { Authorization: `Bearer ${grant.accessToken}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": protocol, ...(session ? { "MCP-Session-Id": session } : {}), ...(provider === "github" ? { "X-MCP-Readonly": "true", "X-MCP-Toolsets": "repos,issues,pull_requests" } : {}) },
    body: JSON.stringify(body), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  try {
    const initialization = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: protocol, capabilities: {}, clientInfo: { name: "StudySolo development acceptance", version: "0.5.1" } } });
    session = initialization.headers.get("mcp-session-id");
    const initialized = await readRpcResponse(initialization, 1);
    if (typeof initialized.protocolVersion !== "string" || !["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"].includes(initialized.protocolVersion)) throw new Error("mcp_protocol_missing");
    protocol = initialized.protocolVersion;
    const notification = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    const notified = notification.ok; await notification.body?.cancel();
    if (!notified) throw new Error("mcp_initialize_notification_rejected");
    const listing = await readRpcResponse(await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }), 2);
    if (!Array.isArray(listing.tools)) throw new Error("mcp_tools_missing");
    return { authenticatedMcpVerified: true, protocol, toolCount: listing.tools.length, moreTools: typeof listing.nextCursor === "string", userContentRead: false, toolCalled: false, nativeAgentIntegrated: false };
  } finally {
    if (session) {
      const response = await fetch(endpoint, { method: "DELETE", headers: { Authorization: `Bearer ${grant.accessToken}`, "MCP-Session-Id": session, "MCP-Protocol-Version": protocol }, redirect: "error", signal: AbortSignal.timeout(5000) }).catch(() => null);
      await response?.body?.cancel();
    }
  }
}

export async function developmentDiscovery(request: NextRequest) {
  try {
    requireDevelopment(request);
    const owner = await ownerOf(request);
    const providers: Record<string, unknown> = {};
    // Sequential to keep this local acceptance from adding avoidable memory/network pressure.
    for (const provider of ["notion", "todoist", "github"] as const) {
      const grant = await readRecord<DevelopmentGrant>(`grant:${owner}:${provider}`);
      if (!grant) { providers[provider] = { authenticatedMcpVerified: false, reason: "authorization_required" }; continue; }
      try { providers[provider] = await inspectMcp(provider, grant); }
      catch { providers[provider] = { authenticatedMcpVerified: false, reason: "metadata_acceptance_unavailable", nativeAgentIntegrated: false }; }
    }
    const google = await readRecord<DevelopmentGrant>(`grant:${owner}:google`);
    if (google && (google.expiresAt === null || google.expiresAt > Date.now())) {
      const granted = new Set(google.scope.split(/\s+/));
      const checks: Record<string, number | null> = {};
      for (const [name, url] of [["driveAboutMetadata", "https://www.googleapis.com/drive/v3/about?fields=kind"], ["calendarPublicColors", "https://www.googleapis.com/calendar/v3/colors"]]) {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${google.accessToken}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) }).catch(() => null);
        checks[name] = response?.status ?? null; await response?.body?.cancel();
      }
      providers.google = { authenticatedApiMetadataVerified: Object.values(checks).every(status => status === 200), allApprovedScopesGranted: GOOGLE_CONNECTOR_SCOPES.every(scope => granted.has(scope)), checks, workspacePreviewMcpEnabled: false, userContentRead: false, nativeAgentIntegrated: false };
    }
    const result = { observedAtUtc: new Date().toISOString(), providers, userContentRead: false, externalContentWritten: false, stage: "authenticated_metadata_acceptance" };
    await writeRecord(`acceptance:${owner}:mcp`, result);
    return new NextResponse(`<!doctype html><html><meta charset="utf-8"><title>MCP 开发认证检查</title><h1>MCP 开发认证检查</h1><pre>${JSON.stringify(result, null, 2)}</pre></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" } });
  } catch { return NextResponse.json({ code: "DEVELOPMENT_ACCEPTANCE_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
