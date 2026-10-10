export const DEFAULT_SESSION_TITLE_MODEL = "z-ai/glm-5.3-flash";
export const SESSION_TITLE_MAX_CHARS = 20;
/** 期望的下限（提示词里要求 10–20 字）。模型偶尔给更短的结果，只对"短到没有信息量"的兜底。 */
export const SESSION_TITLE_MIN_CHARS = 10;
/** 短于这个长度就认为模型输出不可用，退回本地标题。 */
const SESSION_TITLE_USABLE_CHARS = 4;

/** 标题提示词：标签页命名与自动路由共用同一套"极短、无符号"的纪律。 */
export const SESSION_TITLE_SYSTEM_PROMPT =
  `你是学习软件的会话标题生成器。根据用户的第一句提问，生成一个中文标题，${SESSION_TITLE_MIN_CHARS}~${SESSION_TITLE_MAX_CHARS} 个字。
要求：只输出标题本身；不要任何标点或符号（不要逗号、顿号、冒号、引号、书名号、括号、emoji）；不要编号；不要换行；不要 Markdown；不要解释。`;

const LEADING_CONTEXT_RE = /^针对(?:当前页面|这篇笔记)这段原文：\s*/;

export function sanitizeSessionTitle(raw: string, fallback = "新对话"): string {
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[《》“”"'\r\n]/g, "")
    .replace(/^标题[:：]\s*/i, "")
    .replace(/^解释如下[:：]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const oneLine = cleaned || fallback;
  return oneLine
    .slice(0, SESSION_TITLE_MAX_CHARS)
    .replace(/[：:，,、；;的到和与及在从]+$/g, "")
    .trim() || fallback;
}

/**
 * 模型产出的标题：在通用清洗之上**再删掉所有符号**，并收口到 20 字以内。
 *
 * 为什么单独一条：本地兜底标题（用户原话截断）保留空格是好的，但模型给的标题带标点会显脏；
 * 需求是"命名不允许出现任何符号"，所以只对模型输出做这道更严的清洗。
 */
export function sanitizeGeneratedTitle(raw: string, fallback = "新对话"): string {
  const base = sanitizeSessionTitle(raw, "");
  if (!base) return fallback;
  // 只保留中日韩文字、拉丁字母与数字；标点 / 符号 / emoji / 空格全部丢弃。
  const symbolFree = base.replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}a-zA-Z0-9]/gu, "");
  const chars = [...symbolFree];
  if (chars.length < SESSION_TITLE_USABLE_CHARS) return fallback;
  // 按码点截断，避免把 emoji / 代理对切成半个字符。
  return chars.slice(0, SESSION_TITLE_MAX_CHARS).join("");
}

export function buildFallbackSessionTitle(content: string): string {
  const withoutContextLead = content.trim().replace(LEADING_CONTEXT_RE, "");
  const withoutMarkdownQuote = withoutContextLead
    .split(/\r?\n/)
    .map((line) => line.replace(/^>\s?/, "").trim())
    .filter(Boolean)
    .join(" ");
  return sanitizeSessionTitle(withoutMarkdownQuote, "新对话");
}
