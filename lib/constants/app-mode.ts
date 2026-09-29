/**
 * StudySolo 三模式（Studio / Agent / Class）的路由与 persist 约定。
 * 其它代理请读本文件 + `lib/stores/appMode.ts`，不要另写一份模式表。
 *
 * 路径归属（全仓唯一口径）：
 * - Agent：`/agent`（工作区根）**和** `/c/<sessionId>`（一条对话的深链，打开后同样是 Agent 工作区，
 *   只是额外把那条对话设为当前对话）；
 * - Class：`/class`；
 * - Studio：其余路由；
 * - `/login` 不参与判定（isAuthPath），避免登录页改写 persist。
 *
 * `/s/<shareId>` 分享公开页**不属于任何模式**：它是独立公开页，裸壳由 AppShell 自己分支，
 * 所以不要为了让它的外壳不同而把 `s` 并进 Agent。
 */

export const APP_MODES = ["studio", "agent", "class", "review"] as const;
export type AppMode = (typeof APP_MODES)[number];

export const DEFAULT_APP_MODE: AppMode = "studio";
export const DEFAULT_STUDIO_PATH = "/";

/** 对外品牌名。顶栏默认文案是「StudySolo · Studio」。 */
export const APP_NAME = "StudySolo";

export const APP_MODE_LABELS: Record<AppMode, string> = {
  studio: "Studio",
  agent: "Agent",
  class: "Class",
  review: "Review",
};

export const APP_MODE_PATHS: Record<AppMode, string> = {
  studio: "/",
  agent: "/agent",
  class: "/class",
  review: "/review",
};

/** localStorage 键。值为 JSON：`{ mode, lastStudioPath }`。 */
export const APP_MODE_STORAGE_KEY = "studysolo-app-mode";

export interface AppModePersist {
  mode: AppMode;
  lastStudioPath: string;
}

export function isAppMode(value: unknown): value is AppMode {
  return typeof value === "string" && (APP_MODES as readonly string[]).includes(value);
}

export function parseAppMode(value: unknown): AppMode {
  return isAppMode(value) ? value : DEFAULT_APP_MODE;
}

function firstSegment(pathname: string): string | undefined {
  return pathname.split("/").filter(Boolean)[0];
}

/** `/login` 不参与模式路由，避免登录页改写 persist。 */
export function isAuthPath(pathname: string): boolean {
  return firstSegment(pathname) === "login" || pathname.startsWith("/auth/");
}

/** 不套 Studio 顶栏 + 左栏 + 右栏的路径：`/c/<id>` 与 `/agent` 共用同一个工作区外壳。 */
export function isAppModePath(pathname: string): boolean {
  const first = firstSegment(pathname);
  return first === "agent" || first === "class" || first === "c" || first === "review";
}

/**
 * 从 URL 解析模式。
 * - `/agent`、`/c/<sessionId>` → agent（C 路由就是 Agent 工作区里的单条对话）
 * - `/class` → class
 * - `/review` → review（复习工作区：笔记 / 闪卡 / 答题）
 * - `/login` → null（不改 persist）
 * - 其余 Studio 路由（含分享页 `/s/<id>`、`/<subject>/review/...` 学科复习页）→ studio
 */
export function appModeFromPathname(pathname: string): AppMode | null {
  const first = firstSegment(pathname);
  if (first === "agent" || first === "c") return "agent";
  if (first === "class") return "class";
  if (first === "review") return "review";
  if (isAuthPath(pathname)) return null;
  return "studio";
}

/** 桌面 Studio 三栏壳：登录页保持现布局，Agent（`/agent`、`/c/<id>`）与 Class 走独立工作区。 */
export function usesStudioChrome(pathname: string): boolean {
  return !isAppModePath(pathname);
}

/**
 * 手机壳：Agent 仍用最初 Studio 五段底栏，不套桌面左对话+右侧窗。
 * `/c/<id>` 与 `/agent` 同口径（都算 Agent）；Class / Review 继续独立页（各自的移动布局）。
 */
export function usesMobileStudioChrome(pathname: string): boolean {
  const first = firstSegment(pathname);
  return first !== "class" && first !== "review";
}

export function resolveAppMode(pathname: string, persisted: AppMode): AppMode {
  return appModeFromPathname(pathname) ?? (isAuthPath(pathname) ? "studio" : persisted);
}

/**
 * 手机标题/persist：Studio 路由上若当前 persist 是 Agent，仍显示 Agent。
 * `/agent` 与 `/c/<id>` 都直接判成 agent；Class / 登录仍跟 URL。
 */
export function resolveMobileAppMode(pathname: string, persisted: AppMode): AppMode {
  const fromPath = appModeFromPathname(pathname);
  if (fromPath === "class") return "class";
  if (fromPath === "review") return "review";
  if (fromPath === "agent") return "agent";
  if (fromPath === null) return isAuthPath(pathname) ? "studio" : persisted;
  return persisted === "agent" ? "agent" : "studio";
}

export function isRememberableStudioPath(pathname: string): boolean {
  return appModeFromPathname(pathname) === "studio";
}

export function hrefForAppMode(mode: AppMode, lastStudioPath: string): string {
  if (mode !== "studio") return APP_MODE_PATHS[mode];
  if (lastStudioPath && isRememberableStudioPath(lastStudioPath)) return lastStudioPath;
  return DEFAULT_STUDIO_PATH;
}

/** 手机切 Agent 留在 Studio 路由，避免进入桌面 Agent 工作区。 */
export function hrefForMobileAppMode(mode: AppMode, lastStudioPath: string): string {
  if (mode === "class") return APP_MODE_PATHS.class;
  if (mode === "review") return APP_MODE_PATHS.review;
  return hrefForAppMode("studio", lastStudioPath);
}

/** 顶栏默认展示：项目名 + 间隔点 + 当前模式。 */
export function appModeTitle(mode: AppMode): string {
  return `${APP_NAME} · ${APP_MODE_LABELS[mode]}`;
}

export function parseAppModePersist(raw: string | null | undefined): AppModePersist {
  const fallback: AppModePersist = {
    mode: DEFAULT_APP_MODE,
    lastStudioPath: DEFAULT_STUDIO_PATH,
  };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const rec = parsed as Record<string, unknown>;
      const lastStudioPath =
        typeof rec.lastStudioPath === "string" && isRememberableStudioPath(rec.lastStudioPath)
          ? rec.lastStudioPath
          : DEFAULT_STUDIO_PATH;
      return { mode: parseAppMode(rec.mode), lastStudioPath };
    }
  } catch {
    if (isAppMode(raw)) return { mode: raw, lastStudioPath: DEFAULT_STUDIO_PATH };
  }
  return fallback;
}
