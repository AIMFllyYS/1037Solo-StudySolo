import fs from "node:fs";
import path from "node:path";

import { isSafeContentSegment } from "@/lib/content/contentPathGuard";

import type { ExampleListItem, ExampleDetail, ExampleMeta } from "./types";
import { EXAMPLES_ROOT } from "./io";
function exampleTitleFromContent(content: string, file: string): string {
  const exampleLabelMatch = content.match(/:::example\{label=([^}]+)\}/);
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const raw = exampleLabelMatch
    ? exampleLabelMatch[1].trim()
    : titleMatch
      ? titleMatch[1].trim()
      : file.replace(/\.md$/, "");
  return raw.replace(/^["']|["']$/g, "");
}

/** 允许 Unicode 文件名（如 EX01_硫酸黏度测定），仅拦截路径穿越。 */
function isSafeExampleId(exampleId: string): boolean {
  if (!exampleId) return false;
  if (exampleId.includes("..")) return false;
  if (/[\\/]/.test(exampleId)) return false;
  return exampleId === path.basename(exampleId);
}

function examplesDir(subjectId: string, chapterId: string, sectionId: string): string | null {
  if (!chapterId || !sectionId) return null;
  // 与正文同一套段白名单：任一参数含 ".."、"/"、"\" 等都会被拒，
  // 否则 /api/examples 的查询参数可让路径逃逸出 EXAMPLES_ROOT。
  if (subjectId && !isSafeContentSegment(subjectId)) return null;
  if (!isSafeContentSegment(chapterId) || !isSafeContentSegment(sectionId)) return null;
  return subjectId && subjectId !== "probability"
    ? path.join(/* turbopackIgnore: true */ EXAMPLES_ROOT, subjectId, chapterId, sectionId)
    : path.join(/* turbopackIgnore: true */ EXAMPLES_ROOT, chapterId, sectionId);
}

/** 仅返回例题 id/title（SSR 列表用，不含正文）。 */
export function readExamplesMeta(
  subjectId: string,
  chapterId: string,
  sectionId: string,
): ExampleListItem[] {
  const dir = examplesDir(subjectId, chapterId, sectionId);
  if (!dir) return [];
  let files: string[];
  try {
    files = fs.readdirSync(/* turbopackIgnore: true */ dir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
  return files.map((file) => {
    const content = fs.readFileSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ dir, file), "utf8");
    return {
      id: file.replace(/\.md$/, ""),
      title: exampleTitleFromContent(content, file),
    };
  });
}

/** 按 id 读取单题正文（按需加载）。 */
export function readExampleById(
  subjectId: string,
  chapterId: string,
  sectionId: string,
  exampleId: string,
): ExampleDetail | null {
  const dir = examplesDir(subjectId, chapterId, sectionId);
  if (!dir || !isSafeExampleId(exampleId)) return null;
  const filePath = path.join(/* turbopackIgnore: true */ dir, `${exampleId}.md`);
  try {
    const content = fs.readFileSync(/* turbopackIgnore: true */ filePath, "utf8");
    return {
      id: exampleId,
      title: exampleTitleFromContent(content, `${exampleId}.md`),
      content,
    };
  } catch {
    return null;
  }
}

/**
 * 读取某小节下的所有例题（含正文；导出/兼容用）。
 */
export function readExamples(
  subjectId: string,
  chapterId: string,
  sectionId: string,
): ExampleMeta[] {
  return readExamplesMeta(subjectId, chapterId, sectionId).map((meta) => {
    const detail = readExampleById(subjectId, chapterId, sectionId, meta.id);
    return detail ?? { ...meta, content: "" };
  });
}
