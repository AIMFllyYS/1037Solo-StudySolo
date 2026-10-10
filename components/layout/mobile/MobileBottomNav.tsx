"use client";

import { FileText, BookOpenCheck, Globe, Settings } from "lucide-react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useStore, type MobileTab } from "@/lib/stores/ui";

const TABS: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
  { id: "detail", label: "详解", icon: <FileText size={20} /> },
  { id: "review", label: "复习", icon: <BookOpenCheck size={20} /> },
  { id: "ai", label: "AI", icon: null },
  { id: "browser", label: "浏览", icon: <Globe size={20} /> },
  { id: "settings", label: "设置", icon: <Settings size={20} /> },
];

export default function MobileBottomNav() {
  const tab = useStore((s) => s.mobileTab);
  const setTab = useStore((s) => s.setMobileTab);

  return (
    <nav
      className="mobile-bottom-nav shrink-0 border-t border-[var(--line-soft)] bg-[var(--bg-panel)]/85"
      aria-label="手机底栏"
      data-testid="mobile-bottom-nav"
    >
      <div
        className="flex items-stretch justify-around"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          const isAi = t.id === "ai";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              aria-label={t.label}
              data-tab={t.id}
              className={clsx(
                "relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center px-0.5 pt-1.5 pb-1 transition-colors",
                !isAi && "gap-0.5",
                active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]",
              )}
            >
              {active && (
                <motion.span
                  layoutId="mobile-nav-pill"
                  className="absolute top-0.5 h-[3px] w-7 rounded-full bg-[var(--accent)]"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              {isAi ? (
                <span className={clsx("mobile-nav-ai-mark", active && "is-active")} aria-hidden>
                  AI
                </span>
              ) : (
                <>
                  <span className="flex h-7 w-7 items-center justify-center">
                    {t.icon}
                  </span>
                  <span className="max-w-full truncate text-[10px] font-medium leading-tight">
                    {t.label}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
