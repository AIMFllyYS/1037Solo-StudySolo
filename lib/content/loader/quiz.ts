import fs from "node:fs";
import path from "node:path";

import { QUIZ_ROOT } from "./io";
/**
 * 读取某章节的题目测试 JSON（学科命名空间，防多科 chapterId 冲突）：
 * content/quiz/{subjectId}/{chapterId}.json。
 * 文件不存在 / 解析失败 / 参数为空时返回 null。
 */
export function readQuiz(subjectId: string, chapterId: string): unknown | null {
  if (!subjectId || !chapterId) return null;
  // 仅允许安全的标识符，避免路径穿越。
  if (!/^[a-zA-Z0-9_-]+$/.test(subjectId) || !/^[a-zA-Z0-9_-]+$/.test(chapterId)) {
    return null;
  }
  const file = path.join(/* turbopackIgnore: true */ QUIZ_ROOT, subjectId, `${chapterId}.json`);
  try {
    return JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf8"));
  } catch {
    return null;
  }
}
