/**
 * Review 模式「按章节出题」的课堂来源：把 Class 模式录下/导入的课当作一个「章节」，
 * 让 Agent 基于该节课真实文稿与大纲出题（Classolo issue #70：新对话/复习能引用历史课）。
 *
 * 只走已鉴权的 /api/class/state（RLS + 账号校验），不在浏览器缓存别人的课堂内容。
 */
export interface ClassSourceSession {
  id: string;
  title: string;
  status: string;
  startedAt?: string;
}

async function classState<T>(op: string, input: Record<string, unknown>, expectedUserId: string): Promise<T> {
  const res = await fetch("/api/class/state", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, input, expectedUserId }),
  });
  if (!res.ok) throw new Error(`class ${op} ${res.status}`);
  return (await res.json()) as T;
}

export async function listClassSources(userId: string): Promise<ClassSourceSession[]> {
  const rows = await classState<ClassSourceSession[]>("session.list", {}, userId);
  return Array.isArray(rows) ? rows.filter((r) => r && typeof r.id === "string") : [];
}

/** 出题用的上下文上限：够覆盖一节课的要点，又不会把请求撑到服务端 128KB 上限。 */
export const CLASS_SOURCE_MAX_CHARS = 12000;

interface LoadedClass {
  transcript?: { text?: string }[];
  outline?: { outline?: { nodes?: { title?: string; parentId?: string | null }[] } } | null;
}

export function buildClassQuizPrompt(title: string, data: LoadedClass, maxChars = CLASS_SOURCE_MAX_CHARS): string {
  const outline = (data.outline?.outline?.nodes ?? [])
    .map((n) => `${n.parentId ? "  - " : "- "}${n.title ?? ""}`)
    .filter((l) => l.trim() !== "-")
    .join("\n");
  let transcript = (data.transcript ?? []).map((s) => s.text ?? "").filter(Boolean).join("\n");
  if (transcript.length > maxChars) transcript = transcript.slice(-maxChars);
  return (
    `请基于这节课的真实课堂内容出一套 6–8 道复习题（intent=practice），` +
    `题型混合单选/多选/判断/填空，覆盖老师强调的概念、公式与易错点；每题 explanation 里说明依据的课堂要点。` +
    `只考课堂里讲到的内容，不要超纲。\n\n课程：${title}\n\n课堂大纲：\n${outline || "（无）"}\n\n课堂文稿（节选）：\n${transcript || "（无）"}`
  );
}

export async function loadClassQuizPrompt(userId: string, session: ClassSourceSession): Promise<string> {
  const data = await classState<LoadedClass>("session.load", { id: session.id }, userId);
  return buildClassQuizPrompt(session.title || "课堂", data);
}
