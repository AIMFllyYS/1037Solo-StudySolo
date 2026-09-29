/** Paid AI API routes that consume operator (or BYOK) model quota. */

export const PAID_AI_API_PATHS = [
  "/api/chat",
  "/api/chat-title",
  "/api/artifact",
  "/api/document",
  "/api/canvas-revise",
  "/api/follow-ups",
  "/api/image-gen",
  "/api/record",
  "/api/class/ai/chat/completions",
  "/api/class/image-search",
  "/api/class/asr/audio/transcriptions",
] as const;

const PAID_AI_API_PATH_SET = new Set<string>(PAID_AI_API_PATHS);

export function normalizeApiPathname(pathname: string): string {
  const path = pathname.split("?")[0] || "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

export function isPaidAiApiPath(pathname: string): boolean {
  return PAID_AI_API_PATH_SET.has(normalizeApiPathname(pathname));
}

export function isPaidAiApiUrl(input: RequestInfo | URL): boolean {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  try {
    const url = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw)
      : new URL(raw, "http://local.invalid");
    return isPaidAiApiPath(url.pathname);
  } catch {
    return false;
  }
}
