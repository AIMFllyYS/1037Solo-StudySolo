export const MAX_FEEDBACK_EXCERPT_CHARACTERS = 600;
export const MAX_FEEDBACK_TEXT_CHARACTERS = 1_000;

const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "[凭证已隐藏]"],
  [/\b(?:sk-[A-Za-z0-9_-]{16,}|sk_live_[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{16,}|AIza[A-Za-z0-9_-]{24,})\b/g, "[凭证已隐藏]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g, "[令牌已隐藏]"],
  [/\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password|passwd)\b\s*[:=]\s*[^\s,;]+/gi, "[凭证字段已隐藏]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[邮箱已隐藏]"],
  [/(?:\+?86[ -]?)?1[3-9](?:[ -]?\d){9}\b/g, "[手机号已隐藏]"],
  [/[A-Za-z]:\\Users\\[^\\\s]+/g, "[本地用户名已隐藏]"],
];

function redact(text: string): string {
  return REDACTIONS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

/** A short, explicitly opt-in answer excerpt. Never include prompts, history, or tool output. */
export function prepareFeedbackExcerpt(text: string): string {
  const excerpt = redact(text).replace(/\s+/gu, " ").trim();
  return Array.from(excerpt).slice(0, MAX_FEEDBACK_EXCERPT_CHARACTERS).join("");
}

/** A bounded free-text reason; common contact details and credentials are redacted on both ends. */
export function prepareFeedbackText(text: string): string {
  const details = redact(text).replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").trim();
  return Array.from(details).slice(0, MAX_FEEDBACK_TEXT_CHARACTERS).join("");
}
