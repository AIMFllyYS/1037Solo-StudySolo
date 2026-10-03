"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound } from "lucide-react";
import { copyTextToClipboard } from "@/lib/clipboard/copyText";
import { pluginSecretsFor, pluginSecretKey, usePluginSecrets } from "@/lib/stores/pluginSecrets";
import { buildMcpConfigSnippet, missingRequiredEnv, pickL10n, type McpEntry } from "@/lib/plugins/market";
import { useLocale, useT } from "@/lib/i18n";
import { inputCls, labelCls } from "@/components/chat/settings/_shared";
import { KitSoloConnectButton } from "@/components/plugins/KitSoloConnectButton";

/**
 * MCP 详情页的「凭证 + 配置」面板：
 * 1. env 逐项填写 → pluginSecrets（localStorage 轻混淆，本机保留）
 * 2. 实时预览标准 mcpServers 配置 JSON
 * 3. 一键复制 → 粘到宿主 Agent 的 MCP 配置里
 * KitSolo 提供原生 Agent 关联；其他条目的 MCP 运行时由外部宿主拉起。
 */
export default function McpConfigPanel({ entry }: { entry: McpEntry }) {
  const t = useT();
  const locale = useLocale();
  const secretValues = usePluginSecrets((s) => s.values);
  const setSecret = usePluginSecrets((s) => s.setSecret);
  const [copied, setCopied] = useState(false);

  const envVars = useMemo(() => entry.env ?? [], [entry.env]);
  const envNames = useMemo(() => envVars.map((e) => e.name), [envVars]);
  const filled = useMemo(
    () => pluginSecretsFor(secretValues, entry.id, envNames),
    [secretValues, entry.id, envNames],
  );
  const missing = missingRequiredEnv(entry, filled);
  const snippet = buildMcpConfigSnippet(entry, filled);

  const copy = async () => {
    if (await copyTextToClipboard(snippet)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  if (entry.id === "kitsolo") return <div className="flex flex-col gap-3" data-testid="mcp-config-panel">
    <KitSoloConnectButton english={locale === "en"}/>
    <a href={entry.homepage} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent)] underline">{locale === "en" ? "Manage or revoke connection" : "管理或撤销关联"} ↗</a>
    <details className="rounded-xl border border-[var(--line-soft)] p-3 text-xs"><summary>{locale === "en" ? "Configuration for other MCP hosts" : "其他 MCP 宿主配置"}</summary><p className="my-2">{locale === "en" ? "The host must support OAuth with PKCE and have its callback registered by the administrator." : "宿主需要支持 OAuth 与 PKCE，并先由管理员登记回调地址。"}</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap">{snippet}</pre><button type="button" className="mt-2 rounded-lg border border-[var(--line-soft)] px-3 py-2" onClick={() => void copy()}>{t(copied ? "agent.market.action.copied" : "agent.market.action.copyConfig")}</button></details>
  </div>;

  return (
    <div className="flex flex-col gap-3" data-testid="mcp-config-panel">
      <div className="flex items-center gap-2">
        <KeyRound size={13} className="text-[var(--md-sys-color-primary)]" />
        <h3 className="text-[12.5px] font-semibold text-[var(--ink)]">{t("agent.market.field.credentials")}</h3>
      </div>
      {envVars.length === 0 ? (
        <p className="text-[12px] text-[var(--ink-faint)]">{t("agent.market.mcp.noEnv")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {envVars.map((env) => {
            const key = pluginSecretKey(entry.id, env.name);
            return (
              <div key={env.name} className="flex flex-col gap-1">
                <label className={labelCls}>
                  {env.name}
                  {env.required ? <span className="ml-1 text-[var(--md-sys-color-error)]">*</span> : null}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="password"
                    data-testid={`mcp-env-${env.name}`}
                    value={filled[env.name] ?? ""}
                    onChange={(e) => setSecret(key, e.target.value)}
                    placeholder={`<YOUR_${env.name}>`}
                    autoComplete="off"
                    className={inputCls}
                  />
                  {env.keyUrl ? (
                    <a
                      href={env.keyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="press flex shrink-0 items-center gap-1 rounded-lg border border-[var(--line-soft)] px-2 py-1.5 text-[11.5px] text-[var(--ink)] hover:border-[var(--accent)]"
                    >
                      <ExternalLink size={11} />
                      {t("agent.market.action.getKey")}
                    </a>
                  ) : null}
                </div>
                {env.desc ? <p className="text-[10.5px] leading-relaxed text-[var(--ink-faint)]">{pickL10n(env, "desc", locale)}</p> : null}
              </div>
            );
          })}
        </div>
      )}
      {envVars.length > 0 ? (
        <p className="text-[11px] leading-relaxed text-[var(--ink-faint)]">{t("agent.market.mcp.envSaved")}</p>
      ) : null}
      {missing.length > 0 ? (
        <p className="text-[11px] leading-relaxed text-[var(--md-sys-color-tertiary,#8a5a00)]">{t("agent.market.mcp.missingEnv")}</p>
      ) : null}

      <div className="mt-1 flex items-center justify-between gap-2">
        <h3 className="text-[12.5px] font-semibold text-[var(--ink)]">{t("agent.market.field.config")}</h3>
        <button
          type="button"
          data-testid="mcp-copy-config"
          onClick={() => void copy()}
          className="press flex items-center gap-1.5 rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-[12px] font-medium text-[var(--md-sys-color-on-primary)]"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? t("agent.market.action.copied") : t("agent.market.action.copyConfig")}
        </button>
      </div>
      <pre
        data-testid="mcp-config-json"
        className="max-h-[320px] overflow-auto rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)] p-3 text-[11.5px] leading-relaxed text-[var(--ink)]"
      >
        {snippet}
      </pre>
      <p className="text-[11px] leading-relaxed text-[var(--ink-faint)]">{t("agent.market.mcp.pasteHint")}</p>
    </div>
  );
}
