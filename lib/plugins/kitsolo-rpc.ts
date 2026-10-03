/** Mirrored native client. Only calls the configured KitSolo server. */
export type KitSoloInput = { action: "search" | "open" | "call"; query?: string; id?: string; name?: string; arguments?: Record<string, unknown> };
export type KitSoloOutput = { text: string; data?: Record<string, unknown>; error?: string };
export const kitSoloInputSchema = {
  type: "object" as const, properties: {
    action: { type: "string" as const, enum: ["search", "open", "call"] },
    query: { type: "string" as const, maxLength: 200 }, id: { type: "string" as const, maxLength: 50 },
    name: { type: "string" as const, maxLength: 100, description: "检索返回的 mcpName。仅在 action=call 时使用" },
    arguments: { type: "object" as const, description: "严格遵循检索结果中该工具的 inputSchema" },
  }, required: ["action"], additionalProperties: false,
};
export async function callKitSolo(base: string, accessToken: string, input: KitSoloInput, signal?: AbortSignal): Promise<KitSoloOutput> {
  if (!input || !["search", "open", "call"].includes(input.action)) return { text: "无效操作", error: "invalid_action" };
  const name = input.action === "search" ? "kitsolo_search" : input.action === "open" ? "kitsolo_open" : input.name;
  if (!name || !/^kitsolo_[a-z0-9_]{1,90}$/.test(name)) return { text: "请先检索并使用返回的 mcpName", error: "invalid_name" };
  const args = input.action === "search" ? { query: input.query ?? "", limit: 8 } : input.action === "open" ? { id: input.id ?? "" } : input.arguments ?? {};
  try {
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" };
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000);
    const initId = crypto.randomUUID();
    const initialized = await fetch(`${base}/mcp/`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: initId, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "studysolo", version: "1.0.0" } } }), cache: "no-store", signal: requestSignal });
    if (!initialized.ok) return { text: initialized.status === 401 || initialized.status === 403 ? "KitSolo 关联已失效，请重新关联。" : "KitSolo 暂时不可用，请稍后重试。", error: `http_${initialized.status}` };
    const initialization = await initialized.json();
    if (initialization.id !== initId || initialization.result?.protocolVersion !== "2025-11-25") throw new Error("Invalid MCP initialization");
    const notification = await fetch(`${base}/mcp/`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), cache: "no-store", signal: requestSignal });
    if (notification.status !== 202) throw new Error("Invalid initialization notification");
    const id = crypto.randomUUID();
    const response = await fetch(`${base}/mcp/`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }), cache: "no-store", signal: requestSignal });
    if (!response.ok) return { text: response.status === 401 || response.status === 403 ? "KitSolo 关联已失效，请重新关联。" : "KitSolo 暂时不可用，请稍后重试。", error: `http_${response.status}` };
    const raw = await response.text();
    if (raw.length > 200000) return { text: "工具返回内容过大，请在工作台查看。", error: "output_too_large" };
    const rpc = JSON.parse(raw);
    if (rpc.jsonrpc !== "2.0" || rpc.id !== id) throw new Error("Invalid RPC response");
    if (rpc.error) return { text: String(rpc.error.message ?? "工具参数无效"), error: "invalid_arguments" };
    const result = rpc.result;
    if (!Array.isArray(result?.content)) throw new Error("Invalid MCP result");
    const text = result.content.filter((part: { type: string; text?: string }) => part.type === "text").map((part: { text?: string }) => part.text ?? "").join("\n").slice(0, 30000);
    return { text, data: result.structuredContent && typeof result.structuredContent === "object" ? result.structuredContent : undefined, ...(result.isError ? { error: "execution_failed" } : {}) };
  } catch { return { text: "KitSolo 连接失败，请稍后重试。", error: "unavailable" }; }
}
