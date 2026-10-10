import { getStorageOwner } from "@/lib/storage/ownerScope";

export async function post(body: unknown, signal?: AbortSignal, expectedOwnerId?: string): Promise<Record<string, unknown>> {
  const ownerId = expectedOwnerId ?? getStorageOwner();
  if (!ownerId) throw new Error("REVIEW_OWNER_UNAVAILABLE");
  if (getStorageOwner() !== ownerId) throw new Error("REVIEW_OWNER_CHANGED");
  const ownerBinding = await ownerBindingFor(ownerId);
  if (getStorageOwner() !== ownerId) throw new Error("REVIEW_OWNER_CHANGED");
  const response = await fetch("/api/review/progress", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "x-studysolo-owner-binding": ownerBinding },
    body: JSON.stringify(body),
    signal,
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok || !value || typeof value !== "object") {
    const code = value && typeof value === "object" && typeof (value as Record<string, unknown>).code === "string"
      ? String((value as Record<string, unknown>).code)
      : "REVIEW_PROGRESS_UNAVAILABLE";
    throw new Error(response.status === 409 ? `CONFLICT:${code}` : code);
  }
  return value as Record<string, unknown>;
}

async function ownerBindingFor(ownerId: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("REVIEW_HASH_UNAVAILABLE");
  const data = new TextEncoder().encode(`studysolo-review-owner-binding-v1:${ownerId}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getAttempt(attemptId: string, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
  const response = await fetch(`/api/review/progress?attemptId=${encodeURIComponent(attemptId)}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (response.status === 404) return null;
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok || !value || typeof value !== "object") throw new Error("REVIEW_PROGRESS_UNAVAILABLE");
  return value as Record<string, unknown>;
}

export async function requestAttemptsPage(cursor?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ view: "attempts", limit: "50" });
  if (cursor) query.set("cursor", cursor);
  const response = await fetch(`/api/review/progress?${query.toString()}`, { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new Error("REVIEW_PROGRESS_UNAVAILABLE");
  const value: unknown = await response.json();
  if (!value || typeof value !== "object") throw new Error("REVIEW_PROGRESS_UNAVAILABLE");
  return value as { rows?: Array<Record<string, unknown>>; nextCursor?: string | null };
}
