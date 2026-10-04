"use client";

import clsx from "clsx";
import { NotebookPen, Layers, ListChecks, Gauge, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useT } from "@/lib/i18n";

export type ReviewSection = "notes" | "flashcards" | "quiz" | "overview";

const SECTION_ORDER: { id: ReviewSection; icon: typeof NotebookPen; labelKey: string }[] = [
  { id: "notes", icon: NotebookPen, labelKey: "review.sidebar.notes" },
  { id: "flashcards", icon: Layers, labelKey: "review.sidebar.flashcards" },
  { id: "quiz", icon: ListChecks, labelKey: "review.sidebar.quiz" },
  { id: "overview", icon: Gauge, labelKey: "review.sidebar.overview" },
];

/**
 * Review 模式左侧栏：与 SubjectSidebar / AgentConversationSidebar 同一套视觉语言
 * （var(--bg-panel) 面板、var(--accent-weak) 选中态、可收起）。
 * 收起后只留图标列。笔记树属于三栏文档工作区；闪卡的学科列表可通过 children 放在这里。
 * 这里主要承担一级板块切换 + 待复习计数。
 */
export default function ReviewSidebar({
  active,
  onSelect,
  collapsed,
  onToggleCollapse,
  dueCount,
  children,
  mobile = false,
  mobileOpen = false,
  onMobileClose,
}: {
  active: ReviewSection;
  onSelect: (section: ReviewSection) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  dueCount: number;
  /** 展开态时，选中板块的辅助列表（当前用于闪卡学科）。 */
  children?: React.ReactNode;
  mobile?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const t = useT();

  return (
    <aside
      data-review-sidebar
      data-mobile-open={mobileOpen || undefined}
      className={clsx(
        "ss-rail flex h-full flex-col border-r border-[var(--line-soft)] bg-[var(--bg-panel)]",
        collapsed ? "w-14 min-w-14" : "w-64 min-w-64",
      )}
      onKeyDown={(event) => {
        if (mobile && mobileOpen && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onMobileClose?.();
        }
      }}
    >
      <div className="flex items-center justify-between px-2 py-2">
        {!collapsed && (
          <span className="px-2 text-[13px] font-semibold text-[var(--ink)]">{t("review.title")}</span>
        )}
        {mobile ? (
        <button
          type="button"
          onClick={onMobileClose}
          title={t("panel.common.close")}
          aria-label={t("panel.common.close")}
          data-testid="review-mobile-sidebar-close"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
        >
          <X size={17} />
        </button>
        ) : <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? t("review.sidebar.expand") : t("review.sidebar.collapse")}
          aria-label={collapsed ? t("review.sidebar.expand") : t("review.sidebar.collapse")}
          data-testid="review-sidebar-toggle"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>}
      </div>

      <nav className="flex flex-col gap-0.5 px-2" aria-label={t("review.title")}>
        {SECTION_ORDER.map(({ id, icon: Icon, labelKey }) => {
          const selected = id === active;
          const showBadge = id === "flashcards" && dueCount > 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={selected ? "page" : undefined}
              data-testid={`review-nav-${id}`}
              title={t(labelKey)}
              className={clsx(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                collapsed && "justify-center px-0",
                selected
                  ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]"
                  : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]",
              )}
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{t(labelKey)}</span>}
              {showBadge && (
                <span
                  className={clsx(
                    "rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--md-sys-color-on-primary)]",
                    collapsed && "absolute translate-x-4 -translate-y-3",
                  )}
                >
                  {dueCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {!collapsed && children && (
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto border-t border-[var(--line-soft)]">{children}</div>
      )}
    </aside>
  );
}
