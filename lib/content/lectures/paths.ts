// 课堂材料物理文件解析（服务端专用，可用 fs / path）。
// 只允许命中「生成目录登记过」的固定文件：路径由 articleId → lessonId/固定文件名拼出，
// 不接受任何外部传入的相对路径，并再次用 contentPathGuard 兜底，杜绝目录穿越。

import fs from "node:fs";
import path from "node:path";
import { CONTENT_ROOT } from "@/lib/content/contentPaths";
import { isResolvedPathInside } from "@/lib/content/contentPathGuard";
import { getLectureArticleForSubject } from "@/lib/content-data/lectures";
import { isValidLessonId, type LectureMaterialRole } from "@/lib/content/lectures/roles";

export interface LectureFileRef {
  absPath: string;
  lessonId: string;
  role: LectureMaterialRole;
  format: "text" | "markdown" | "html";
  file: string;
}

/** 课节目录绝对路径，并做合法性 / 越界校验。 */
export function lectureLessonDirAbs(subjectId: string, lessonId: string): string {
  if (!isValidLessonId(lessonId)) {
    throw new Error(`非法 lessonId：${lessonId}`);
  }
  const dir = path.join(/* turbopackIgnore: true */ CONTENT_ROOT, subjectId, "lectures", lessonId);
  if (!isResolvedPathInside(dir, CONTENT_ROOT)) {
    throw new Error("课节目录越界");
  }
  return dir;
}

/** 由学科 + 文章 id 解析出课堂材料文件；非课堂材料 / 学科不匹配返回 null。 */
export function resolveLectureFile(
  subjectId: string,
  articleId: string,
): LectureFileRef | null {
  const ref = getLectureArticleForSubject(subjectId, articleId);
  if (!ref) return null;
  const dir = lectureLessonDirAbs(subjectId, ref.entry.lessonId);
  const absPath = path.join(/* turbopackIgnore: true */ dir, ref.material.file);
  if (!isResolvedPathInside(absPath, dir)) {
    throw new Error("课堂材料路径越界");
  }
  return {
    absPath,
    lessonId: ref.entry.lessonId,
    role: ref.role,
    format: ref.material.format,
    file: ref.material.file,
  };
}

export interface LectureArticleContent extends LectureFileRef {
  raw: string;
}

/** 读取课堂材料原文；文件缺失返回 null（交由上层走旧路径回退 / 404）。 */
export function readLectureArticle(
  subjectId: string,
  articleId: string,
): LectureArticleContent | null {
  const file = resolveLectureFile(subjectId, articleId);
  if (!file) return null;
  if (!fs.existsSync(/* turbopackIgnore: true */ file.absPath)) return null;
  const raw = fs.readFileSync(/* turbopackIgnore: true */ file.absPath, "utf8");
  return { ...file, raw };
}
