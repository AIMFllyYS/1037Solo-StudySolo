"use client";

import { useEffect, useState } from "react";
import { UsageProgressBar } from "@/components/chat/billing/UsageProgressBar";
import { useAuthSession } from "@/lib/hooks/auth/useAuthSession";
import { getCachedCloudSyncUsage, loadCloudSyncUsage } from "@/lib/sync/engine";
import { MAX_USER_SYNC_BYTES } from "@/lib/sync/types";
import { formatSyncBytes, type CloudSyncUsage } from "@/lib/sync/usage";
import { useCloudSyncStatus } from "@/lib/sync/status";
import { useT } from "@/lib/i18n/index";

export function StorageQuotaBlock({ showHint = true }: { showHint?: boolean }) {
  const t = useT();
  const { status } = useAuthSession();
  const cloudSync = useCloudSyncStatus();
  const signedIn = status === "signedIn";
  const [usage, setUsage] = useState<CloudSyncUsage | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedCloudSyncUsage();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setUsage(cached);
    void loadCloudSyncUsage().then((next) => {
      if (!cancelled) setUsage(next);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn, cloudSync.phase, revision]);

  const title = t(usage?.source === "local" ? "panel.storage.local" : "panel.storage.cloud");
  const limitBytes = usage?.limitBytes ?? MAX_USER_SYNC_BYTES;
  const totalBytes = usage?.totalBytes ?? 0;

  return (
    <div className="rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2">
      {!usage ? (
        <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{t("panel.storage.loading")}</p>
      ) : (
        <>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
            <span className="text-[var(--md-sys-color-on-surface)]">{title}</span>
            <div className="flex items-center gap-2">
              <strong className="text-[var(--md-sys-color-on-surface)]">
                {formatSyncBytes(totalBytes)}{" "}
                <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">
                  / {formatSyncBytes(limitBytes)}
                </span>
              </strong>
              <button
                type="button"
                className="text-[11px] text-[var(--md-sys-color-primary)]"
                onClick={() => setRevision((n) => n + 1)}
              >
                {t("panel.storage.refresh")}
              </button>
            </div>
          </div>
          <UsageProgressBar
            ratio={limitBytes > 0 ? totalBytes / limitBytes : 0}
            ariaLabel={title}
          />
          <div className="mt-2 flex flex-col gap-1.5">
            {(usage.pools ?? []).map((row) => (
              <div key={row.id}>
                <div className="mb-1 flex justify-between gap-2 text-[11px] text-[var(--md-sys-color-on-surface)]">
                  <span>
                    {t(row.labelKey)}
                    {row.count > 0 ? ` · ${row.count} ${t(row.unitKey)}` : ""}
                  </span>
                  <strong className="font-medium">
                    {formatSyncBytes(row.bytes)}{" "}
                    <span className="font-normal text-[var(--md-sys-color-on-surface-variant)]">
                      / {formatSyncBytes(row.limitBytes)}
                    </span>
                  </strong>
                </div>
                <UsageProgressBar
                  ratio={row.limitBytes > 0 ? row.bytes / row.limitBytes : 0}
                  ariaLabel={t(row.labelKey)}
                  height={4}
                />
              </div>
            ))}
            {usage.kinds.map((row) => (
              <div key={row.kind}>
                <div className="mb-1 flex justify-between gap-2 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  <span>
                    {t(row.labelKey)}
                    {row.count > 0 ? ` · ${row.count} ${t(row.unitKey)}` : ""}
                  </span>
                  <strong className="font-medium text-[var(--md-sys-color-on-surface)]">
                    {formatSyncBytes(row.bytes)}
                  </strong>
                </div>
                <UsageProgressBar
                  ratio={totalBytes > 0 ? row.bytes / totalBytes : 0}
                  ariaLabel={t("panel.storage.rowAria", { label: t(row.labelKey) })}
                  height={4}
                />
              </div>
            ))}
          </div>
          {showHint ? (
            usage.error ? (
              <p className="mt-1.5 text-[10px] text-[var(--md-sys-color-error)]">{usage.error}</p>
            ) : (
              <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
                {t(signedIn ? "panel.storage.hintSignedIn" : "panel.storage.hintLocal")}
              </p>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
