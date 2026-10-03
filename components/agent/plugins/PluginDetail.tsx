"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, ExternalLink, Globe, Package, TerminalSquare } from "lucide-react";
import McpConfigPanel from "./McpConfigPanel";
import { LearningConnectionsProvider } from "@/components/plugins/LearningConnectionsContext";
import LearningConnectionsPanel from "@/components/plugins/LearningConnectionsPanel";
import LearningConnectorControl from "@/components/plugins/LearningConnectorControl";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import SkillInstallButton from "./SkillInstallButton";
import { SkillPackagesProvider } from "./SkillPackagesContext";
import { copyTextToClipboard } from "@/lib/clipboard/copyText";
import { findMarketEntry, pickL10n, useMarketManifest, type MarketEntry, type MarketSection } from "@/lib/plugins/market";
import { useLocale, useT } from "@/lib/i18n";

const ACTION_CLASS =
  "press flex items-center gap-1.5 rounded-lg border border-[var(--line-soft)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)] hover:border-[var(--accent)] hover:bg-[var(--bg-muted)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] uppercase tracking-wide text-[var(--ink-faint)]">{label}</span>
      <span className="text-[12.5px] text-[var(--ink)]">{children}</span>
    </div>
  );
}

/** 官方技能详情里的 SKILL.md 正文预览（懒加载，截前 80 行）。 */
function SkillPreview({ path }: { path: string }) {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      })
      .then((body) => {
        if (alive) setText(body.split("\n").slice(0, 80).join("\n"));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  if (failed) return <p className="text-[12px] text-[var(--ink-faint)]">{t("agent.market.skill.previewEmpty")}</p>;
  if (text === null) return <div className="h-24 animate-shimmer rounded-xl bg-[var(--bg-muted)]" />;
  return (
    <pre
      data-testid="skill-preview"
      className="max-h-[300px] overflow-auto rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)] p-3 text-[11px] leading-relaxed text-[var(--ink)]"
    >
      {text}
    </pre>
  );
}

/**
 * 市场详情页（/agent/plugins/{section}/{id}）：
 * 头部元信息（版本/来源/接入方式/链接）+ 长描述 + 推荐理由 + 各板块专属操作区。
 */
export default function PluginDetail({ section, id }: { section: MarketSection; id: string }) {
  return <LearningConnectionsProvider><SkillPackagesProvider><DetailContents section={section} id={id} /></SkillPackagesProvider></LearningConnectionsProvider>;
}

function DetailContents({ section, id }: { section: MarketSection; id: string }) {
  const t = useT();
  const locale = useLocale();
  const { manifest, loading, error } = useMarketManifest();
  const [copiedCmd, setCopiedCmd] = useState(false);

  const entry: MarketEntry | null = manifest ? findMarketEntry(manifest, section, id) : null;

  const back = (
    <Link href="/agent/plugins" className={ACTION_CLASS}>
      <ArrowLeft size={14} /> {t("agent.market.action.back")}
    </Link>
  );

  if (loading) {
    return (
      <section className="flex h-full flex-col gap-4 overflow-y-auto px-6 py-6">
        <div className="h-8 w-28 animate-shimmer rounded-lg bg-[var(--bg-muted)]" />
        <div className="h-10 w-[60%] animate-shimmer rounded-lg bg-[var(--bg-muted)]" />
        <div className="h-24 animate-shimmer rounded-2xl bg-[var(--bg-muted)]" />
      </section>
    );
  }

  if (error || !manifest) {
    return (
      <section data-testid="plugin-detail" className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[13px] text-[var(--ink-soft)]">{t("agent.market.loadError")}</p>
        {back}
      </section>
    );
  }

  if (!entry) {
    return (
      <section data-testid="plugin-detail" className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[13px] text-[var(--ink-soft)]">{t("agent.market.detail.notFound")}</p>
        {back}
      </section>
    );
  }

  const copyInstall = async (text: string) => {
    if (await copyTextToClipboard(text)) {
      setCopiedCmd(true);
      window.setTimeout(() => setCopiedCmd(false), 1600);
    }
  };

  return (
    <section data-testid="plugin-detail" data-plugin-id={entry.id} className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line-soft)] px-5 py-3">
        {back}
        <span className="text-[11.5px] text-[var(--ink-faint)]">{t(`agent.market.tabs.${section}`)}</span>
      </div>

      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-5 py-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[18px] font-semibold text-[var(--ink)]">{pickL10n(entry, "name", locale)}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                entry.source === "official"
                  ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]"
                  : "bg-[var(--bg-muted)] text-[var(--ink-soft)]"
              }`}
            >
              {t(entry.source === "official" ? "agent.market.badge.official" : "agent.market.badge.community")}
            </span>
            {entry.section === "cli" ? (
              <span className="rounded-full bg-[var(--bg-muted)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--ink-soft)]">
                {t(entry.kind === "cli" ? "agent.market.badge.cli" : "agent.market.badge.skillPack")}
              </span>
            ) : null}
          </div>
          <p className="text-[13px] leading-relaxed text-[var(--ink-soft)]">{pickL10n(entry, "tagline", locale)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4 sm:grid-cols-4">
          {entry.version ? <Field label={t("agent.market.field.version")}>v{entry.version}</Field> : null}
          {entry.author ? <Field label={t("agent.market.field.author")}>{entry.author}</Field> : null}
          {entry.section === "mcp" ? <Field label={t("agent.market.field.transport")}>{entry.connector ? t(`trace.tool.learningConnectors.${CONNECTOR_REGISTRY[entry.connector].kind === "mcp" ? "mcp" : CONNECTOR_REGISTRY[entry.connector].kind === "api" ? "api" : "local"}`) : entry.transport}</Field> : null}
          {entry.section === "skills" ? <Field label={t("agent.market.field.path")}>{entry.path}</Field> : null}
        </div>

        <p className="text-[13px] leading-relaxed text-[var(--ink)]">{pickL10n(entry, "desc", locale)}</p>

        {pickL10n(entry, "notes", locale) ? (
          <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)] px-3.5 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">
              {t("agent.market.field.reason")}
            </span>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-soft)]">{pickL10n(entry, "notes", locale)}</p>
          </div>
        ) : null}

        {entry.tags.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-[var(--line-soft)] px-2 py-0.5 text-[11px] text-[var(--ink-faint)]">
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {entry.homepage ? (
            <a href={entry.homepage} target="_blank" rel="noreferrer" className={ACTION_CLASS}>
              <Globe size={13} /> {t("agent.market.action.homepage")}
            </a>
          ) : null}
          {entry.docs ? (
            <a href={entry.docs} target="_blank" rel="noreferrer" className={ACTION_CLASS}>
              <BookOpen size={13} /> {t("agent.market.action.docs")}
            </a>
          ) : null}
        </div>

        <div className="border-t border-[var(--line-soft)] pt-4">
          {entry.section === "mcp" ? (
            <div className="flex flex-col gap-3">
              <p className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--ink-soft)]">
                {entry.id === "kitsolo" ? pickL10n(entry, "notes", locale) : t("agent.market.mcp.note")}
              </p>
              {entry.connector ? <><LearningConnectionsPanel /><LearningConnectorControl provider={entry.connector} /></> : <McpConfigPanel entry={entry} />}
            </div>
          ) : null}

          {entry.section === "cli" ? (
            <div className="flex flex-col gap-3">
              {entry.kind === "skill-pack" ? (
                <p className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--ink-soft)]">
                  <Package size={12} className="mr-1 inline align-text-bottom" />
                  {t("agent.market.cli.packHint")}
                </p>
              ) : null}
              {entry.install ? (
                <div className="flex flex-col gap-2">
                  <span className="text-[12.5px] font-semibold text-[var(--ink)]">
                    <TerminalSquare size={13} className="mr-1 inline align-text-bottom" />
                    {t("agent.market.field.install")}
                  </span>
                  <div className="flex items-start gap-2">
                    <code className="flex-1 overflow-x-auto rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ink)]">
                      {entry.install}
                    </code>
                    <button type="button" onClick={() => void copyInstall(entry.install ?? "")} className={ACTION_CLASS}>
                      {copiedCmd ? t("agent.market.action.copied") : t("agent.market.action.copyCommand")}
                    </button>
                  </div>
                </div>
              ) : null}
              {entry.homepage ? (
                <p className="text-[11.5px] text-[var(--ink-faint)]">
                  {entry.homepage}
                  <ExternalLink size={10} className="ml-1 inline align-text-bottom" />
                </p>
              ) : null}
            </div>
          ) : null}

          {entry.section === "skills" ? (
            <div className="flex flex-col gap-3">
              <SkillInstallButton entry={entry} />
              <div className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-[var(--ink)]">{t("agent.market.field.preview")}</span>
                <SkillPreview path={entry.path} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
