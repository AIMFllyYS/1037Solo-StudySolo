import type { useT } from "@/lib/i18n";

import type { FeedbackRecord } from "@/lib/chat/feedback/feedbackClient";


export type Vote = "like" | "dislike";
export const REPORT_REASONS = ["inaccurate", "unsafe", "privacy", "other"] as const;
export type ReportReason = typeof REPORT_REASONS[number];
export const reportReasonValue = (value: string): ReportReason | "" => REPORT_REASONS.find((reason) => reason === value) ?? "";
export type DialogState =
  | { kind: "vote"; vote: Vote; record: FeedbackRecord; stale?: boolean }
  | { kind: "report"; stale?: boolean };

export function errorMessage(code: string, t: ReturnType<typeof useT>): string {
  switch (code) {
    case "SESSION_MISSING":
    case "SESSION_INVALID": return t("panel.chatFeedback.loginRequired");
    case "MFA_REQUIRED": return t("panel.chatFeedback.mfaRequired");
    case "ACCOUNT_UNAVAILABLE": return t("panel.chatFeedback.accountUnavailable");
    case "FEEDBACK_MIGRATION_PENDING": return t("panel.chatFeedback.migrationPending");
    case "RATE_LIMITED": return t("panel.chatFeedback.rateLimited");
    case "FEEDBACK_STALE": return t("panel.chatFeedback.stale");
    default: return t("panel.chatFeedback.submitFailed");
  }
}
