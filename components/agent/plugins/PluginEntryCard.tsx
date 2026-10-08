"use client";

import { useState } from "react";
import Link from "next/link";
import { BookMarked, CalendarDays, ChevronRight, Code, Copy, FlaskConical, KeyRound, Layers, ListTodo, NotebookText, Package, Plug, Quote, ScrollText, TerminalSquare, Toolbox, type LucideIcon } from "lucide-react";
import LearningConnectorControl from "@/components/plugins/LearningConnectorControl";
import { KitSoloConnectButton } from "@/components/plugins/KitSoloConnectButton";
import SkillInstallButton from "./SkillInstallButton";
import Badge from "@/components/ui/Badge";
import ActionButton, { actionClass } from "@/components/ui/ActionButton";
import { copyTextToClipboard } from "@/lib/clipboard/copyText";
import { pickL10n, type MarketEntry } from "@/lib/plugins/market";
import { useSkills } from "@/lib/stores/skills";
import { useT, type Locale } from "@/lib/i18n";

const SECTION_ICON = {
  mcp: Plug,
  cli: TerminalSquare,
  skills: ScrollText,
} as const;

/** 学习服务各配一个贴题的图标；没登记的条目回落到板块图标。 */
const ENTRY_ICON: Record<string, LucideIcon> = {
  kitsolo: Toolbox,
  notion: NotebookText,
  todoist: ListTodo,
  google: CalendarDays,
  github: Code,
  zotero: BookMarked,
  pubmed: FlaskConical,
  crossref: Quote,
  anki: Layers,
};

/**
 * 市场条目卡片。三段式，所有板块同一骨架：
 * ① 头部：图标 + 名称 / 版本 + 来源与状态徽章；② 简介 + 标签；③ 底栏：状态与主操作靠左、详情靠右。
 * 底栏钉在卡片最下沿（mt-auto），同一行的卡片不论简介长短、有没有授权范围折叠，按钮都在同一条线上。
 */
export default function PluginEntryCard({ entry, locale }: { entry: MarketEntry; locale: Locale }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const installed = useSkills((s) => (entry.section === "skills" ? s.skills.find((sk) => sk.sourceId === entry.id) : undefined));

  const Icon = ENTRY_ICON[entry.id] ?? SECTION_ICON[entry.section];
  const href = `/agent/plugins/${entry.section}/${entry.id}`;
  const needsKey = entry.section === "mcp" && (entry.env ?? []).some((e) => e.required);
  const hasUpdate = Boolean(
    installed && entry.section === "skills" && entry.version && installed.sourceVersion !== entry.version,
  );

  const copy = async (text: string) => {
    if (await copyTextToClipboard(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  const detail = (
    <Link href={href} data-testid={`plugins-detail-${entry.id}`} className={actionClass("ghost", "sm", "gap-0.5 pr-1.5")}>
      {t("agent.market.action.detail")}
      <ChevronRight size={13} aria-hidden />
    </Link>
  );

  const footer = (() => {
    if (entry.section === "mcp") {
      if (entry.id === "kitsolo") return <KitSoloConnectButton english={locale === "en"} compact trailing={detail} />;
      if (entry.connector) return <LearningConnectorControl provider={entry.connector} trailing={detail} />;
    }
    const primary = entry.section === "cli"
      ? entry.install ? (
        <ActionButton variant="primary" size="sm" data-testid={`plugins-copy-${entry.id}`} icon={<Copy size={12} />} onClick={() => void copy(entry.install ?? "")}>
          {copied ? t("agent.market.action.copied") : t("agent.market.action.copyCommand")}
        </ActionButton>
      ) : null
      : entry.section === "skills" ? <SkillInstallButton entry={entry} compact /> : null;
    return (
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">{primary}</div>
        {detail}
      </div>
    );
  })();

  return (
    <article
      data-testid={`plugins-card-${entry.id}`}
      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4 transition-[border-color,box-shadow] duration-[var(--duration-fast)] hover:border-[var(--line)] hover:shadow-[var(--shadow-sm)]"
    >
      <header className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-weak)] text-[var(--accent-ink)]" aria-hidden>
          <Icon size={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <h3 className="min-w-0 truncate text-[14px] font-semibold leading-tight text-[var(--ink)]" title={pickL10n(entry, "name", locale)}>{pickL10n(entry, "name", locale)}</h3>
            {entry.version ? <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--ink-faint)]">v{entry.version}</span> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Badge tone={entry.source === "official" ? "accent" : "neutral"}>
              {t(entry.source === "official" ? "agent.market.badge.official" : "agent.market.badge.community")}
            </Badge>
            {needsKey ? <Badge tone="warn" icon={<KeyRound size={10} />}>{t("agent.market.badge.keyRequired")}</Badge> : null}
            {entry.section === "cli" ? <Badge>{t(entry.kind === "cli" ? "agent.market.badge.cli" : "agent.market.badge.skillPack")}</Badge> : null}
            {installed ? <Badge tone="accent" icon={<Package size={10} />}>{t(hasUpdate ? "agent.market.badge.hasUpdate" : "agent.market.badge.installed")}</Badge> : null}
          </div>
        </div>
      </header>

      <p className="line-clamp-2 min-h-[2.7em] text-[12.5px] leading-[1.45] text-[var(--ink-soft)]">
        {pickL10n(entry, "tagline", locale)}
      </p>

      {entry.tags.length ? (
        <div className="flex flex-wrap items-center gap-1">
          {entry.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} tone="outline">{tag}</Badge>
          ))}
        </div>
      ) : null}

      <footer className="mt-auto border-t border-[var(--line-soft)] pt-3">{footer}</footer>
    </article>
  );
}
