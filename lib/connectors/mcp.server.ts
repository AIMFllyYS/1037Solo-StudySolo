import { Client, StreamableHTTPClientTransport, type CallToolResult } from "@modelcontextprotocol/client";
import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020";
import Ajv2019 from "ajv/dist/2019";
import { activeGrant } from "./connections.server";
import { CONNECTOR_REGISTRY, type ConnectorOperation } from "./registry";
import { ConnectorError } from "./actor.server";
import { secretFreeArguments } from "./http.server";

type McpProvider = "notion" | "todoist" | "github";
/** Provider-specific reviewed policy; annotations and tool name heuristics grant no authority. */
export const MCP_TOOL_POLICY: Record<McpProvider, { read: readonly string[]; write: readonly string[] }> = {
  notion: { read: ["notion-search", "notion-fetch", "notion-get-tool-access", "notion-get-users", "notion-get-user", "notion-get-comments", "notion-query-data-sources", "notion-list-data-sources", "notion-list-database-templates"], write: ["notion-create-pages", "notion-update-page"] },
  todoist: { read: ["find-tasks", "find-projects", "find-sections", "find-comments", "find-completed-tasks", "get-task", "get-project", "get-productivity-stats", "get-overview", "get-user-info"], write: ["add-tasks", "update-tasks", "complete-tasks"] },
  github: { read: ["get_file_contents", "search_repositories", "search_code", "search_issues", "search_pull_requests", "list_issues", "issue_read", "pull_request_read", "list_pull_requests", "list_commits", "get_commit", "list_branches", "get_me"], write: [] },
};
export function allowedMcpTool(provider: McpProvider, name: string, write: boolean) { return MCP_TOOL_POLICY[provider][write ? "write" : "read"].includes(name); }
function safeSchema(value: unknown, depth = 0): unknown {
  // Never silently remove validation constraints, enum members or property names.
  // Tool descriptions are replaced separately; schema annotations grant no authority.
  if (depth > 40) throw new ConnectorError("PROVIDER_SCHEMA_UNSUPPORTED", 502);
  if (Array.isArray(value)) return value.map(item => safeSchema(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safeSchema(item, depth + 1)]));
  return value;
}
export function validateArguments(schema: Record<string, unknown>, args: Record<string, unknown>) {
  if (JSON.stringify(args).length > 32000 || !secretFreeArguments(args)) throw new ConnectorError("INVALID_ARGUMENTS");
  try {
    if (JSON.stringify(schema).length > 128000) throw new ConnectorError("PROVIDER_SCHEMA_UNSUPPORTED", 502);
    const dialect = schema.$schema;
    const Validator = dialect === "https://json-schema.org/draft/2020-12/schema" ? Ajv2020 : dialect === "https://json-schema.org/draft/2019-09/schema" ? Ajv2019 : Ajv;
    if (!new Validator({ strict: false, allErrors: false, validateFormats: false }).compile(schema)(args)) throw new ConnectorError("INVALID_ARGUMENTS");
  }
  catch (error) { if (error instanceof ConnectorError) throw error; throw new ConnectorError("PROVIDER_SCHEMA_UNSUPPORTED", 502); }
}
async function withMcp<T>(owner: string, provider: McpProvider, signal: AbortSignal | undefined, work: (client: Client) => Promise<T>): Promise<T> {
  const grant = await activeGrant(owner, provider, signal), endpoint = CONNECTOR_REGISTRY[provider].endpoint;
  if (provider !== "github" && grant.resource !== endpoint) throw new ConnectorError("CONNECTION_RESOURCE_MISMATCH", 403);
  const requestSignal = AbortSignal.any([AbortSignal.timeout(45000), ...(signal ? [signal] : [])]);
  let cleaning = false;
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    authProvider: { token: async () => grant.accessToken },
    requestInit: { redirect: "error", ...(provider === "github" ? { headers: { "X-MCP-Readonly": "true", "X-MCP-Toolsets": "repos,issues,pull_requests" } } : {}) },
    fetch: async (input, init) => {
      const requested = new URL(typeof input === "string" ? input : input.href);
      if (requested.origin !== new URL(endpoint).origin || requested.pathname !== new URL(endpoint).pathname) throw new ConnectorError("UNTRUSTED_PROVIDER_URL", 403);
      const response = await fetch(input, { ...init, redirect: "error", signal: cleaning ? AbortSignal.timeout(5000) : AbortSignal.any([requestSignal, ...(init?.signal ? [init.signal] : [])]) });
      if (!response.body) return response;
      let bytes = 0;
      const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { bytes += chunk.byteLength; if (bytes > 2097152) throw new ConnectorError("PROVIDER_RESPONSE_TOO_LARGE", 502); controller.enqueue(chunk); } }));
      return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
    },
  });
  const client = new Client({ name: "StudySolo learning connectors", version: "1.0.0" }, { capabilities: {} });
  try { await client.connect(transport, { signal: requestSignal, timeout: 20000 }); return await work(client); }
  finally { cleaning = true; await transport.terminateSession().catch(() => {}); await client.close().catch(() => {}); }
}
export async function discoverMcp(owner: string, provider: McpProvider, signal?: AbortSignal): Promise<ConnectorOperation[]> {
  return withMcp(owner, provider, signal, async client => {
    const result: ConnectorOperation[] = []; let cursor: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 8; page++) {
      const listing = await client.listTools(cursor ? { cursor } : {}, { signal, timeout: 15000 });
      for (const item of listing.tools) {
        const write = allowedMcpTool(provider, item.name, true);
        if (!write && !allowedMcpTool(provider, item.name, false)) continue;
        if (result.some(existing => existing.name === item.name)) continue;
        result.push({ name: item.name, description: `${CONNECTOR_REGISTRY[provider].name}: ${item.name}`, write, inputSchema: safeSchema(item.inputSchema) as Record<string, unknown> });
      }
      cursor = listing.nextCursor; if (!cursor) return result;
      if (seen.has(cursor)) throw new ConnectorError("PROVIDER_PAGINATION_INVALID", 502); seen.add(cursor);
    }
    throw new ConnectorError("PROVIDER_TOOL_LIST_TOO_LARGE", 502);
  });
}
export async function callMcp(owner: string, provider: McpProvider, operation: string, args: Record<string, unknown>, write: boolean, signal?: AbortSignal): Promise<CallToolResult> {
  if (!allowedMcpTool(provider, operation, write)) throw new ConnectorError("OPERATION_NOT_ALLOWED", 403);
  const descriptor = (await discoverMcp(owner, provider, signal)).find(item => item.name === operation && item.write === write);
  if (!descriptor) throw new ConnectorError("OPERATION_UNAVAILABLE", 403);
  validateArguments(descriptor.inputSchema, args);
  return withMcp(owner, provider, signal, client => client.callTool({ name: operation, arguments: args }, { signal, timeout: 25000 }));
}
