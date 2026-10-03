import { ConnectorError } from "./actor.server";
export async function boundedText(response: Response, max = 524288): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader(), chunks: Buffer[] = []; let bytes = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > max) throw new ConnectorError("PROVIDER_RESPONSE_TOO_LARGE", 502); chunks.push(Buffer.from(next.value)); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
export async function providerJson(url: string | URL, init: RequestInit = {}, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]) });
  const raw = await boundedText(response);
  if (!response.ok) throw new ConnectorError(response.status === 401 || response.status === 400 && /"error"\s*:\s*"invalid_grant"/.test(raw) ? "PROVIDER_AUTHORIZATION_EXPIRED" : response.status === 403 ? "PROVIDER_PERMISSION_DENIED" : response.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_REQUEST_FAILED", response.status === 401 || response.status === 403 || response.status === 400 && /"error"\s*:\s*"invalid_grant"/.test(raw) ? 403 : 502);
  try { const body = JSON.parse(raw); if (!body || typeof body !== "object") throw new Error(); return body; } catch { throw new ConnectorError("PROVIDER_RESPONSE_INVALID", 502); }
}
export function safeArgument(value: unknown, limit = 4000): string { if (typeof value !== "string" || !value.trim() || value.length > limit || /\0/.test(value)) throw new ConnectorError("INVALID_ARGUMENTS"); return value; }
export function resourceId(value: unknown): string { const id = safeArgument(value, 200); if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new ConnectorError("INVALID_RESOURCE_ID"); return id; }
export function resultText(value: unknown): string { const text = JSON.stringify(value, null, 2); return text.length > 24000 ? text.slice(0, 24000) + "\n【结果已截断，请缩小范围或使用分页读取。】" : text; }
export function secretFreeArguments(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(secretFreeArguments);
  if (value && typeof value === "object") return Object.entries(value).every(([key, item]) => !/^(?:authorization|access_token|refresh_token|api_key|client_secret|password|private_key|__proto__|prototype|constructor)$/i.test(key) && secretFreeArguments(item));
  return true;
}
