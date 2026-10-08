"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Check, Copy, ExternalLink, Globe, Package, Plug, ScrollText, SearchX, TerminalSquare } from "lucide-react";
import McpConfigPanel from "./McpConfigPanel";
import { LearningConnectionsProvider } from "@/components/plugins/LearningConnectionsContext";
import LearningConnectionsPanel from "@/components/plugins/LearningConnectionsPanel";
import LearningConnectorControl from "@/components/plugins/LearningConnectorControl";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import SkillInstallButton from "./SkillInstallButton";
import { SkillPackagesProvider } from "./SkillPackagesContext";
import Badge from "@/components/ui/Badge";
import ActionButton, { actionClass } from "@/components/ui/ActionButton";
import { EmptyState, PageShell } from "@/components/ui/PageChrome";
import { PanelSkeleton } from "@/components/shared/LoadingStates";
import { copyTextToClipboard } from "@/lib/clipboard/copyText";
import { findMarketEntry, pickL10n, useMarketManifest, type MarketEntry, type MarketSection } from "@/lib/plugins/market";
import { useLocale, useT } from "@/lib/i18n";

const ACTION_CLASS = actionClass("secondary", "md");
const SECTION_ICON = { mcp: Plug, cli: TerminalSquare, skills: ScrollText } as const;

/** 详情页里的分区：小标题 + 内容，统一间距。 */
function Block({ title, children }: { title?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      {title ? <h2 className="text-[12.5px] font-semibold text-[var(--ink)]">{title}</h2> : null}
      {children}
    </section>
  );
}

const NOTE_CLASS = "rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--ink-soft)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 break-words [overflow-wrap:anywhere]">
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--ink-faint)]">{label}</span>
      <span className="text-[12.5px] font-medium text-[var(--ink)]">{children}</span>
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
  if (text === null) return <div className="ss-skel h-24 rounded-xl" aria-hidden />;
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
      <PageShell>
        <div className="shrink-0 border-b border-[var(--line-soft)] px-5 py-3">{back}</div>
        <PanelSkeleton variant="document" label={t("agent.market.loading")} />
      </PageShell>
    );
  }

  if (error || !manifest || !entry) {
    return (
      <PageShell data-testid="plugin-detail">
        <EmptyState
          icon={SearchX}
          title={t(error || !manifest ? "agent.market.loadError" : "agent.market.detail.notFound")}
          action={back}
        />
      </PageShell>
    );
  }

  const copyInstall = async (text: string) => {
    if (await copyTextToClipboard(text)) {
      setCopiedCmd(true);
      window.setTimeout(() => setCopiedCmd(false), 1600);
    }
  };

  const Icon = SECTION_ICON[entry.section];
  const notes = pickL10n(entry, "notes", locale);

  return (
    <PageShell data-testid="plugin-detail" data-plugin-id={entry.id}>
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--line-soft)] px-5 py-3">
        {back}
        <span className="text-[11.5px] text-[var(--ink-faint)]">{t(`agent.market.tabs.${section}`)}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-w-0 w-full max-w-[760px] flex-col gap-6 break-words px-5 py-6 [overflow-wrap:anywhere]">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-weak)] text-[var(--accent-ink)]" aria-hidden>
              <Icon size={26} strokeWidth={1.6} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 max-w-full text-[20px] font-semibold leading-tight text-[var(--ink)]">{pickL10n(entry, "name", locale)}</h1>
                <Badge tone={entry.source === "official" ? "accent" : "neutral"}>
                  {t(entry.source === "official" ? "agent.market.badge.official" : "agent.market.badge.community")}
                </Badge>
                {entry.section === "cli" ? <Badge>{t(entry.kind === "cli" ? "agent.market.badge.cli" : "agent.market.badge.skillPack")}</Badge> : null}
              </div>
              <p className="text-[13px] leading-relaxed text-[var(--ink-soft)]">{pickL10n(entry, "tagline", locale)}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4 sm:grid-cols-4">
            {entry.version ? <Field label={t("agent.market.field.version")}>v{entry.version}</Field> : null}
            {entry.author ? <Field label={t("agent.market.field.author")}>{entry.author}</Field> : null}
            {entry.section === "mcp" ? <Field label={t("agent.market.field.transport")}>{entry.connector ? t(`trace.tool.learningConnectors.${CONNECTOR_REGISTRY[entry.connector].kind === "mcp" ? "mcp" : CONNECTOR_REGISTRY[entry.connector].kind === "api" ? "api" : "local"}`) : entry.transport}</Field> : null}
            {entry.section === "skills" ? <Field label={t("agent.market.field.path")}>{entry.path}</Field> : null}
          </dl>

          <p className="text-[13px] leading-[1.7] text-[var(--ink)]">{pickL10n(entry, "desc", locale)}</p>

          {notes ? (
            <div className={NOTE_CLASS}>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">{t("agent.market.field.reason")}</span>
              <p className="mt-1">{notes}</p>
            </div>
          ) : null}

          {entry.tags.length || entry.homepage || entry.docs ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {entry.tags.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {entry.tags.map((tag) => <Badge key={tag} tone="outline">{tag}</Badge>)}
                </div>
              ) : null}
              <div className="ml-auto flex flex-wrap items-center gap-2">
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
            </div>
          ) : null}

          <div className="flex flex-col gap-4 border-t border-[var(--line-soft)] pt-6">
            {entry.section === "mcp" ? (
              <>
                <p className={NOTE_CLASS}>
                  {entry.id === "kitsolo" ? notes : t("agent.market.mcp.note")}
                </p>
                {entry.connector ? (
                  <div className="flex flex-col gap-3">
                    <LearningConnectionsPanel />
                    <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4">
                      <LearningConnectorControl provider={entry.connector} />
                    </div>
                  </div>
                ) : <McpConfigPanel entry={entry} />}
              </>
            ) : null}

            {entry.section === "cli" ? (
              <>
                {entry.kind === "skill-pack" ? (
                  <p className={NOTE_CLASS}>
                    <Package size={12} className="mr-1 inline align-text-bottom" />
                    {t("agent.market.cli.packHint")}
                  </p>
                ) : null}
                {entry.install ? (
                  <Block title={<><TerminalSquare size={13} className="mr-1 inline align-text-bottom" />{t("agent.market.field.install")}</>}>
                    <div className="flex items-start gap-2">
                      <code className="flex-1 overflow-x-auto rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ink)]">
                        {entry.install}
                      </code>
                      <ActionButton icon={copiedCmd ? <Check size={13} /> : <Copy size={13} />} onClick={() => void copyInstall(entry.install ?? "")}>
                        {copiedCmd ? t("agent.market.action.copied") : t("agent.market.action.copyCommand")}
                      </ActionButton>
                    </div>
                  </Block>
                ) : null}
                {entry.homepage ? (
                  <p className="text-[11.5px] text-[var(--ink-faint)]">
                    {entry.homepage}
                    <ExternalLink size={10} className="ml-1 inline align-text-bottom" />
                  </p>
                ) : null}
              </>
            ) : null}

            {entry.section === "skills" ? (
              <>
                <SkillInstallButton entry={entry} />
                <Block title={t("agent.market.field.preview")}>
                  <SkillPreview path={entry.path} />
                </Block>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
