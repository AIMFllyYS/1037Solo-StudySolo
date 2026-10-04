"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, KeyRound, Package, Plug, ScrollText, TerminalSquare } from "lucide-react";
import LearningConnectorControl from "@/components/plugins/LearningConnectorControl";
import { KitSoloConnectButton } from "@/components/plugins/KitSoloConnectButton";
import SkillInstallButton from "./SkillInstallButton";
import { copyTextToClipboard } from "@/lib/clipboard/copyText";
import { pickL10n, type MarketEntry } from "@/lib/plugins/market";
import { useSkills } from "@/lib/stores/skills";
import { useT, type Locale } from "@/lib/i18n";

const SECTION_ICON = {
  mcp: Plug,
  cli: TerminalSquare,
  skills: ScrollText,
} as const;

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "accent" | "warn" }) {
  const styles =
    tone === "accent"
      ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]"
      : tone === "warn"
        ? "bg-[var(--md-sys-color-tertiary-container,#f5e0c3)] text-[var(--md-sys-color-on-tertiary-container,#5c3b00)]"
        : "bg-[var(--bg-muted)] text-[var(--ink-soft)]";
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium ${styles}`}>
      {children}
    </span>
  );
}

/**
 * 市场条目卡片：图标 + 名称 + 徽章 + 简介 + 标签 + 主操作（复制配置/复制命令/导入技能）+ 详情。
 * 详情跳 /agent/plugins/{section}/{id}（section 与 manifest 顶层键同名）。
 */
export default function PluginEntryCard({ entry, locale }: { entry: MarketEntry; locale: Locale }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const installed = useSkills((s) => (entry.section === "skills" ? s.skills.find((sk) => sk.sourceId === entry.id) : undefined));

  const Icon = SECTION_ICON[entry.section];
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

  const primary = (() => {
    if (entry.section === "mcp") {
      if (entry.id === "kitsolo") return <KitSoloConnectButton english={locale === "en"} compact />;
      return entry.connector ? <LearningConnectorControl provider={entry.connector} /> : null;
    }
    if (entry.section === "cli") {
      return entry.install ? (
        <button
          type="button"
          data-testid={`plugins-copy-${entry.id}`}
          onClick={() => void copy(entry.install ?? "")}
          className="press flex items-center gap-1.5 rounded-lg bg-[var(--md-sys-color-primary)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--md-sys-color-on-primary)]"
        >
          <Copy size={12} />
          {copied ? t("agent.market.action.copied") : t("agent.market.action.copyCommand")}
        </button>
      ) : null;
    }
    return <SkillInstallButton entry={entry} compact />;
  })();

  return (
    <div
      data-testid={`plugins-card-${entry.id}`}
      className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4"
    >
      <div className="flex min-w-0 flex-wrap items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)] text-[var(--md-sys-color-primary)]" aria-hidden>
          <Icon size={16} />
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="min-w-0 break-words text-[13.5px] font-semibold text-[var(--ink)] [overflow-wrap:anywhere]">{pickL10n(entry, "name", locale)}</span>
          {entry.version ? <span className="shrink-0 text-[10px] text-[var(--ink-faint)]">v{entry.version}</span> : null}
        </div>
        <Badge tone={entry.source === "official" ? "accent" : "default"}>
          {t(entry.source === "official" ? "agent.market.badge.official" : "agent.market.badge.community")}
        </Badge>
      </div>

      <p className="line-clamp-2 min-h-[2.6em] text-[12px] leading-relaxed text-[var(--ink-soft)]">
        {pickL10n(entry, "tagline", locale)}
      </p>

      <div className="flex flex-wrap items-center gap-1">
        {needsKey ? (
          <Badge tone="warn">
            <KeyRound size={9} />
            {t("agent.market.badge.keyRequired")}
          </Badge>
        ) : null}
        {entry.section === "cli" ? (
          <Badge>{t(entry.kind === "cli" ? "agent.market.badge.cli" : "agent.market.badge.skillPack")}</Badge>
        ) : null}
        {installed ? (
          <Badge tone="accent">
            <Package size={9} />
            {t(hasUpdate ? "agent.market.badge.hasUpdate" : "agent.market.badge.installed")}
          </Badge>
        ) : null}
        {entry.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-full border border-[var(--line-soft)] px-1.5 py-px text-[10px] text-[var(--ink-faint)]">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-auto flex min-w-0 flex-wrap items-start gap-2 pt-1">
        <div className={entry.section === "mcp" && entry.connector ? "min-w-0 w-full" : "min-w-0"}>{primary}</div>
        <Link
          href={href}
          data-testid={`plugins-detail-${entry.id}`}
          className="press flex items-center gap-1 rounded-lg border border-[var(--line-soft)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--ink)] hover:border-[var(--accent)] hover:bg-[var(--bg-muted)]"
        >
          <ExternalLink size={12} />
          {t("agent.market.action.detail")}
        </Link>
      </div>
    </div>
  );
}
