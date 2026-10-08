"use client";

import { ChevronRight } from "lucide-react";
import { GOOGLE_SCOPE_OPTIONS } from "@/lib/connectors/google-scopes";
import { useGoogleConnectorScopes } from "@/lib/stores/googleConnectorScopes";
import { useT } from "@/lib/i18n";
import type { LearningConnection } from "./LearningConnectionsContext";

/** 下次授权要申请的 Google 能力：默认折叠成一行摘要，展开后是一列勾选项。 */
export default function GoogleConnectorScopes({ connection }: { connection?: LearningConnection }) {
  const t = useT();
  const draft = useGoogleConnectorScopes();
  const granted = GOOGLE_SCOPE_OPTIONS.filter(([scope]) => connection?.scopes?.includes(scope)).map(([, label]) => t(`trace.tool.learningConnectors.${label}`));
  return <details className="group rounded-xl border border-[var(--line-soft)] bg-[var(--bg-muted)]">
    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--ink-soft)] outline-none marker:hidden hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden">
      <ChevronRight size={12} aria-hidden className="shrink-0 transition-transform duration-[var(--duration-fast)] group-open:rotate-90" />
      <span className="min-w-0 flex-1 truncate">{t("trace.tool.learningConnectors.nextAuthorizationScopes")}</span>
      <span className="shrink-0 tabular-nums text-[var(--ink-faint)]">{draft.scopes.length}/{GOOGLE_SCOPE_OPTIONS.length}</span>
    </summary>
    <input type="hidden" name="scope_selection" value="1" />
    <div className="flex flex-col gap-0.5 px-2.5 pb-2 pt-0.5">{GOOGLE_SCOPE_OPTIONS.map(([scope, label]) => <label key={scope} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-[11.5px] text-[var(--ink)] hover:bg-[var(--bg-panel)]">
      <input className="mt-0.5 shrink-0 accent-[var(--accent)]" type="checkbox" name="scope" value={scope} checked={draft.scopes.includes(scope)} onChange={event => draft.choose(scope, event.target.checked, draft.owner, draft.epoch)} />
      <span className="min-w-0">{t(`trace.tool.learningConnectors.${label}`)}</span>
    </label>)}</div>
    {connection && ["connected", "reauthorization_required"].includes(connection.state) && Array.isArray(connection.scopes) && <p className="border-t border-[var(--line-soft)] px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--ink-faint)]" data-testid="google-granted-scopes">{t("trace.tool.learningConnectors.grantedScopes", { scopes: granted.length ? granted.join(" / ") : t("trace.tool.learningConnectors.noGrantedScopes") })}</p>}
    {draft.dirty && <p className="px-2.5 pb-2 text-[11px] leading-relaxed text-[var(--ink-faint)]">{t("trace.tool.learningConnectors.scopeDraftHint")}</p>}
  </details>;
}
