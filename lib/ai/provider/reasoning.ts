import { REASONING_FIELD } from "./credentials";
// 部分中转网关（尤其把 Claude extended thinking 转成 OpenAI 格式的代理）不会把 reasoning
// 增量发成纯字符串，而是 { type: "thinking", thinking: "..." } 这类结构化对象，甚至是
// block 数组。只按字符串判断会把这些内容静默丢弃，导致思考面板对这类自定义 API "看起来没生效"。
export function extractReasoningText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractReasoningText).join("");
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.thinking === "string") return obj.thinking;
    if (typeof obj.content === "string") return obj.content;
    if (Array.isArray(obj.content)) return extractReasoningText(obj.content);
  }
  return "";
}

export function extractReasoningDelta(
  delta: Record<string, unknown>,
  preferredField = REASONING_FIELD,
): string | undefined {
  const fields = [preferredField, "reasoning_content", "reasoning", "reasoning_text", "thinking"]
    .filter((field, index, arr) => field && arr.indexOf(field) === index);

  for (const field of fields) {
    const text = extractReasoningText(delta[field]);
    if (text) return text;
  }

  const text = extractReasoningText(delta.reasoning_details);
  return text || undefined;
}