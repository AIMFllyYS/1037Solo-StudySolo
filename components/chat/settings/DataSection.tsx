"use client";
import { notifyAccountUsageChanged } from '@/lib/billing/quotaView';

import { useState } from "react";
import { Cloud, DollarSign, Download, Ticket } from "lucide-react";
import { StorageQuotaBlock } from "@/components/chat/StorageQuota";
import { useSettings } from "@/lib/hooks/useSettings";
import { useAuthSession } from "@/lib/hooks/useAuthSession";
import { exportAllChats } from "@/lib/chat/exportChats";
import { exportAgentLogs } from "@/lib/ai/observability/downloadAgentLog";
import { clearCloudSyncMessage, useCloudSyncStatus } from "@/lib/sync/status";
import { MAX_FLASHCARDS_POOL_BYTES, MAX_NOTES_POOL_BYTES, MAX_USER_SYNC_BYTES } from "@/lib/sync/types";
import { h3Cls, inputCls } from "./_shared";
import { useT } from "@/lib/i18n";

export function RedemptionSection() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const t = useT();

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Ticket size={14} className="text-[var(--md-sys-color-primary)]" />
        <h3 className={h3Cls}>{t("settings.data.redeem.title")}</h3>
      </div>
      <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        {t("settings.data.redeem.desc")}
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={t("settings.data.redeem.placeholder")}
          aria-label={t("settings.data.redeem.title")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={`${inputCls} flex-1`}
        />
        <button
          type="button"
          disabled={busy || !code.trim()}
          onClick={() => {
            const submitted = code.trim();
            setBusy(true);
            setMessage(null);
            setOk(false);
            void fetch("/api/redeem", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: submitted }),
            })
              .then(async (res) => {
                const body = (await res.json().catch(() => null)) as { error?: string; tier?: string; status?: string } | null;
                if (!res.ok) {
                  setOk(false);
                  setMessage(typeof body?.error === "string" ? body.error : t("settings.data.redeem.failed"));
                  return;
                }
                setOk(true);
                notifyAccountUsageChanged();
                setCode("");
                setMessage(body?.status === "already_redeemed" ? "该兑换记录已存在，权益不会重复发放。" : body?.status === "higher_tier_kept" ? "已保留您当前更高等级的会员权益。" : body?.tier ? t("settings.data.redeem.successTier", { tier: body.tier.toUpperCase() }) : t("settings.data.redeem.success"));
              })
              .catch(() => {
                setOk(false);
                setMessage(t("settings.data.redeem.failed"));
              })
              .finally(() => setBusy(false));
          }}
          className="press shrink-0 rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--md-sys-color-on-primary)] disabled:opacity-50"
        >
          {t(busy ? "settings.data.redeem.busy" : "settings.data.redeem.submit")}
        </button>
      </div>
      {message && (
        <span
          className="text-[11px] font-medium"
          style={{
            color: ok ? "var(--md-sys-color-primary)" : "var(--md-sys-color-error)",
          }}
        >
          {message}
        </span>
      )}
    </section>
  );
}

export function BillingSection() {
  const usdExchangeRate = useSettings((s) => s.usdExchangeRate);
  const setUsdExchangeRate = useSettings((s) => s.setUsdExchangeRate);
  const t = useT();

  return (
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <DollarSign size={14} className="text-[var(--md-sys-color-primary)]" />
          <h3 className={h3Cls}>{t("settings.data.billing.title")}</h3>
        </div>
        <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
          {t("settings.data.billing.desc")}
        </p>
        <div className="flex items-center justify-between rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2">
          <div className="text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">
            {t("settings.data.billing.rate")}
          </div>
          <input
            type="number"
            min={0.01}
            max={10.00}
            step={0.01}
            value={usdExchangeRate || ""}
            onBlur={(e) => {
              const val = parseFloat(e.target.value);
              setUsdExchangeRate(Number.isNaN(val) ? 7.00 : val);
            }}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) setUsdExchangeRate(v);
            }}
            className="w-20 rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] px-2 py-1 text-right text-[12.5px] outline-none focus:border-[var(--md-sys-color-primary)]"
          />
        </div>
      </section>
  );
}

export function CloudSyncSection() {
  const { status } = useAuthSession();
  const cloudSync = useCloudSyncStatus();
  const signedIn = status === "signedIn";
  const limitMb = Math.round((MAX_USER_SYNC_BYTES / (1024 * 1024)) * 10) / 10;
  const t = useT();

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Cloud size={14} className="text-[var(--md-sys-color-primary)]" />
        <h3 className={h3Cls}>{t("settings.data.cloudSync.title")}</h3>
      </div>
      <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        {t("settings.data.cloudSync.desc", {
          limitMb,
          notesPoolMb: Math.round(MAX_NOTES_POOL_BYTES / (1024 * 1024)),
          flashcardsPoolMb: Math.round(MAX_FLASHCARDS_POOL_BYTES / (1024 * 1024)),
        })}
      </p>
      <StorageQuotaBlock />
      <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        {t(signedIn ? "settings.data.cloudSync.signedIn" : "settings.data.cloudSync.signedOut")}
      </p>
      {cloudSync.message ? (
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-[11px] font-medium"
            style={{
              color: cloudSync.phase === "error"
                ? "var(--md-sys-color-error)"
                : "var(--md-sys-color-primary)",
            }}
          >
            {cloudSync.message}
          </span>
          <button
            type="button"
            className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]"
            onClick={clearCloudSyncMessage}
          >
            {t("panel.common.close")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function ExportSection() {
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [logExportMsg, setLogExportMsg] = useState<string | null>(null);
  const t = useT();

  return (
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Download size={14} className="text-[var(--md-sys-color-primary)]" />
          <h3 className={h3Cls}>{t("settings.data.export.title")}</h3>
        </div>
        <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
          {t("settings.data.export.desc")}
        </p>
        <button
          onClick={() => {
            void exportAllChats().then((r) => {
              setExportMsg(r.ok ? t("settings.data.export.done", { count: r.count }) : t("settings.data.export.empty"));
            });
          }}
          className="press flex items-center gap-1.5 self-start rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--md-sys-color-on-primary)]"
        >
          <Download size={13} /> {t("settings.data.export.chats")}
        </button>
        {exportMsg && (
          <span className="text-[11px] font-medium text-[var(--md-sys-color-primary)]">
            {exportMsg}
          </span>
        )}
        <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
          {t("settings.data.export.logsDesc")}
        </p>
        <button
          type="button"
          aria-label={t("settings.data.export.logs")}
          onClick={() => {
            void exportAgentLogs().then((r) => {
              setLogExportMsg(r.ok ? (r.empty ? t("settings.data.export.noLogs") : t("settings.data.export.logExported")) : (r.error ?? t("settings.data.export.failed")));
            });
          }}
          className="press flex items-center gap-1.5 self-start rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--md-sys-color-on-primary)]"
        >
          <Download size={13} /> {t("settings.data.export.logs")}
        </button>
        {logExportMsg && (
          <span className="text-[11px] font-medium text-[var(--md-sys-color-primary)]">
            {logExportMsg}
          </span>
        )}
      </section>
  );
}
