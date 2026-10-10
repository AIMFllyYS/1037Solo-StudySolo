"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { fadeInUpVariants } from "@/lib/motion";
import {
  Settings,
  Trophy,
  BarChart3,
  Layers,
  Repeat,
  Trash2,
  Palette,
  Keyboard,
  SlidersHorizontal,
  LogIn,
  LogOut,
  GraduationCap,
  Gauge,
} from "lucide-react";
import { useAuthSession } from "@/lib/hooks/auth/useAuthSession";
import { useStore } from "@/lib/stores/ui";
import AcademicYearSwitcher from "../navigation/AcademicYearSwitcher";
import UserAvatar from "../UserAvatar";
import AccountDialog from "../AccountDialog";
import { AccountQuota } from "@/components/chat/billing/AccountQuota";
import { StorageQuotaBlock } from "@/components/chat/billing/StorageQuota";
import { useAccountProfile } from "@/lib/hooks/auth/useAccountProfile";
import { ACADEMIC_YEAR_LABELS } from "@/lib/constants/academic-year";
import { useAcademicYear } from "@/lib/stores/academicYear";
import { navTree } from "@/lib/content-data/nav";
import SubjectIcon from "@/components/shared/SubjectIcon";
import { useTheme } from "@/lib/stores/theme";
import { FONT_CHOICES } from "@/lib/theme/appearance";
import {
  getAllProgress,
  getGlobalSummary,
  clearAllProgress,
  chapterLabel,
  compareChapter,
  scoreGrade,
  objectiveAccuracyOf,
  objectiveAttemptsOf,
  objectiveBestOf,
  type ProgressEntry,
} from "@/lib/quiz-progress";
import AppearanceSettingsControls, { APPEARANCE_LABEL_KEYS } from "./AppearanceSettingsControls";
import SettingsSection from "./SettingsSection";
import KeyboardShortcutsSettings from "./KeyboardShortcutsSettings";
import { useT } from "@/lib/i18n/index";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";
import { useKeyboardSettings } from "@/lib/keyboard/useKeyboardSettings";
import { SHORTCUTS } from "@/lib/keyboard/shortcuts";

const SUBJECT_NAME: Record<string, string> = Object.fromEntries(
  navTree.subjects.map((s) => [s.id, s.name]),
);
const SUBJECT_ORDER: string[] = navTree.subjects.map((s) => s.id);

interface SubjectGroup {
  id: string;
  name: string;
  items: ProgressEntry[];
  avgBest: number;
}

/** 把扁平成绩按科目分组、排序，并算各科平均最佳分。 */
function groupBySubject(entries: ProgressEntry[]): SubjectGroup[] {
  const byId = new Map<string, ProgressEntry[]>();
  for (const e of entries) {
    const arr = byId.get(e.subjectId) ?? [];
    arr.push(e);
    byId.set(e.subjectId, arr);
  }
  const ids = [...byId.keys()].sort((a, b) => {
    const ia = SUBJECT_ORDER.indexOf(a);
    const ib = SUBJECT_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return ids.map((id) => {
    const items = (byId.get(id) ?? []).slice().sort((a, b) => compareChapter(a.chapterId, b.chapterId));
    const objectiveBests = items.map((entry) => objectiveBestOf(entry.progress)).filter((value): value is number => value !== null);
    const avgBest = objectiveBests.length
      ? Math.round((objectiveBests.reduce((acc, value) => acc + value, 0) / objectiveBests.length) * 10) / 10
      : 0;
    return {
      id,
      name: SUBJECT_NAME[id] ?? id,
      items,
      avgBest,
    };
  });
}

/** 根据 subjectId + chapterId 在内容树中查找可导航的路由（categoryId + itemId）。 */
function findChapterRoute(subjectId: string, chapterId: string): { categoryId: string; itemId: string } | null {
  const subject = navTree.subjects.find((s) => s.id === subjectId);
  if (!subject) return null;
  for (const category of subject.categories) {
    for (const item of category.items) {
      if (item.id === chapterId) {
        if (item.children?.length) {
          return { categoryId: category.id, itemId: item.children[0].id };
        }
        return { categoryId: category.id, itemId: chapterId };
      }
    }
  }
  return null;
}

function StatCard({
  icon,
  value,
  label,
  accent,
  flat = false,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  accent?: string;
  /** 桌面弹出面板里去掉卡片外壳，只留一行数字，避免菜单里再套卡片。 */
  flat?: boolean;
}) {
  if (flat) {
    return (
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5" style={{ color: accent ?? "var(--md-sys-color-primary)" }}>
          {icon}
          <span className="text-[15px] font-bold leading-none">{value}</span>
        </span>
        <span className="text-[10.5px] text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
      </div>
    );
  }
  return (
    <div
      className="flex flex-1 flex-col gap-1 rounded-[var(--md-sys-shape-corner-large,16px)] px-3.5 py-3"
      style={{
        background: "var(--md-sys-color-surface-container)",
        border: "1px solid var(--md-sys-color-outline-variant)",
      }}
    >
      <span className="flex items-center gap-1.5" style={{ color: accent ?? "var(--md-sys-color-primary)" }}>
        {icon}
        <span className="text-[20px] font-extrabold leading-none">{value}</span>
      </span>
      <span className="text-[11.5px] text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
    </div>
  );
}

function ScoreBadge({ percent }: { percent: number }) {
  const grade = scoreGrade(percent);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums"
      style={{ color: grade.color, background: `color-mix(in srgb, ${grade.color} 14%, transparent)` }}
      title={grade.label}
    >
      {percent}
    </span>
  );
}

interface PopoverPos {
  left: number;
  bottom: number;
  width: number;
  maxHeight: number;
}

/** 由锚点按钮计算「在其上方弹出」的浮层位置（向上生长，靠左对齐，视口内夹取）。 */
function computePos(anchor: HTMLElement | null): PopoverPos {
  const gap = 8;
  const margin = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const width = Math.min(352, vw - margin * 2);
  if (!anchor) {
    return { left: margin, bottom: 48, width, maxHeight: vh - 64 };
  }
  const r = anchor.getBoundingClientRect();
  let left = r.left;
  if (left + width > vw - margin) left = vw - margin - width;
  if (left < margin) left = margin;
  return {
    left,
    bottom: Math.max(margin, vh - r.top + gap),
    width,
    maxHeight: Math.max(160, r.top - gap - margin),
  };
}

/**
 * 全局「设置」面板：以学习成绩为核心，外加外观与数据管理。
 * 桌面锚定在侧栏底部「设置」按钮上方弹出；手机设置页以 `variant="page"` 全屏复用同一份内容。
 */
export default function GlobalSettings({
  onClose,
  anchorRef,
  variant = "popover",
}: {
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  variant?: "popover" | "page";
}) {
  const page = variant === "page";
  const t = useT();
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const appearance = useTheme((s) => s.appearance);
  const setAppearanceMode = useTheme((s) => s.setAppearanceMode);
  const setCustomAppearance = useTheme((s) => s.setCustomAppearance);
  const resetAppearance = useTheme((s) => s.resetAppearance);
  const router = useRouter();
  const { status: authStatus, email: authEmail, signOut } = useAuthSession();
  const account = useAccountProfile();
  const openLoginOverlay = useStore((s) => s.openLoginOverlay);

  const [entries, setEntries] = useState<ProgressEntry[]>(() => getAllProgress());
  const [confirmClear, setConfirmClear] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [openSection, setOpenSection] = useState<"year" | "scores" | "keyboard" | "appearance" | "quota" | null>(null);
  const openAgentSettings = useStore((s) => s.openAgentSettings);
  const academicYear = useAcademicYear((s) => s.year);
  const [pos, setPos] = useState<PopoverPos>(() => computePos(null));
  const panelRef = useRef<HTMLDivElement>(null);

  const toggleSection = useCallback((id: "year" | "scores" | "keyboard" | "appearance" | "quota") => {
    setOpenSection((prev) => (prev === id ? null : id));
  }, []);

  useOverlayRegistration({ id: "global-settings", open: !page, onClose, priority: 50 });

  // 定位：打开时即算，并随窗口尺寸 / 滚动更新。
  // 浅比较后写回：滚动事件用捕获阶段监听，会收到面板内部滚动，
  // 无脑 setPos 会让每次滚动都重渲染整棵面板（动画进行中尤其有害）。
  useLayoutEffect(() => {
    if (page) return;
    const update = () =>
      setPos((prev) => {
        const next = computePos(anchorRef?.current ?? null);
        return prev.left === next.left &&
          prev.bottom === next.bottom &&
          prev.width === next.width &&
          prev.maxHeight === next.maxHeight
          ? prev
          : next;
      });
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, page]);

  // 点击外部关闭（无遮罩层，靠监听实现，不影响页面交互）。Esc 由全局 overlay 栈处理。
  useEffect(() => {
    if (page) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef?.current?.contains(t)) return;
      if (document.getElementById("studysolo-account-dialog")?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose, anchorRef, page]);

  const summary = useMemo(() => getGlobalSummary(entries), [entries]);
  const groups = useMemo(() => groupBySubject(entries), [entries]);
  const keyboardEnabledCount = useKeyboardSettings((s) => SHORTCUTS.length - s.disabledShortcuts.length);

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearAllProgress();
    setEntries([]);
    setConfirmClear(false);
  };

  const handleOpenAgentSettings = () => {
    if (!page) onClose();
    openAgentSettings();
  };

  const node = (
    <motion.div
      ref={panelRef}
      role={page ? "region" : "dialog"}
      aria-label={t("settings.global.title")}
      data-testid={page ? "global-settings-page" : "global-settings-popover"}
      initial={page ? false : "initial"}
      animate="animate"
      variants={fadeInUpVariants}
      className={
        page
          ? "global-settings-page flex h-full min-h-0 w-full flex-col overflow-hidden"
          : "fixed z-[9998] flex flex-col overflow-hidden rounded-[14px]"
      }
      style={
        page
          ? {
              background: "var(--md-sys-color-surface-container-low)",
            }
          : {
              left: pos.left,
              bottom: pos.bottom,
              width: pos.width,
              maxHeight: pos.maxHeight,
              transformOrigin: "left bottom",
              background: "var(--md-sys-color-surface-container-low)",
              border: "1px solid var(--md-sys-color-outline-variant)",
              boxShadow: "var(--md-sys-elevation-level3, 0 8px 24px rgba(0,0,0,0.32))",
            }
      }
    >
        {/* 桌面弹出面板：顶部就是用户信息，整行点击进入账户（右侧齿轮即跳转入口）。 */}
        {page ? null : (
          <>
            <button
              type="button"
              data-testid="account-header"
              aria-label={t("settings.global.viewAccount")}
              onClick={() => setAccountOpen(true)}
              className="flex shrink-0 items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--md-sys-color-surface-container-high)]"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
            >
              <UserAvatar
                name={account.nickname}
                email={account.email ?? authEmail}
                imageSrc={account.avatarSrc}
                signedIn={authStatus === "signedIn"}
                size={30}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-[var(--md-sys-color-on-surface)]">
                  {account.nickname}
                </span>
                <span className="block truncate text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  {account.membership}
                </span>
              </span>
              <Settings size={15} className="shrink-0 text-[var(--md-sys-color-on-surface-variant)]" />
            </button>
            <div className="app-menu-separator" />
          </>
        )}

        {/* 手机全屏设置页保留标题栏。 */}
        {page ? (
          <div
            className="flex shrink-0 items-center justify-between px-3.5 py-2.5"
            style={{
              borderBottom: "1px solid var(--md-sys-color-outline-variant)",
              background: "var(--md-sys-color-surface-container)",
            }}
          >
            <div className="flex items-center gap-1.5">
              <Settings size={14} className="text-[var(--md-sys-color-primary)]" />
              <span className="text-[13px] font-bold text-[var(--md-sys-color-on-surface)]">{t("settings.global.title")}</span>
            </div>
          </div>
        ) : null}

        <div className={page
          ? "min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
          : "min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"}>
        <div className={page ? "flex flex-col gap-2.5" : "flex flex-col"}>
          {page ? (
          <div
            data-testid="account-card"
            className="flex items-center justify-between gap-2.5 rounded-[14px] bg-[var(--md-sys-color-surface-container)] px-3 py-2"
            style={{ border: "1px solid var(--md-sys-color-outline-variant)" }}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
              onClick={() => setAccountOpen(true)}
              aria-label={t("settings.global.viewAccount")}
            >
              <UserAvatar
                name={account.nickname}
                email={account.email ?? authEmail}
                imageSrc={account.avatarSrc}
                signedIn={authStatus === "signedIn"}
                size={34}
              />
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">
                  {account.nickname}
                </div>
                <div className="truncate text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  {account.membership}
                </div>
              </div>
            </button>
            {authStatus === "signedIn" ? (
              <button
                type="button"
                aria-label={t("settings.global.signOut")}
                onClick={() => void signOut()}
                className="press flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                style={{
                  background: "var(--md-sys-color-primary)",
                  color: "var(--md-sys-color-on-primary)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <LogOut size={14} />
                {t("settings.global.signOut")}
              </button>
            ) : (
              <button
                type="button"
                aria-label={t("settings.global.signIn")}
                onClick={() => {
                  openLoginOverlay();
                  onClose();
                }}
                className="press flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                style={{
                  background: "var(--md-sys-color-primary)",
                  color: "var(--md-sys-color-on-primary)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <LogIn size={14} />
                {t("settings.global.signIn")}
              </button>
            )}
          </div>
          ) : null}

          {/* 额度与手机设置页共用同一段：桌面弹出面板里默认收起，展开走有界滚动折叠。 */}
          <SettingsSection
            variant={page ? "card" : "menu"}
            title={t("settings.global.quota")}
            icon={<Gauge size={16} />}
            open={openSection === "quota"}
            onToggle={() => toggleSection("quota")}
            summary={t("settings.global.quotaSummary")}
            testId="mobile-settings-quota"
          >
            <div className="flex flex-col gap-3">
              <AccountQuota variant="panel" />
              <div>
                <div className="mb-1.5 text-[12px] font-semibold text-[var(--md-sys-color-on-surface)]">{t("settings.global.storageQuota")}</div>
                <StorageQuotaBlock />
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            variant={page ? "card" : "menu"}
            title={t("settings.global.year")}
            icon={<GraduationCap size={16} />}
            open={openSection === "year"}
            onToggle={() => toggleSection("year")}
            summary={ACADEMIC_YEAR_LABELS[academicYear]}
          >
            <AcademicYearSwitcher />
          </SettingsSection>

          <SettingsSection
            variant={page ? "card" : "menu"}
            title={t("settings.global.scores")}
            icon={<Trophy size={16} />}
            open={openSection === "scores"}
            onToggle={() => toggleSection("scores")}
            summary={
              summary.chapters
                ? t("settings.scores.summary", {
                    chapters: summary.chapters,
                    avg: summary.avgBest,
                    attempts: summary.totalAttempts,
                  })
                : t("settings.scores.empty")
            }
          >
            <div className="flex flex-col gap-3">
              <div className="flex gap-2.5">
                <StatCard icon={<Layers size={15} />} value={summary.chapters} label={t("settings.scores.chapters")} flat={!page} />
                <StatCard
                  icon={<BarChart3 size={15} />}
                  value={summary.chapters ? summary.avgBest : "—"}
                  label={t("settings.scores.avgBest")}
                  accent={summary.chapters ? scoreGrade(summary.avgBest).color : undefined}
                  flat={!page}
                />
                <StatCard icon={<Repeat size={15} />} value={summary.totalAttempts} label={t("settings.scores.attempts")} flat={!page} />
              </div>

              {groups.length === 0 ? (
                <div
                  className={page
                    ? "rounded-[var(--md-sys-shape-corner-large,16px)] px-4 py-6 text-center text-[12.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]"
                    : "px-0.5 py-1.5 text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]"}
                  style={page ? { background: "var(--md-sys-color-surface-container-lowest)" } : undefined}
                >
                  {t("settings.scores.emptyTitle")}
                  <br />
                  {t("settings.scores.emptyHint")}
                </div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {groups.map((g) => {
                    return (
                      <div key={g.id} className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 px-0.5">
                          <SubjectIcon subjectId={g.id} size={15} style={{ color: "var(--md-sys-color-primary)" }} />
                          <span className="text-[13px] font-bold text-[var(--md-sys-color-on-surface)]">
                            {g.name}
                          </span>
                          <span className="text-[11.5px] text-[var(--md-sys-color-on-surface-variant)]">
                            {t("settings.scores.chapterCount", { count: g.items.length })}
                          </span>
                          <span className="ml-auto text-[11.5px] text-[var(--md-sys-color-on-surface-variant)]">
                            {t("settings.scores.avgBestShort")}
                          </span>
                          <ScoreBadge percent={g.avgBest} />
                        </div>
                        <div
                          className="flex flex-col overflow-hidden rounded-[var(--md-sys-shape-corner-large,16px)]"
                          style={{ border: "1px solid var(--md-sys-color-outline-variant)" }}
                        >
                          {g.items.map((e, i) => {
                            const route = findChapterRoute(e.subjectId, e.chapterId);
                            const objectiveAccuracy = objectiveAccuracyOf(e.progress);
                            const objectiveAttempts = objectiveAttemptsOf(e.progress);
                            const objectiveBest = objectiveBestOf(e.progress) ?? objectiveAccuracy;
                            return (
                              <div
                                key={e.chapterId}
                                onClick={() => {
                                  if (!route) return;
                                  router.push(`/${e.subjectId}/${route.categoryId}/${route.itemId}`);
                                  onClose();
                                }}
                                className="flex items-center gap-3 px-3 py-2 transition-colors"
                                style={{
                                  background:
                                    i % 2 === 0
                                      ? "var(--md-sys-color-surface-container-lowest)"
                                      : "var(--md-sys-color-surface-container)",
                                  cursor: route ? "pointer" : "default",
                                }}
                              >
                                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--md-sys-color-on-surface)]">
                                  {chapterLabel(e.chapterId)}
                                </span>
                                <span className="shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                                  {objectiveAccuracy == null
                                    ? t("settings.scores.lastUnscored")
                                    : t("settings.scores.lastAttempt", { percent: objectiveAccuracy, attempts: objectiveAttempts })}
                                </span>
                                {objectiveAttempts === 0
                                  ? <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">{t("settings.scores.lastUnscored")}</span>
                                  : <ScoreBadge percent={objectiveBest ?? 0} />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={page
                ? "flex items-center justify-between gap-3 rounded-[var(--md-sys-shape-corner-large,16px)] bg-[var(--md-sys-color-surface-container-lowest)] px-3.5 py-2.5"
                : "flex items-center justify-between gap-3 py-1"}>
                <div className="min-w-0">
                  <div className={page
                    ? "text-[13px] font-medium text-[var(--md-sys-color-on-surface)]"
                    : "text-[11.5px] font-medium text-[var(--md-sys-color-on-surface)]"}>
                    {t("settings.scores.clear")}
                  </div>
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    {t("settings.scores.clearDesc")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={summary.chapters === 0 && !confirmClear}
                  className="press flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-40"
                  style={{
                    background: confirmClear
                      ? "var(--md-sys-color-error)"
                      : "var(--md-sys-color-surface-container-highest)",
                    color: confirmClear
                      ? "var(--md-sys-color-on-error)"
                      : "var(--md-sys-color-error)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={14} />
                  {t(confirmClear ? "settings.scores.clearConfirm" : "settings.scores.clearAction")}
                </button>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            variant={page ? "card" : "menu"}
            title={t("settings.global.keyboard")}
            icon={<Keyboard size={16} />}
            open={openSection === "keyboard"}
            onToggle={() => toggleSection("keyboard")}
            summary={t("settings.keyboard.enabled", { enabled: keyboardEnabledCount, total: SHORTCUTS.length })}
          >
            <KeyboardShortcutsSettings />
          </SettingsSection>

          <SettingsSection
            variant={page ? "card" : "menu"}
            title={t("settings.global.appearance")}
            icon={<Palette size={16} />}
            open={openSection === "appearance"}
            onToggle={() => toggleSection("appearance")}
            summary={t("settings.appearance.summary", {
              theme: t(theme === "light" ? "settings.appearance.light" : "settings.appearance.dark"),
              mode: t(APPEARANCE_LABEL_KEYS[appearance.mode]),
              font: t(FONT_CHOICES[appearance.custom.font].labelKey),
            })}
          >
            <AppearanceSettingsControls
              theme={theme}
              setTheme={setTheme}
              appearance={appearance}
              setAppearanceMode={setAppearanceMode}
              setCustomAppearance={setCustomAppearance}
              resetAppearance={resetAppearance}
            />
          </SettingsSection>

          {page ? (
          <div className="flex items-center justify-between gap-3 rounded-[var(--md-sys-shape-corner-large,16px)] bg-[var(--md-sys-color-surface-container)] px-3.5 py-2.5"
            style={{ border: "1px solid var(--md-sys-color-outline-variant)" }}
          >
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
                {t("settings.global.openAgent")}
              </div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                {t("settings.global.openAgentDesc")}
              </div>
            </div>
            <button
              type="button"
              aria-label={t("settings.global.openAgent")}
              onClick={handleOpenAgentSettings}
              className="press flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
              style={{
                background: "var(--md-sys-color-primary)",
                color: "var(--md-sys-color-on-primary)",
                border: "none",
                cursor: "pointer",
              }}
            >
              <SlidersHorizontal size={14} />
              {t("settings.global.open")}
            </button>
          </div>
          ) : (
            <>
              <div className="app-menu-separator" />
              <button
                type="button"
                aria-label={t("settings.global.openAgent")}
                onClick={handleOpenAgentSettings}
                className="app-menu-item"
              >
                <span className="app-menu-check"><SlidersHorizontal size={14} /></span>
                <span>{t("settings.global.openAgent")}</span>
              </button>
            </>
          )}
        </div>
        </div>

        {/* 桌面弹出面板：底部退出 / 登录。 */}
        {page ? null : (
          <>
            <div className="app-menu-separator" />
            <div className="shrink-0 px-1.5 pb-1.5">
              {authStatus === "signedIn" ? (
                <button
                  type="button"
                  aria-label={t("settings.global.signOutFull")}
                  onClick={() => void signOut()}
                  className="app-menu-item"
                >
                  <span className="app-menu-check"><LogOut size={14} /></span>
                  <span>{t("settings.global.signOutFull")}</span>
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={t("settings.global.signIn")}
                  onClick={() => {
                    openLoginOverlay();
                    onClose();
                  }}
                  className="app-menu-item"
                >
                  <span className="app-menu-check"><LogIn size={14} /></span>
                  <span>{t("settings.global.signIn")}</span>
                </button>
              )}
            </div>
          </>
        )}
    </motion.div>
  );

  const accountDialog = accountOpen ? (
    <AccountDialog onClose={() => setAccountOpen(false)} />
  ) : null;

  if (page) {
    return (
      <>
        {node}
        {accountDialog}
      </>
    );
  }
  if (typeof document === "undefined") return null;
  return (
    <>
      {createPortal(node, document.body)}
      {accountDialog}
    </>
  );
}
