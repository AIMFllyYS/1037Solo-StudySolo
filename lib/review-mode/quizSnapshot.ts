import type { QuizData } from "@/lib/quiz/types";
import type { ReviewQuizSourceKind, ReviewQuizSet } from "./attemptTypes";

function canonicalNode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalNode);
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    const child = input[key];
    if (child !== undefined) output[key] = canonicalNode(child);
  }
  return output;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalNode(value));
}

export async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("REVIEW_HASH_UNAVAILABLE");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createQuizSetIdentity(input: {
  sourceKind: ReviewQuizSourceKind;
  subjectId: string;
  categoryId: string | null;
  chapterId: string;
  quizId: string;
  title: string;
  quizData: QuizData;
}): Promise<Pick<ReviewQuizSet, "quizKey" | "contentHash">> {
  const contentHash = await sha256Hex(canonicalJson(input));
  // contentHash is computed from the complete source identity and immutable quiz
  // snapshot, so the storage key stays bounded even for long/non-ASCII labels.
  const scope = `ss-review-v1|${input.sourceKind}|${contentHash}`;
  return { quizKey: scope, contentHash };
}

/** Stable within the immutable question set; an identical q.id in another chapter cannot collide. */
export function questionLocationKey(contentHash: string, questionId: string): string {
  return `ssq-v1:${contentHash}:${encodeURIComponent(questionId)}`;
}
