"use client";

import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Blocks, CalendarClock, Library, MessageSquarePlus, type LucideIcon } from "lucide-react";
import { useT, type I18nKey } from "@/lib/i18n";

export type AgentNavId = "new-chat" | "assets" | "scheduled" | "plugins";

interface NavRow {
  id: Exclude<AgentNavId, "new-chat">;
  /** 文案 key 而不是字面量：语言在组件渲染时才可知，模块级常量不能提前取词。 */
  labelKey: I18nKey;
  href: string;
  icon: LucideIcon;
}

/** 三个落点页；「新对话」不是路由（它是动作），所以单独一行放在最前。 */
const NAV_ROWS: readonly NavRow[] = [
  { id: "assets", labelKey: "agent.nav.assets", href: "/agent/assets", icon: Library },
  { id: "scheduled", labelKey: "agent.nav.scheduled", href: "/agent/scheduled", icon: CalendarClock },
  { id: "plugins", labelKey: "agent.nav.plugins", href: "/agent/plugins", icon: Blocks },
];

const ROW_CLASS =
  "press group flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium outline-none transition-colors duration-[var(--duration-fast)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]";
const ROW_IDLE =
  "text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)]";
const ROW_ACTIVE = "bg-[var(--accent-weak)] text-[var(--accent-ink)]";

/**
 * 左栏固定区的四行导航：图标 + 名称。
 * 四个图标取自全站同一套 lucide 线性图标（与顶栏 / 菜单一致的 1.75 线宽），语义互不相同：
 * 新对话=气泡+加号，资产=书架，定时=日历+时钟，插件=积木。
 * 路由行选中时和「空白新对话」同款高亮——以前只有新对话会亮，进了资产页左栏却没有任何落点提示。
 */
export default function AgentNavRows({ onNewChat, newChatActive = false }: { onNewChat: () => void; newChatActive?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  return (
    <nav data-testid="agent-nav" aria-label={t("agent.nav.aria")} className="flex shrink-0 flex-col gap-0.5 px-2.5 pb-1 pt-2">
      <button
        type="button"
        data-testid="agent-nav-new-chat"
        data-active={newChatActive || undefined}
        aria-current={newChatActive ? "page" : undefined}
        onClick={onNewChat}
        className={clsx(ROW_CLASS, newChatActive ? ROW_ACTIVE : ROW_IDLE)}
      >
        <MessageSquarePlus size={16} strokeWidth={1.75} className={clsx("shrink-0", newChatActive ? "text-[var(--accent-ink)]" : "text-[var(--md-sys-color-primary)]")} aria-hidden />
        <span className="min-w-0 truncate">{t("agent.nav.newChat")}</span>
      </button>
      {NAV_ROWS.map((row) => {
        const active = pathname === row.href || pathname.startsWith(`${row.href}/`);
        const Icon = row.icon;
        return (
          <button
            key={row.id}
            type="button"
            data-testid={`agent-nav-${row.id}`}
            data-active={active || undefined}
            aria-current={active ? "page" : undefined}
            onClick={() => router.push(row.href)}
            className={clsx(ROW_CLASS, active ? ROW_ACTIVE : ROW_IDLE)}
          >
            <Icon size={16} strokeWidth={1.75} className={clsx("shrink-0", active ? "text-[var(--accent-ink)]" : "text-[var(--md-sys-color-outline)] group-hover:text-[var(--md-sys-color-on-surface-variant)]")} aria-hidden />
            <span className="min-w-0 truncate">{t(row.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
