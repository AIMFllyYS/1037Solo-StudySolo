import { z } from "zod";
import { readContentSearchText } from "@/lib/content/loader";

import { createServiceAuthClient } from "@/lib/auth/serviceClient";

import { type ReviewMaterialContext } from "@/lib/review-mode/quizContext";
import { ReviewQuizError } from "./errors";
import type { weakPointSchema } from "./request";
export async function loadChapterMaterial(subjectId: string, categoryId: string, chapterId: string): Promise<ReviewMaterialContext> {
  const source = readContentSearchText(subjectId, categoryId, chapterId);
  if (!source?.text.trim()) throw new ReviewQuizError(422, "REVIEW_SOURCE_MATERIAL_UNAVAILABLE");
  return {
    kind: "chapter",
    title: `${subjectId} · ${categoryId} · ${chapterId}`,
    reference: `${subjectId}/${categoryId}/${chapterId}`,
    text: source.text,
    totalCharacters: [...source.text].length,
  };
}

export async function loadClassroomMaterial(ownerId: string, sessionId: string): Promise<ReviewMaterialContext> {
  const db = createServiceAuthClient();
  const sessionResult = await db.from("ss_class_sessions").select("id,title")
    .eq("user_id", ownerId).eq("id", sessionId).is("archived_at", null).maybeSingle();
  if (sessionResult.error) throw new ReviewQuizError(503, "REVIEW_CLASSROOM_UNAVAILABLE");
  if (!sessionResult.data) throw new ReviewQuizError(404, "REVIEW_CLASSROOM_NOT_FOUND");
  const [transcriptResult, outlineResult] = await Promise.all([
    db.from("ss_class_transcripts").select("seq,payload", { count: "exact" })
      .eq("user_id", ownerId).eq("session_id", sessionId).order("seq", { ascending: true }).range(0, 999),
    db.from("ss_class_outlines").select("payload").eq("user_id", ownerId).eq("session_id", sessionId).maybeSingle(),
  ]);
  if (transcriptResult.error || outlineResult.error) throw new ReviewQuizError(503, "REVIEW_CLASSROOM_UNAVAILABLE");
  const transcriptRows = (transcriptResult.data ?? []) as Array<Record<string, unknown>>;
  const transcript = transcriptRows.map((row) => {
    const payload = row.payload as Record<string, unknown> | null;
    return typeof payload?.text === "string" ? payload.text : "";
  }).filter(Boolean);
  const outlinePayload = (outlineResult.data?.payload ?? {}) as { nodes?: Array<{ title?: string; parentId?: string | null }> };
  const outlineNodes = outlinePayload.nodes ?? [];
  const outline = outlineNodes.slice(0, 500).map((node) => `${node.parentId ? "  - " : "- "}${String(node.title ?? "").slice(0, 400)}`).join("\n");
  const totalSegments = transcriptResult.count ?? transcriptRows.length;
  const unloadedSegments = Math.max(0, totalSegments - transcriptRows.length);
  const sourceText = [
    outline ? `课堂大纲：\n${outline}` : "",
    transcript.length ? `课堂逐字记录：\n${transcript.join("\n")}` : "",
    outlineNodes.length > 500 ? `[课堂大纲读取 500/${outlineNodes.length} 个条目；其余未加载。]` : "",
    unloadedSegments ? `[当前读取 ${transcriptRows.length}/${totalSegments} 段；其余课堂记录本轮未加载。]` : "",
  ].filter(Boolean).join("\n\n");
  if (!sourceText) throw new ReviewQuizError(422, "REVIEW_CLASSROOM_MATERIAL_UNAVAILABLE");
  return {
    kind: "classroom",
    title: `课堂 · ${String(sessionResult.data.title ?? "课堂")}`,
    reference: `class-session:${sessionId} · ${totalSegments} 段课堂文稿`,
    text: sourceText,
    totalCharacters: [...sourceText].length,
  };
}

export async function loadWeakPointMaterials(points: z.infer<typeof weakPointSchema>[]): Promise<ReviewMaterialContext[]> {
  const output: ReviewMaterialContext[] = [];
  for (const point of points) {
    try {
      const material = await loadChapterMaterial(point.subjectId, point.categoryId, point.chapterId);
      output.push({
        ...material,
        title: `${material.title}（最近正确率 ${point.accuracy}%，错 ${point.wrongCount}/${point.answeredCount}）`,
      });
    } catch (error) {
      if (!(error instanceof ReviewQuizError) || error.code !== "REVIEW_SOURCE_MATERIAL_UNAVAILABLE") throw error;
    }
  }
  return output;
}