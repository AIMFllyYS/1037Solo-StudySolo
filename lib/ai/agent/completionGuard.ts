/**
 * Agent 收尾守卫：一轮 ToolLoopAgent 在「最后一步没有工具调用」时就会结束。两类常见坏结局：
 *
 * 1. 空正文 —— 推理模型把输出预算全花在 reasoning 上（finishReason=length，textTokens=0），
 *    或思考完直接 stop 不写正文。学生看到的是「思考了很久然后什么都没有」。
 *    日志实证：deepseek-v4.1-flash，outputTokens=256 且 reasoningTokens=256、finishReason=length。
 * 2. 口头调用 —— 模型在正文末尾说「我来搜索一下 / 让我调用 xxx」，却没有真正发出 tool call，
 *    finishReason=stop，循环随之结束。学生看到的是「说要调用工具但并没有调用」。
 *
 * 守卫只做一次续写（不会无限循环），续写与首轮共用同一条 UI 消息流与计费通道。
 */

export type ContinuationKind = "answer" | "tool" | "continue";

/** 只写正文的续写（关闭思考与工具）。 */
export function isTextOnlyContinuation(kind: ContinuationKind | undefined): boolean {
  return kind === "answer" || kind === "continue";
}

export interface GuardStep {
  text: string;
  reasoningText?: string;
  finishReason: string;
  toolCalls: readonly unknown[];
}

export interface GuardInput {
  steps: readonly GuardStep[];
  toolNames: readonly string[];
  stepLimit: number;
  /** 图片模式 / 计划模式等已强制工具编排的场景不续写。 */
  disabled?: boolean;
}

export interface ContinuationDecision {
  kind: ContinuationKind;
  nudge: string;
}

/** 末尾 240 字内的「宣称要调用工具」措辞；只看末尾，避免正文中讲解工具用法时误判。 */
const TOOL_ANNOUNCEMENT =
  /(我(来|将|会|先|现在|马上|这就)?(调用|使用|搜索|检索|查询|查找|查一下|搜一下|生成|绘制|画|出[一几]?[道套]?题|写入|创建|打开|读取)|让我(来)?(调用|使用|搜索|检索|查|搜|生成|画|绘制|出题|看看|读取)|接下来(我)?(调用|使用|检索|搜索)|正在(调用|搜索|检索|查询|生成)|(稍等|请稍候)[，,。…]*$)[^。！？!?\n]{0,60}[：:。…\.\s]*$/u;

export function announcesToolCall(text: string): boolean {
  const tail = text.trim().slice(-240);
  return tail.length > 0 && TOOL_ANNOUNCEMENT.test(tail);
}

export const ANSWER_RECOVERY_NUDGE =
  "（系统提示）你上一步只完成了思考，没有写出任何给学生看的正文。现在不要再思考、也不要调用工具，直接基于已有的思考结论与工具结果，写出完整、可直接阅读的回答正文。";

export const TOOL_RECOVERY_NUDGE =
  "（系统提示）你上一条回复说要调用工具，但并没有真正发起工具调用。现在立即发起你刚才说的那个工具调用（不要再口头说明）；如果确实不需要工具，就直接给出完整回答。";

export const CONTINUE_RECOVERY_NUDGE =
  "（系统提示）你上一条回答因为达到输出长度上限被截断了。现在不要重复已经写过的内容，也不要重新开头，直接从断开的地方接着写完；不要再思考、也不要调用工具。";

export function decideContinuation(input: GuardInput): ContinuationDecision | null {
  if (input.disabled) return null;
  const last = input.steps[input.steps.length - 1];
  if (!last) return null;
  if (last.toolCalls.length > 0 || last.finishReason === "tool-calls") return null;
  if (!["stop", "length", "other", "unknown"].includes(last.finishReason)) return null;
  // 整轮任何一步已产出正文时，空的最后一步不算「没回答」（例如工具后只追加 FollowUp）。
  const anyText = input.steps.some((step) => step.text.trim().length > 0);
  if (!anyText) return { kind: "answer", nudge: ANSWER_RECOVERY_NUDGE };
  // 写了一半被输出上限截断：接着写，而不是让学生看到半句话。
  if (last.finishReason === "length" && last.text.trim().length > 0) {
    return { kind: "continue", nudge: CONTINUE_RECOVERY_NUDGE };
  }
  if (
    input.toolNames.length > 0 &&
    input.steps.length < input.stepLimit &&
    announcesToolCall(last.text)
  ) {
    return { kind: "tool", nudge: TOOL_RECOVERY_NUDGE };
  }
  return null;
}

/** 两段用量逐字段相加（LanguageModelUsage 及其 details / raw 的数值字段）。 */
export function addUsage(a: unknown, b: unknown): unknown {
  if (a == null) return b;
  if (b == null) return a;
  if (typeof a === "number" && typeof b === "number") return a + b;
  if (typeof a !== "object" || typeof b !== "object" || Array.isArray(a) || Array.isArray(b)) return a ?? b;
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [key, value] of Object.entries(b as Record<string, unknown>)) {
    out[key] = key in out ? addUsage(out[key], value) : value;
  }
  return out;
}
