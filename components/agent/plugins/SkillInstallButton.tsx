"use client";

import { useState } from "react";
import { Download, RefreshCw, Trash2 } from "lucide-react";
import { parseSkillMarkdown } from "@/lib/utils/skillFrontmatter";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { MAX_SKILLS, useSkills } from "@/lib/stores/skills";
import { useT } from "@/lib/i18n";
import type { SkillMarketEntry } from "@/lib/plugins/market";
import { useSkillPackages } from "./SkillPackagesContext";

type InstallState = "idle" | "busy" | "added" | "updated" | "full" | "failed";

/**
 * 官方技能「导入/更新/卸载」按钮。
 * 去重口径：Skill.sourceId === 市场条目 id——同名会原地更新（保留 id/pinned），
 * 卸载即按 sourceId 找回技能并删除；满员与下载失败都在原地给出反馈。
 */
export default function SkillInstallButton({ entry, compact = false }: { entry: SkillMarketEntry; compact?: boolean }) {
  const t = useT();
  const hydrated = useHydrated(useSkills);
  const localInstalled = useSkills((s) => s.skills.find((sk) => sk.sourceId === entry.id));
  const packages = useSkillPackages();
  const installed = entry.runtime === "cloud" ? packages.installed.find(item => item.packageId === entry.id) : localInstalled;
  const installSkill = useSkills((s) => s.installSkill);
  const deleteSkill = useSkills((s) => s.deleteSkill);
  const [state, setState] = useState<InstallState>("idle");

  const hasUpdate = Boolean(installed && entry.version && ("version" in installed ? installed.version : installed.sourceVersion) !== entry.version);

  const install = async () => {
    if (state === "busy" || !hydrated) return;
    setState("busy");
    try {
      const res = entry.runtime === "cloud" ? await fetch("/api/agent/skills/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packageId: entry.id, action: "install" }) }) : await fetch(entry.path);
      if (!res.ok) throw new Error(String(res.status));
      const parsed = parseSkillMarkdown(entry.runtime === "cloud" ? (await res.json()).content : await res.text(), "SKILL.md");
      const result = installSkill({
        name: parsed.name,
        description: parsed.description,
        content: parsed.content,
        sourceId: entry.id,
        sourceVersion: entry.version,
      });
      setState(result === "full" ? "full" : result);
      if (entry.runtime === "cloud") await packages.refresh();
    } catch {
      setState("failed");
    } finally {
      window.setTimeout(() => setState((s) => (s === "busy" ? "idle" : s)), 0);
    }
  };

  const uninstall = async () => {
    if (!installed) return;
    try {
      if (entry.runtime === "cloud") {
        const response = await fetch("/api/agent/skills/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packageId: entry.id, action: "uninstall" }) });
        if (!response.ok) throw new Error();
        await packages.refresh();
      }
      if (localInstalled) deleteSkill(localInstalled.id);
      setState("idle");
    } catch { setState("failed"); }
  };

  const busy = state === "busy" || !hydrated || entry.runtime === "cloud" && !packages.ready;
  const btnBase = compact
    ? "press flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium"
    : "press flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium";

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {installed ? (
        <>
          <button
            type="button"
            data-testid={`skill-update-${entry.id}`}
            onClick={install}
            disabled={busy || !hasUpdate}
            title={hasUpdate ? t("agent.market.action.update") : t("agent.market.action.installed")}
            className={`${btnBase} ${
              hasUpdate
                ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                : "border border-[var(--line-soft)] text-[var(--ink-soft)]"
            } disabled:opacity-60`}
          >
            <RefreshCw size={13} className={busy ? "animate-spin" : undefined} />
            {hasUpdate ? t("agent.market.action.update") : t("agent.market.action.installed")}
          </button>
          <button
            type="button"
            data-testid={`skill-uninstall-${entry.id}`}
            onClick={uninstall}
            title={t("agent.market.action.uninstall")}
            className="press flex items-center gap-1 rounded-lg border border-[var(--line-soft)] px-2.5 py-1.5 text-[12px] text-[var(--ink-soft)] hover:border-[var(--md-sys-color-error)] hover:text-[var(--md-sys-color-error)]"
          >
            <Trash2 size={13} />
            {t("agent.market.action.uninstall")}
          </button>
        </>
      ) : (
        <button
          type="button"
          data-testid={`skill-install-${entry.id}`}
          onClick={install}
          disabled={busy}
          className={`${btnBase} bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] disabled:opacity-60`}
        >
          <Download size={13} className={busy ? "animate-pulse" : undefined} />
          {busy ? t("agent.market.loading") : t("agent.market.action.install")}
        </button>
      )}
      <span aria-live="polite" className="text-[11px]">
        {state === "added" ? <span className="text-[var(--md-sys-color-primary)]">{t("agent.market.skill.imported")}</span> : null}
        {state === "updated" ? <span className="text-[var(--md-sys-color-primary)]">{t("agent.market.skill.updated")}</span> : null}
        {state === "full" ? <span className="text-[var(--md-sys-color-error)]">{t("agent.market.skill.full", { max: MAX_SKILLS })}</span> : null}
        {state === "failed" ? <span className="text-[var(--md-sys-color-error)]">{t("agent.market.skill.failed")}</span> : null}
      </span>
    </span>
  );
}
