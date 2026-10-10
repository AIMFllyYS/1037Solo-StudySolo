"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, Sun, Moon } from "lucide-react";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/stores/theme";
import { appModeFromPathname, usesMobileStudioChrome, isAgentManagementPath } from "@/lib/constants/app-mode";
import ModeSwitcher from "../navigation/ModeSwitcher";
import { getContentItem } from "@/lib/content-data/index";
import { subjectShortName } from "@/lib/content-data/subjects.registry";
import SubjectIcon from "@/components/shared/SubjectIcon";
import { useT } from "@/lib/i18n/index";

export default function MobileTopBar() {
  const pathname = usePathname() ?? "/";
  const t = useT();
  const studioChrome = usesMobileStudioChrome(pathname);
  const mode = appModeFromPathname(pathname);
  const modeOwnsSidebar = mode === "class" || mode === "review";
  const showSidebarToggle = studioChrome || modeOwnsSidebar;
  const subjectId = useStore((s) => s.activeSubjectId);
  const categoryId = useStore((s) => s.activeCategoryId);
  const itemId = useStore((s) => s.activeItemId);
  const toggleChapter = useStore((s) => s.toggleMobileChapterPicker);
  const sidebarOpen = useStore((s) => s.mobileSidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleMobileSidebar);
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);
  const hydrateTheme = useTheme((s) => s.hydrate);

  useEffect(() => {
    hydrateTheme();
  }, [hydrateTheme]);

  const item = getContentItem(subjectId, categoryId, itemId);
  const shortSubject = subjectShortName(subjectId);
  const sectionLabel = item?.title || itemId;

  return (
    <header
      className="mobile-top-bar flex shrink-0 items-center gap-1.5 border-b border-[var(--line-soft)] bg-[var(--bg-panel)] px-2"
      data-testid="mobile-top-bar"
      style={{
        minHeight: 44,
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {showSidebarToggle ? (
      <button
        type="button"
        onClick={toggleSidebar}
        id={modeOwnsSidebar ? "mode-mobile-sidebar-toggle" : undefined}
        aria-label={sidebarOpen ? t("app.topbar.collapseNav") : t("app.topbar.expandNav")}
        title={sidebarOpen ? t("app.topbar.collapseNav") : t("app.topbar.expandNav")}
        aria-expanded={sidebarOpen}
        data-testid={modeOwnsSidebar ? "mode-mobile-sidebar-toggle" : "mobile-sidebar-toggle"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] active:bg-[var(--bg-muted)]"
      >
        <Menu size={18} />
      </button>
      ) : null}

      {studioChrome ? (
      <button
        type="button"
        onClick={toggleChapter}
        data-testid="mobile-chapter-trigger"
        className={clsx(
          "press flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1.5 py-0.5",
          "bg-[var(--bg-muted)] text-[var(--ink)] transition-colors active:bg-[var(--bg-elevated)]",
        )}
      >
        <SubjectIcon subjectId={subjectId} size={13} />
        <span className="text-[12px] font-semibold text-[var(--accent)] shrink-0">
          {shortSubject}
        </span>
        <span className="mx-0.5 text-[var(--ink-faint)]">/</span>
        <span className="truncate text-[13px] font-medium">{sectionLabel}</span>
        <ChevronDown size={14} className="ml-auto shrink-0 text-[var(--ink-faint)]" />
      </button>
      ) : isAgentManagementPath(pathname) ? (
        <div className="min-w-0 flex-1"><ModeSwitcher compact stayOnStudioForAgent /></div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "light" ? "切换到深色" : "切换到浅色"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--ink-soft)] active:bg-[var(--bg-muted)]"
      >
        {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
      </button>
    </header>
  );
}
