import { DEFAULT_MODEL_ID } from "@/lib/ai/models";
import { useSettings } from "@/lib/stores/settings";

/** 设置页「默认答题模型」将对齐此 key；未写入时回退 DeepSeek。 */
export const QUIZ_EXPLAIN_MODEL_KEY = "quizExplainModel";
export const DEFAULT_QUIZ_EXPLAIN_MODEL = DEFAULT_MODEL_ID;

function readStoredModel(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(QUIZ_EXPLAIN_MODEL_KEY)?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

function readSettingsQuizModel(): string | null {
  try {
    const settings = useSettings.getState() as { quizExplainModel?: string; quizModelId?: string };
    const id = settings.quizExplainModel?.trim() || settings.quizModelId?.trim();
    return id || null;
  } catch {
    return null;
  }
}

/** 深度解析窗模型：`quizExplainModel` → 设置 store 答题模型 → DeepSeek。 */
export function getQuizExplainModelId(): string {
  return readStoredModel() ?? readSettingsQuizModel() ?? DEFAULT_QUIZ_EXPLAIN_MODEL;
}

export function setQuizExplainModelId(id: string): void {
  if (typeof window === "undefined") return;
  const next = id.trim();
  try {
    if (!next) window.localStorage.removeItem(QUIZ_EXPLAIN_MODEL_KEY);
    else window.localStorage.setItem(QUIZ_EXPLAIN_MODEL_KEY, next);
  } catch {
    /* ignore quota / private mode */
  }
}
