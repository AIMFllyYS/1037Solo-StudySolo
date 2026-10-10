/** OpenAI 兼容网关：保证 base 以 /v1 结尾，避免拼出 /chat/completions 落到根路径。幂等。 */
export function normalizeOpenAIBaseUrl(url: string): string {
  const trimmed = String(url ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}
