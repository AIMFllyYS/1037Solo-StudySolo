import { useWindowManager, type AgentQuizData } from "@/lib/stores/workspace/windowManager";
import { translateNow } from "@/lib/i18n";
import type { QuizQuestion } from "@/lib/quiz/types";

/** 右栏出题窗的 ManagedWindowType（窗口 type 字段）。 */
export const QUIZ_DOCK_WINDOW_TYPE = "quiz-dock" as const;

/** 「已自动打开过」的 sessionStorage 键：只存 quizId 字符串数组，刷新后用来跳过历史旧题。 */
export const QUIZ_AUTO_OPEN_STORAGE_KEY = "studysolo-agent-quiz-opened";

/** 出题窗 id：一个 quizId 一个窗，重复出题只复用不新开。 */
export function quizDockWindowId(quizId: string): string {
  return `${QUIZ_DOCK_WINDOW_TYPE}:${quizId}`;
}

export interface AgentQuizPayload {
  quizId: string;
  title: string;
  /** 出题意图：check / diagnose / practice / exam（仅展示）。 */
  intent?: string;
  questions: QuizQuestion[];
  /** 被丢弃的非法题数，给前端做提示。 */
  droppedCount?: number;
}

/**
 * 本次浏览器会话里已经「自动打开」过的 quizId。
 * 内存集合是运行期真相源，sessionStorage 只做刷新后的种子——
 * 刷完页面历史上那些旧题不会重新弹出来。
 */
let autoOpened: Set<string> | null = null;

function readAutoOpened(): Set<string> {
  try {
    const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(QUIZ_AUTO_OPEN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
  } catch {
    // 隐私模式 / 配额 / 脏数据：退化成「本次运行内存去重」，不影响作答。
    return new Set();
  }
}

function autoOpenedSet(): Set<string> {
  if (!autoOpened) autoOpened = readAutoOpened();
  return autoOpened;
}

function writeAutoOpened(ids: Set<string>): void {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(QUIZ_AUTO_OPEN_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* 写不进去就算了：最多下次刷新多自动弹一次。 */
  }
}

/** 记一次自动打开。返回 false 表示这个 quizId 之前已经自动打开过。 */
function markAutoOpened(quizId: string): boolean {
  const ids = autoOpenedSet();
  if (ids.has(quizId)) return false;
  ids.add(quizId);
  writeAutoOpened(ids);
  return true;
}

/** 测试用：清掉内存集合与 sessionStorage 种子。 */
export function resetAutoOpenedQuizzes(): void {
  autoOpened = null;
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(QUIZ_AUTO_OPEN_STORAGE_KEY);
  } catch {
    /* 隐私模式下 removeItem 也会抛，忽略。 */
  }
}

/**
 * 出题窗标题。窗口标题会经通用 chrome（任务栏 / 标签条）原样显示，
 * 所以在这里翻好再存进 windowManager —— 存 key 会让标签条直接显示 key 本身。
 */
function quizWindowTitle(title: string): string {
  const prefix = translateNow("agent.quiz.dock.title");
  const trimmed = title.trim();
  return trimmed ? `${prefix} · ${trimmed}` : prefix;
}

/** dock 形态铺满右栏、不看几何；这里只为 Studio 浮窗形态留一份可用默认值。 */
function quizGeometry() {
  if (typeof window === "undefined") return { pos: { x: 48, y: 72 }, size: { width: 760, height: 680 } };
  return {
    pos: {
      x: Math.max(16, Math.floor(window.innerWidth * 0.12)),
      y: Math.max(16, Math.floor(window.innerHeight * 0.06)),
    },
    size: {
      width: Math.min(900, Math.floor(window.innerWidth * 0.72)),
      height: Math.min(820, Math.floor(window.innerHeight * 0.86)),
    },
  };
}

/**
 * 打开（或复用）右栏出题窗 —— Agent 面「出题」的唯一入口。
 *
 * - 幂等：同 quizId 复用 `quiz-dock:<quizId>`，只更新 data / 标题并带到前台；最小化的先还原。
 * - `options.auto`：对话流里新题到达时的自动打开。同一个 quizId 在一次浏览器会话里只自动弹一次
 *   （sessionStorage 记种子），所以刷新页面后历史对话里的旧题既不重弹也不抢焦点。
 *   手动点「在右侧作答」不传这个标记：窗口被关掉后照样能再打开。
 *
 * @returns 窗口 id（`quiz-dock:<quizId>`）。自动打开被去重跳过时同样返回 id，但不改任何窗口状态。
 */
export function openAgentQuiz(payload: AgentQuizPayload, options?: { auto?: boolean }): string {
  const id = quizDockWindowId(payload.quizId);
  const wm = useWindowManager.getState();
  const existing = wm.windows.find((win) => win.id === id);

  if (options?.auto && !markAutoOpened(payload.quizId)) {
    // 已经自动弹过：什么都不做——窗口可能已被用户关掉，不重开、不抢焦点。
    return id;
  }

  const data: AgentQuizData = {
    quizId: payload.quizId,
    title: payload.title,
    intent: payload.intent,
    questions: payload.questions,
    droppedCount: payload.droppedCount,
  };
  const title = quizWindowTitle(payload.title);

  if (existing) {
    wm.updateWindow(id, { title, data });
    if (existing.minimized) wm.restoreWindow(id);
    else wm.bringToFront(id);
    return id;
  }

  const { pos, size } = quizGeometry();
  wm.openWindow({ id, type: QUIZ_DOCK_WINDOW_TYPE, title, pos, size, data });
  return id;
}
