import { NextResponse, type NextRequest } from "next/server";
import { requireDevelopment } from "@/lib/connectors/development-oauth.server";
import { connectorOwner, connectorFailure } from "@/lib/connectors/actor.server";
import { connectorOperations, readConnector } from "@/lib/connectors/service.server";
import { writeRecord } from "@/lib/connectors/persistence.server";
import type { ConnectorId } from "@/lib/connectors/registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Development acceptance runs the same server executor used by the Agent; reports no private payloads. */
export async function GET(request: NextRequest) {
  try {
    requireDevelopment(request); const owner = await connectorOwner(request), checks: Record<string, unknown> = {};
    const cases: { provider: ConnectorId; operation: string; args: Record<string, unknown> }[] = [
      { provider: "google", operation: "drive_search", args: { query: "StudySolo", limit: 1 } },
      { provider: "google", operation: "calendar_list_events", args: { timeMin: new Date().toISOString(), timeMax: new Date(Date.now() + 604800000).toISOString(), limit: 1 } },
      { provider: "google", operation: "gmail_search", args: { query: "in:inbox", limit: 1 } },
      { provider: "zotero", operation: "zotero_collections", args: { limit: 1 } },
      { provider: "pubmed", operation: "pubmed_search", args: { query: "learning", limit: 1 } },
      { provider: "crossref", operation: "crossref_read", args: { doi: "10.1038/nphys1170" } },
    ];
    for (const provider of ["notion", "todoist", "github"] as const) {
      try {
        const operations = await connectorOperations(owner, provider, request.signal);
        checks[`${provider}:discovery`] = { ok: operations.length > 0, enabledOperations: operations.map(item => ({ name: item.name, write: item.write })) };
        const name = provider === "notion" ? "notion-get-tool-access" : provider === "todoist" ? "find-projects" : "search_repositories";
        const operation = operations.find(item => item.name === name);
        if (operation) {
          const properties = operation.inputSchema.properties as Record<string, unknown> | undefined;
          const args: Record<string, unknown> = provider === "github" ? { query: "user:AIMFllyYS" } : {};
          if (properties?.limit) args.limit = 1;
          if (properties?.perPage) args.perPage = 1;
          if (properties?.per_page) args.per_page = 1;
          cases.unshift({ provider, operation: name, args });
        }
      } catch { checks[`${provider}:discovery`] = { ok: false, code: "DISCOVERY_UNAVAILABLE" }; }
    }
    for (const item of cases) {
      try { const result = await readConnector(owner, item.provider, item.operation, item.args, request.signal); checks[`${item.provider}:${item.operation}`] = { ok: !result.error, ...(result.error ? { code: result.error } : {}), sourceCount: result.sourceUrls?.length ?? 0, contentPayloadStoredInReport: false }; }
      catch (error) { checks[`${item.provider}:${item.operation}`] = { ok: false, code: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "READ_UNAVAILABLE" }; }
    }
    const result = { observedAtUtc: new Date().toISOString(), stage: "native-connector-executor-read-acceptance", checks, externalContentWritten: false, privateContentStoredInReport: false };
    await writeRecord(`acceptance:${owner}:native`, result);
    return new NextResponse(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>学习连接器执行验收</title><h1>学习连接器执行验收</h1><pre>${JSON.stringify(result, null, 2).replace(/</g, "&lt;")}</pre></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" } });
  } catch (error) { return connectorFailure(error); }
}
