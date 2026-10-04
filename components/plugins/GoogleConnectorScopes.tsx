"use client";

import { GOOGLE_SCOPE_OPTIONS } from "@/lib/connectors/google-scopes";
import { useGoogleConnectorScopes } from "@/lib/stores/googleConnectorScopes";
import { useT } from "@/lib/i18n";
import type { LearningConnection } from "./LearningConnectionsContext";

export default function GoogleConnectorScopes({ connection }: { connection?: LearningConnection }) {
  const t = useT();
  const draft = useGoogleConnectorScopes();
  const granted = GOOGLE_SCOPE_OPTIONS.filter(([scope]) => connection?.scopes?.includes(scope)).map(([, label]) => t(`trace.tool.learningConnectors.${label}`));
  return <details>
    <summary className="cursor-pointer text-[11px]">{t("trace.tool.learningConnectors.nextAuthorizationScopes")}</summary>
    <input type="hidden" name="scope_selection" value="1" />
    <div className="mt-2 space-y-1">{GOOGLE_SCOPE_OPTIONS.map(([scope, label]) => <label key={scope} className="flex items-start gap-2 text-[11px]">
      <input className="mt-0.5 shrink-0" type="checkbox" name="scope" value={scope} checked={draft.scopes.includes(scope)} onChange={event => draft.choose(scope, event.target.checked, draft.owner, draft.epoch)} />
      <span className="min-w-0">{t(`trace.tool.learningConnectors.${label}`)}</span>
    </label>)}</div>
    {connection && ["connected", "reauthorization_required"].includes(connection.state) && Array.isArray(connection.scopes) && <p className="mt-2 text-[11px] text-[var(--ink-faint)]" data-testid="google-granted-scopes">{t("trace.tool.learningConnectors.grantedScopes", { scopes: granted.length ? granted.join(" / ") : t("trace.tool.learningConnectors.noGrantedScopes") })}</p>}
    {draft.dirty && <p className="mt-1 text-[11px] text-[var(--ink-faint)]">{t("trace.tool.learningConnectors.scopeDraftHint")}</p>}
  </details>;
}
