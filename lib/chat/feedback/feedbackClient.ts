export type FeedbackRecord = {
  id: string;
  feedbackType: string;
  revision: number;
  status: string;
  reportReason?: string | null;
  feedbackText?: string | null;
  answerExcerpt?: string | null;
};

export async function feedbackRequest(body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch("/api/feedback/chat", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(typeof payload.code === "string" ? payload.code : "FEEDBACK_UNAVAILABLE");
    throw error;
  }
  return payload;
}

export async function postFeedback(body: Record<string, unknown>, signal?: AbortSignal): Promise<FeedbackRecord> {
  const payload = await feedbackRequest(body, signal);
  if (typeof payload.id !== "string" || typeof payload.feedbackType !== "string"
    || !Number.isSafeInteger(payload.revision) || typeof payload.status !== "string") {
    throw new Error("FEEDBACK_UNAVAILABLE");
  }
  return payload as unknown as FeedbackRecord;
}