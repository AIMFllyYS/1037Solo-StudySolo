import { tool } from "ai";
import { z } from "zod";
import { createServiceAuthClient } from "@/lib/auth/server/serviceClient";
import { rankTranscriptSegments, type TranscriptSegmentLike } from "@/lib/class/transcriptSearch";
import { allocateCiteIndex, CITE_HIT_HINT } from "@/lib/ai/agent/tools/citeIndex";
import {
  dedupeByContextKey,
  normalizeContextKeyPart,
  toText,
  type StudyToolContext,
  type StudyToolRuntime,
} from "@/lib/ai/agent/tools/_shared";
import type {
  ClassTranscriptHit,
  SearchClassTranscriptOutput,
  SearchClassTranscriptScope,
} from "@/lib/ai/agent/tools/searchClassTranscript/types";

const MAX_PAST_SESSIONS = 12;
const MAX_HITS = 8;
const MAX_ROWS = 6000;

type SessionRow = { id: string; title: string };

/** 读库入口（owner 过滤走 user_id，不依赖 RLS）；测试替换它，避免打真实数据库。 */
export const classTranscriptIo = {
  async loadSegments(userId: string, sessionIds: readonly string[]): Promise<Map<string, TranscriptSegmentLike[]>> {
    const out = new Map<string, TranscriptSegmentLike[]>();
    if (!sessionIds.length) return out;
    const db = createServiceAuthClient();
    const [result,corrections] = await Promise.all([db
      .from("ss_class_transcripts")
      .select("session_id,seq,payload")
      .eq("user_id", userId)
      .in("session_id", [...sessionIds])
      .order("seq")
      .limit(MAX_ROWS),db.from('ss_class_corrections').select('segment_id,payload').eq('user_id',userId).in('session_id',[...sessionIds]).limit(MAX_ROWS)]);
    if (result.error||corrections.error) throw result.error||corrections.error;
    const corrected=new Map((corrections.data??[]).map(row=>[String(row.segment_id),(row.payload as {correctedText?:unknown})?.correctedText]));
    for (const row of result.data ?? []) {
      const payload = (row.payload ?? {}) as { id?: string; text?: string };
      if (typeof payload.text !== "string" || !payload.text.trim()) continue;
      const list = out.get(row.session_id as string) ?? [];
      const id=payload.id ?? `${row.session_id}:${row.seq}`,text=corrected.get(id);
      list.push({ id, seq: Number(row.seq) || 0, text: typeof text==='string'?text:payload.text });
      out.set(row.session_id as string, list);
    }
    return out;
  },
  async listSessions(userId: string): Promise<SessionRow[]> {
    const db = createServiceAuthClient();
    const result = await db
      .from("ss_class_sessions")
      .select("id,title")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(MAX_PAST_SESSIONS + 1);
    if (result.error) throw result.error;
    return (result.data ?? []).map((row) => ({ id: String(row.id), title: String(row.title ?? "课堂") }));
  },
};

/** 云端文稿 + 请求携带的实时尾部（按段 id 去重，尾部覆盖库内同段）。 */
function mergeLive(stored: readonly TranscriptSegmentLike[], live: readonly TranscriptSegmentLike[]): TranscriptSegmentLike[] {
  const byId = new Map<string, TranscriptSegmentLike>();
  for (const segment of stored) byId.set(segment.id, segment);
  for (const segment of live) byId.set(segment.id, segment);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

function numberHits(
  runtime: StudyToolRuntime,
  hits: Omit<ClassTranscriptHit, "citeIndex">[],
  already: boolean,
): ClassTranscriptHit[] {
  return hits.map((hit) => ({ ...hit, citeIndex: already ? undefined : allocateCiteIndex(runtime) }));
}

function render(hits: ClassTranscriptHit[], scope: SearchClassTranscriptScope): string {
  const lines = hits.map((hit) => {
    const label = hit.citeIndex ? `[${hit.citeIndex}]` : "-";
    const where = scope === "past" ? `《${hit.sessionTitle}》` : "本节课";
    return `${label} ${where}：${hit.text.replace(/\s+/g, " ").trim().slice(0, 600)}`;
  });
  lines.push(CITE_HIT_HINT);
  return lines.join("\n");
}

export function createSearchClassTranscriptTool(ctx: StudyToolContext, runtime: StudyToolRuntime) {
  return tool({
    description:
      "检索课堂录音文稿。scope=current（默认）搜当前这节课，回答“老师刚才讲了什么”、本节课的定义/例题时必须先调用；scope=past 搜学生以前上过的其他课。可传多个关键词（空格分隔）。命中带 [n] 编号，依据命中写出的句子句末必须标注。",
    inputSchema: z.object({
      query: z.string().min(1).describe("关键词，可多个，用空格分隔，如「可导 连续」"),
      scope: z.enum(["current", "past"]).optional().describe("current=本节课（默认）；past=以前的课"),
    }),
    execute: async ({ query, scope }): Promise<SearchClassTranscriptOutput> => {
      const resolved: SearchClassTranscriptScope = scope ?? "current";
      const cls = ctx.classContext;
      if (!cls || !ctx.userId) {
        return { text: "当前不在课堂模式，没有可检索的课堂文稿。", hits: [], scope: resolved };
      }
      const contextKey = `class:${resolved}:${cls.sessionId}:${normalizeContextKeyPart(query)}`;
      const already = runtime.loadedContextKeys.has(contextKey);
      try {
        if (resolved === "current") {
          let stored:TranscriptSegmentLike[]=[],liveOnly=false;
          try{stored=(await classTranscriptIo.loadSegments(ctx.userId,[cls.sessionId])).get(cls.sessionId)??[];}
          catch(error){if(!cls.recent.length)throw error;liveOnly=true;}
          const ranked = rankTranscriptSegments(query, mergeLive(stored, cls.recent), MAX_HITS);
          if (!ranked.length) {
            return { text: "本节课文稿里没有检索到相关片段，可换个关键词再试。", hits: [], scope: resolved, contextKey };
          }
          const hits = numberHits(
            runtime,
            ranked.map((hit) => ({ sessionId: cls.sessionId, sessionTitle: cls.title || "本节课", segmentId: hit.segmentId, text: hit.text })),
            already,
          );
          return dedupeByContextKey(runtime, "searchClassTranscript", { text:(liveOnly?'云端文稿暂不可读，以下引用来自本机实时文稿。\n':'')+render(hits, resolved), hits, scope: resolved, contextKey });
        }
        const sessions = (await classTranscriptIo.listSessions(ctx.userId))
          .filter((session) => session.id !== cls.sessionId)
          .slice(0, MAX_PAST_SESSIONS);
        const segments = await classTranscriptIo.loadSegments(ctx.userId, sessions.map((session) => session.id));
        // 每节课的第一名优先，再按课内名次：结果覆盖多节课，而不是被一节课刷屏。
        const pooled: (Omit<ClassTranscriptHit, "citeIndex"> & { rank: number })[] = [];
        for (const session of sessions) {
          rankTranscriptSegments(query, segments.get(session.id) ?? []).forEach((hit, rank) => {
            pooled.push({ sessionId: session.id, sessionTitle: session.title, segmentId: hit.segmentId, text: hit.text, rank });
          });
        }
        const ranked = pooled.sort((a, b) => a.rank - b.rank).slice(0, MAX_HITS).map(({ rank: _rank, ...hit }) => {
          void _rank;
          return hit;
        });
        if (!ranked.length) {
          return { text: "以前的课堂文稿里没有检索到相关片段。", hits: [], scope: resolved, contextKey };
        }
        const hits = numberHits(runtime, ranked, already);
        return dedupeByContextKey(runtime, "searchClassTranscript", { text: render(hits, resolved), hits, scope: resolved, contextKey });
      } catch {
        return { text: "课堂文稿暂时读取失败，请稍后再试。", hits: [], scope: resolved };
      }
    },
    toModelOutput: ({ output }) => toText(output),
  });
}
