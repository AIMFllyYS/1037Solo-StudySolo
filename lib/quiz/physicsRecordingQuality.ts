import type { QuizData, QuizQuestion } from "@/lib/quiz/types";
import { physicsLectures } from "@/lib/content-data/subjects/physics/physics-lectures";
import { recordingIds } from "@/lib/content-data/recordings";

/** 物理录音题库允许的 chapterId：直接取自 manifest 的讲次声明，不再手抄白名单。 */
export const PHYSICS_RECORDING_IDS: readonly string[] = recordingIds(physicsLectures);

export interface PhysicsRecordingQuizQualityOptions {
  filePath: string;
  strictStyle?: boolean;
}

export interface PhysicsRecordingQuizQualityResult {
  errors: string[];
  warnings: string[];
}

const BANNED_STEM_PATTERNS = [
  /根据录音/,
  /参考录音/,
  /录音内容/,
  /本段录音/,
  /课堂录音/,
  /老师在录音/,
];

const TEACHER_STYLE_PATTERNS = [
  /老师(?:明确)?(?:说|指出|强调|讲到|提到)/,
  /课堂(?:上)?(?:说|指出|强调|讲到|提到)/,
];

const RAW_SVG_PATTERN = /<svg\b/i;

function pushIssue(list: string[], q: QuizQuestion, message: string): void {
  list.push(`${q.id}: ${message}`);
}

function hasAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function ensureRequiredText(
  errors: string[],
  q: QuizQuestion,
  field: "stem" | "hint" | "explanation",
  value: unknown,
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    pushIssue(errors, q, `${field} 不能为空`);
  }
}

function sourceRefPathFor(chapterId: string): string {
  return `content/physics/recording/${chapterId}.md`;
}

function textFieldsOf(q: QuizQuestion): string[] {
  const values: string[] = [];
  for (const value of [q.stem, q.hint, q.explanation, q.reasoning]) {
    if (typeof value === "string") values.push(value);
  }
  if (typeof q.answer === "string") values.push(q.answer);
  for (const option of q.options ?? []) values.push(option);
  return values;
}

export function validatePhysicsRecordingQuiz(
  quiz: QuizData,
  options: PhysicsRecordingQuizQualityOptions,
): PhysicsRecordingQuizQualityResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const strictStyle = options.strictStyle ?? false;

  if (quiz.subjectId !== "physics") {
    errors.push(`subjectId 应为 physics，实际为 ${quiz.subjectId}`);
  }

  if (!PHYSICS_RECORDING_IDS.includes(quiz.chapterId)) {
    errors.push(`chapterId 不在 physics-lectures.ts 声明的讲次内: ${quiz.chapterId}`);
  }

  if (!Array.isArray(quiz.questions)) {
    errors.push("questions 应为数组");
    return { errors, warnings };
  }

  if (quiz.questions.length !== 24) {
    warnings.push(`题量应为 24，实际为 ${quiz.questions.length}`);
  }

  const expectedSourcePath = sourceRefPathFor(quiz.chapterId);

  for (const q of quiz.questions) {
    ensureRequiredText(errors, q, "stem", q.stem);
    ensureRequiredText(errors, q, "hint", q.hint);
    ensureRequiredText(errors, q, "explanation", q.explanation);

    if (q.source !== "current_chapter") {
      pushIssue(errors, q, `录音题 source 应为 current_chapter，实际为 ${q.source}`);
    }

    if (q.sourceChapter && q.sourceChapter !== quiz.chapterId) {
      pushIssue(errors, q, `sourceChapter 应为 ${quiz.chapterId}，实际为 ${q.sourceChapter}`);
    }

    if (typeof q.stem === "string" && hasAnyPattern(q.stem, BANNED_STEM_PATTERNS)) {
      pushIssue(errors, q, "题干含禁用录音依赖表达");
    }

    if (textFieldsOf(q).some((text) => RAW_SVG_PATTERN.test(text))) {
      pushIssue(errors, q, "禁止内联裸 SVG，请改用静态 SVG 文件和 ::figure 引用");
    }

    const explanation = typeof q.explanation === "string" ? q.explanation : "";
    if (hasAnyPattern(explanation, TEACHER_STYLE_PATTERNS)) {
      const issue = `${q.id}: 解析含口语化课堂依据`;
      if (strictStyle) errors.push(issue);
      else warnings.push(issue);
    }

    if (!q.sourceRef?.path || q.sourceRef.path !== expectedSourcePath) {
      pushIssue(errors, q, `sourceRef.path 应指向当前录音文件 ${expectedSourcePath}`);
    }

    if (!q.sourceRef?.label || !q.sourceRef.label.includes(quiz.chapterId)) {
      pushIssue(errors, q, "sourceRef.label 应包含当前 rec 编号");
    }

    if (q.type === "essay") {
      if (typeof q.answer !== "string" || q.answer.trim().length === 0) {
        pushIssue(errors, q, "essay 题 answer 不能为空");
      }
      if (!Array.isArray(q.scoring_criteria) || q.scoring_criteria.length === 0) {
        pushIssue(errors, q, "essay 题需 scoring_criteria");
      }
    }
  }

  if (quiz.summary && quiz.summary.totalQuestions !== quiz.questions.length) {
    errors.push(`summary.totalQuestions 与 questions.length 不一致: ${quiz.summary.totalQuestions} !== ${quiz.questions.length}`);
  }

  return { errors, warnings };
}
