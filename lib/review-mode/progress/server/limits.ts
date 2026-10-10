import { z } from "zod";

export const UUID = z.string().uuid();
export const SOURCE_KINDS = ["static", "review-wrong", "review-chapter", "classroom"] as const;
export const SOURCE_QUERY_KINDS = [...SOURCE_KINDS, "legacy-import"] as const;
export const MAX_REQUEST_BYTES = 512 * 1024;
export const MAX_QUIZ_SNAPSHOT_BYTES = 360_000;
export const RESPONSE_BYTES_SOFT_LIMIT = 420_000;
export const ANSWER_BYTES_LIMIT = 120_000;

export function byteLength(value: unknown): number {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; } catch { return Number.POSITIVE_INFINITY; }
}
