import path from "node:path";

import { contentIo, isResolvedPathInside, isSafeContentRef } from "@/lib/content/contentPathGuard";

import { findContentItem } from "./navigation";
export const CONTENT_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "content");

export function authorizeContentRead(subjectId: string, categoryId: string, itemId: string): boolean {
  if (!isSafeContentRef(subjectId, categoryId, itemId)) return false;
  return !!findContentItem(subjectId, categoryId, itemId);
}

export function readAuthorizedFile(filePath: string, rootDir: string): string | null {
  if (!isResolvedPathInside(filePath, rootDir)) return null;
  try {
    return contentIo.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 例题读取（与正文一致走服务端 SSR；/api/examples 仅作客户端回退/兼容）
// ─────────────────────────────────────────────────────────────

export const EXAMPLES_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "content", "examples");

// ─────────────────────────────────────────────────────────────
// 题目测试读取（content/quiz/{subjectId}/{chapterId}.json）
// 由 /api/quiz 客户端读取；非 .md 文件，不走 readContentMarkdown。
// ─────────────────────────────────────────────────────────────

export const QUIZ_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "content", "quiz");
