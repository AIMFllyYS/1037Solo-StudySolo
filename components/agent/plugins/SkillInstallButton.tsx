"use client";

import { useState } from "react";
import { Download, RefreshCw, Trash2 } from "lucide-react";
import { parseSkillMarkdown } from "@/lib/utils/skillFrontmatter";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { MAX_SKILLS, useSkills } from "@/lib/stores/skills";
import { useT } from "@/lib/i18n";
import type { SkillMarketEntry } from "@/lib/plugins/market";
import { useSkillPackages } from "./SkillPackagesContext";
import LearningAccountVerificationLink from "@/components/plugins/LearningAccountVerificationLink";
import { connectorErrorKey } from "@/lib/connectors/presentation";
import { captureStorageOperation } from "@/lib/storage/ownerScope";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import ActionButton from "@/components/ui/ActionButton";

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
  const [error, setError] = useState<string | null>(null), [confirmUninstall, setConfirmUninstall] = useState(false);
  const cloudHeaders = async (operation: ReturnType<typeof captureStorageOperation>) => {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(operation.ownerId));
    if (!operation.isCurrent()) throw new Error("ACCOUNT_CHANGED");
    return { "Content-Type": "application/json", "X-StudySolo-Owner-Binding": Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("") };
  };

  const hasUpdate = Boolean(installed && entry.version && ("version" in installed ? installed.version : installed.sourceVersion) !== entry.version);

  const install = async () => {
    if (state === "busy" || !hydrated) return;
    setState("busy"); setError(null);
    try {
      const operation = entry.runtime === "cloud" ? captureStorageOperation(entry.id) : null;
      const res = operation ? await fetch("/api/agent/skills/", { method: "POST", headers: await cloudHeaders(operation), body: JSON.stringify({ packageId: entry.id, action: "install" }), signal: operation.signal }) : await fetch(entry.path);
      const data = operation ? await res.json() : null;
      if (!res.ok) throw new Error(data?.code ?? "SKILL_PACKAGE_UNAVAILABLE");
      if (operation && !operation.isCurrent()) throw new Error("ACCOUNT_CHANGED");
      const parsed = parseSkillMarkdown(operation ? data.content : await res.text(), "SKILL.md");
      const result = installSkill({
        name: parsed.name,
        description: parsed.description,
        content: parsed.content,
        sourceId: entry.id,
        sourceVersion: entry.version,
      });
      setState(result === "full" ? "full" : result);
      if (entry.runtime === "cloud") await packages.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "SKILL_PACKAGE_UNAVAILABLE");
      setState("failed");
    } finally {
      window.setTimeout(() => setState((s) => (s === "busy" ? "idle" : s)), 0);
    }
  };

  const uninstall = async () => {
    setConfirmUninstall(false);
    if (!installed || state === "busy") return;
    setState("busy"); setError(null);
    try {
      if (entry.runtime === "cloud") {
        const operation = captureStorageOperation(entry.id);
        const response = await fetch("/api/agent/skills/", { method: "POST", headers: await cloudHeaders(operation), body: JSON.stringify({ packageId: entry.id, action: "uninstall" }), signal: operation.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.code ?? "SKILL_PACKAGE_UNAVAILABLE");
        if (!operation.isCurrent()) throw new Error("ACCOUNT_CHANGED");
        await packages.refresh();
      }
      if (localInstalled) deleteSkill(localInstalled.id);
      setState("idle");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "SKILL_PACKAGE_UNAVAILABLE"); setState("failed"); }
  };

  const busy = state === "busy" || !hydrated || entry.runtime === "cloud" && !packages.ready;
  const size = compact ? "sm" : "md";

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {installed ? (
        <>
          <ActionButton
            data-testid={`skill-update-${entry.id}`}
            variant={hasUpdate ? "primary" : "secondary"}
            size={size}
            icon={<RefreshCw size={13} className={busy ? "animate-spin" : undefined} />}
            onClick={install}
            disabled={busy || !hasUpdate}
            title={hasUpdate ? t("agent.market.action.update") : t("agent.market.action.installed")}
          >
            {hasUpdate ? t("agent.market.action.update") : t("agent.market.action.installed")}
          </ActionButton>
          <ActionButton
            data-testid={`skill-uninstall-${entry.id}`}
            variant="danger"
            size={size}
            icon={<Trash2 size={13} />}
            onClick={() => setConfirmUninstall(true)}
            disabled={busy}
            title={t("agent.market.action.uninstall")}
          >
            {t("agent.market.action.uninstall")}
          </ActionButton>
        </>
      ) : (
        <ActionButton
          data-testid={`skill-install-${entry.id}`}
          variant="primary"
          size={size}
          icon={<Download size={13} className={busy ? "animate-pulse" : undefined} />}
          onClick={install}
          disabled={busy}
        >
          {busy ? t("agent.market.loading") : t("agent.market.action.install")}
        </ActionButton>
      )}
      <span aria-live="polite" className="text-[11px]">
        {state === "added" ? <span className="text-[var(--md-sys-color-primary)]">{t("agent.market.skill.imported")}</span> : null}
        {state === "updated" ? <span className="text-[var(--md-sys-color-primary)]">{t("agent.market.skill.updated")}</span> : null}
        {state === "full" ? <span className="text-[var(--md-sys-color-error)]">{t("agent.market.skill.full", { max: MAX_SKILLS })}</span> : null}
        {state === "failed" || entry.runtime === "cloud" && packages.error ? <span className="text-[var(--md-sys-color-error)]">{["REAUTH_REQUIRED", "MFA_REQUIRED", "SIGN_IN_REQUIRED", "SESSION_MISSING", "SESSION_INVALID", "SESSION_EXPIRED", "ACCOUNT_CHANGED", "ACCOUNT_UNAVAILABLE"].includes(error ?? packages.error ?? "") ? t(connectorErrorKey(error ?? packages.error)) : t("agent.market.skill.failed")}<LearningAccountVerificationLink code={error ?? packages.error}/>{entry.runtime === "cloud" && <button type="button" className="ml-2 text-[var(--accent)] underline" disabled={state === "busy"} onClick={() => void packages.refresh()}>{t("trace.tool.learningConnectors.refresh")}</button>}</span> : null}
      </span>
      {confirmUninstall && <ConfirmDialog title={t("agent.market.action.uninstall")} body={entry.name} cancelLabel={t("common.cancel")} confirmLabel={t("agent.market.action.uninstall")} onCancel={() => setConfirmUninstall(false)} onConfirm={() => void uninstall()}/>}
    </span>
  );
}
