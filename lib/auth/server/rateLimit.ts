/** In-process fixed window. Basic per-instance QPS cap — not a cluster quota. */

export const AI_RATE_LIMIT_MAX = 30;
export const AI_RATE_LIMIT_WINDOW_MS = 60_000;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitConsumeOptions {
  now?: number;
  max?: number;
  windowMs?: number;
}

export type RateLimitHit =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number };

export function resetRateLimitStore(): void {
  buckets.clear();
}

function sweepExpired(now: number): void {
  if (buckets.size < 2000) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/** 取客户端 IP 作限流 key：最左一个 x-forwarded-for，缺省 x-real-ip。 */
export function requestClientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function consumeRateLimit(key: string, opts: RateLimitConsumeOptions = {}): RateLimitHit {
  const now = opts.now ?? Date.now();
  const max = opts.max ?? AI_RATE_LIMIT_MAX;
  const windowMs = opts.windowMs ?? AI_RATE_LIMIT_WINDOW_MS;
  sweepExpired(now);

  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: Math.max(0, max - 1) };
  }
  if (existing.count >= max) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { ok: true, remaining: Math.max(0, max - existing.count) };
}
