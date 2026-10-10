// 服务端：按 contextKey 把 compact stub 回灌为模型可用的全文。
// 只在 Node 路由里用（读教材包 / 请求体里的技能）。

import { findContentItem, readContentMarkdown } from "@/lib/content/loader";
import { getOutlineIo } from "@/lib/ai/agent/tools/getOutline/tool";
import { isAcademicYearId, type AcademicYearId } from "@/lib/constants/academic-year";
import { isCompactedToolText, toolNameFromPart } from "@/lib/chat/messages/compactStudyParts";
import type { ArtifactCatalogItem } from "@/lib/ai/agent/tools/getArtifact/types";
import type { Skill } from "@/lib/types/skill";

export interface RehydrateStudyContext {
  skills?: Skill[];
  artifacts?: ArtifactCatalogItem[];
  academicYear?: AcademicYearId;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pageTitle(subjectId: string, categoryId: string, itemId: string): string {
  const found = findContentItem(subjectId, categoryId, itemId);
  if (!found) return `${subjectId} / ${categoryId} / ${itemId}`;
  return `${found.subjectName} > ${found.categoryName} > ${found.parentTitle ? `${found.parentTitle} > ` : ""}${found.item.title}`;
}

function pageBody(subjectId: string, categoryId: string, itemId: string): string {
  const title = pageTitle(subjectId, categoryId, itemId);
  const md = readContentMarkdown(subjectId, categoryId, itemId);
  if (!md) {
    return `【${title}】该页正文尚未生成（占位）。可结合标题与课程大纲作答，并说明该处正在完善。`;
  }
  return `【${title}】\n\n${md}`;
}

function splitTriple(rest: string): [string, string, string] | null {
  const parts = rest.split("/");
  if (parts.length < 3) return null;
  const [subjectId, categoryId, ...item] = parts;
  const itemId = item.join("/");
  if (!subjectId || !categoryId || !itemId) return null;
  return [subjectId, categoryId, itemId];
}

function skillText(skills: Skill[] | undefined, contextKey: string, output: Record<string, unknown>): string | null {
  const id = contextKey.startsWith("skill:") ? contextKey.slice("skill:".length) : "";
  const wantedName = String(output.skill ?? "");
  const skill =
    skills?.find((item) => item.id && item.id === id) ??
    skills?.find((item) => item.name === wantedName) ??
    skills?.find((item) => item.name.toLowerCase() === wantedName.toLowerCase());
  if (!skill?.content) return null;
  const head = skill.description ? `${skill.description}\n\n` : "";
  return `【技能：${skill.name}】\n${head}${skill.content}`;
}

function outlineText(contextKey: string, academicYear?: AcademicYearId): string | null {
  if (contextKey === "outline:all") return getOutlineIo.getMultiSubjectOutline("all");
  if (!contextKey.startsWith("outline:")) return null;
  const scope = contextKey.slice("outline:".length);
  if (isAcademicYearId(scope)) return getOutlineIo.getMultiSubjectOutline(scope);
  return academicYear ? getOutlineIo.getMultiSubjectOutline(academicYear) : getOutlineIo.getMultiSubjectOutline("all");
}

function artifactText(artifacts: ArtifactCatalogItem[] | undefined, output: Record<string, unknown>): string | null {
  const id = String(output.artifactId ?? "");
  const item = artifacts?.find((artifact) => artifact.id === id);
  if (!item?.html) return null;
  return `【演示 ${item.id} / ${item.title || "未命名"}】\n${item.html}`;
}

function rehydrateOutput(
  name: string,
  output: Record<string, unknown>,
  ctx: RehydrateStudyContext,
): Record<string, unknown> {
  const text = typeof output.text === "string" ? output.text : "";
  if (text && !isCompactedToolText(text)) return output;
  const key = typeof output.contextKey === "string" ? output.contextKey : "";

  if ((name === "getCurrentPage" || name === "getSection") && (key.startsWith("page:") || key.startsWith("section:"))) {
    const triple = splitTriple(key.slice(key.indexOf(":") + 1));
    if (triple) return { ...output, text: pageBody(...triple) };
  }
  if (name === "getOutline" && key.startsWith("outline:")) {
    const next = outlineText(key, ctx.academicYear);
    if (next) return { ...output, text: next };
  }
  if (name === "useSkill") {
    const next = skillText(ctx.skills, key, output);
    if (next) return { ...output, text: next };
  }
  if (name === "getArtifact") {
    const next = artifactText(ctx.artifacts, output);
    if (next) return { ...output, text: next };
  }
  return output;
}

export function rehydrateStudyParts<T extends { type: string; state?: string; output?: unknown; toolName?: string }>(
  parts: T[],
  ctx: RehydrateStudyContext,
): T[] {
  return parts.map((part) => {
    const name = toolNameFromPart(part);
    if (!name || part.state !== "output-available") return part;
    const output = recordOf(part.output);
    if (!output) return part;
    const next = rehydrateOutput(name, output, ctx);
    return next === output ? part : { ...part, output: next };
  });
}
