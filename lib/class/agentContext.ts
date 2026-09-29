import { z } from "zod";

/**
 * Class 模式给主 Agent 的课堂上下文。
 *
 * Class 不再自带一套聊天：右栏就是 Studio 的同一个 Agent 面板（同一套会话、标签、
 * 历史、工具卡片、计费）。区别只在于课堂页会把「当前这节课」作为上下文随请求上行，
 * 服务端据此在 volatile 段注入课堂提示，并挂上 searchClassTranscript 工具。
 *
 * 最近文稿随请求上行而不是只靠服务端读库：录音中的新段落有 ~10s 的云端落库延迟，
 * 学生问「刚才讲的」时库里可能还没有。
 */
export const CLASS_CONTEXT_LIMITS = {
  title: 200,
  outlineItems: 80,
  outlineItemChars: 200,
  recentSegments: 60,
  segmentChars: 4000,
  recentTotalChars: 16_000,
} as const;

export const classAgentContextSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string().max(CLASS_CONTEXT_LIMITS.title).default(""),
  live: z.boolean().default(false),
  outline: z
    .array(z.string().max(CLASS_CONTEXT_LIMITS.outlineItemChars))
    .max(CLASS_CONTEXT_LIMITS.outlineItems)
    .default([]),
  recent: z
    .array(
      z.object({
        id: z.string().min(1).max(150),
        seq: z.number().int().nonnegative(),
        text: z.string().max(CLASS_CONTEXT_LIMITS.segmentChars),
      }),
    )
    .max(CLASS_CONTEXT_LIMITS.recentSegments)
    .default([]),
});

export type ClassAgentContext = z.infer<typeof classAgentContextSchema>;

type Provider = () => ClassAgentContext | null;
let provider: Provider | null = null;

/** 课堂工作台挂载时注册、卸载时注销；离开 Class 模式后主 Agent 不再携带课堂上下文。 */
export function setClassAgentContextProvider(next: Provider | null): void {
  provider = next;
}

export function getClassAgentContext(): ClassAgentContext | null {
  try {
    return provider?.() ?? null;
  } catch {
    return null;
  }
}

/** 取文稿尾部，按总字数封顶（从最新往回数）。 */
export function tailSegments(
  segments: readonly { id: string; seq: number; text: string }[],
): ClassAgentContext["recent"] {
  const out: ClassAgentContext["recent"] = [];
  let total = 0;
  for (let i = segments.length - 1; i >= 0 && out.length < CLASS_CONTEXT_LIMITS.recentSegments; i--) {
    const text = segments[i].text.slice(0, CLASS_CONTEXT_LIMITS.segmentChars);
    if (total + text.length > CLASS_CONTEXT_LIMITS.recentTotalChars && out.length > 0) break;
    total += text.length;
    out.unshift({ id: segments[i].id, seq: segments[i].seq, text });
  }
  return out;
}

/** 服务端 volatile 段：只描述课堂与工具纪律，最近文稿截取尾部若干段供理解语境。 */
export function formatClassContextBlock(ctx: ClassAgentContext): string {
  const outline = ctx.outline.filter(Boolean).slice(0, 40).join("、");
  const recent = ctx.recent.slice(-8).map((segment) => segment.text.trim()).filter(Boolean).join("\n");
  return [
    `【课堂模式】学生正在 Class 模式${ctx.live ? "上课（录音进行中）" : "查看一节课"}：《${ctx.title || "未命名课堂"}》。`,
    "- 问到“老师刚才讲了什么”、本节课的定义/例题/结论时，必须调用 searchClassTranscript 检索文稿，不要凭记忆作答；依据命中写出的句子句末标注对应 [n]。",
    "- 问到以前的课、上节课或需要跨课复习时，调用 searchClassTranscript(scope=\"past\")，并说明出自哪节课。",
    "- 本节课之外的教材知识仍可用 searchNotes / getSection 等工具。",
    `课堂提纲：${outline || "（尚未生成）"}`,
    recent ? `最近文稿（实时尾部，仅供理解语境；要引用请先检索取得编号）：\n${recent}` : "最近文稿：（暂无）",
  ].join("\n");
}
