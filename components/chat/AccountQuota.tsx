'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { fetchQuota } from '@/lib/billing/fetchQuota';
import { ACCOUNT_USAGE_CHANGED, type QuotaView } from '@/lib/billing/quotaView';
import { UsageProgressBar } from '@/components/chat/UsageProgressBar';
import { openMembershipSponsor } from '@/lib/window/openMembershipSponsor';
import { translateNow, useT } from "@/lib/i18n";

const TIER_KEYS = { free: 'panel.quota.tier.free', plus: 'panel.quota.tier.plus', pro: 'panel.quota.tier.pro' };
const money = (n: number) => `¥${Math.max(0, n).toFixed(n > 0 && n < 0.01 ? 4 : 2)}`;

function GetMembershipTag() {
  const t = useT();
  return (
    <button
      type="button"
      className="press membership-get-tag"
      onClick={() => openMembershipSponsor()}
    >
      <Sparkles size={10} strokeWidth={2.2} aria-hidden="true" />
      {t('panel.quota.getMembership')}
    </button>
  );
}

export function AccountQuota({ variant = "context" }: { variant?: "context" | "panel" }) {
  const t = useT();
  const { userId, status } = useAuthSession();
  const [state, setState] = useState<{ userId: string | null; data?: QuotaView; error?: string }>({ userId: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || document.visibilityState === 'hidden') return;
      refreshing = true;
      try {
        const data = await fetchQuota(userId);
        if (!disposed) setState({ userId, data });
      } catch (error) {
        if (!disposed) setState((old) => ({ userId, data: old.userId === userId ? old.data : undefined, error: error instanceof Error ? error.message : translateNow('panel.quota.unavailable') }));
      } finally { refreshing = false; }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener(ACCOUNT_USAGE_CHANGED, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      window.removeEventListener('focus', refresh);
      window.removeEventListener(ACCOUNT_USAGE_CHANGED, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [userId, revision]);
  const chrome = variant === "panel" ? "mb-3" : "mb-3 border-b border-[var(--line)] pb-3";
  if (!userId) {
    return (
      <div className={`flex items-center justify-between gap-2 ${chrome}`}>
        <p className="min-w-0 text-[11px] text-[var(--ink-faint)]">{t(status === 'loading' ? 'panel.quota.loadingAccount' : 'panel.quota.signInHint')}</p>
        <GetMembershipTag />
      </div>
    );
  }
  const data = state.userId === userId ? state.data : undefined;
  const error = state.userId === userId ? state.error : undefined;
  return <section aria-label={t('panel.quota.title')} className={chrome}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <strong className="text-[12px] text-[var(--ink)]">{data ? (data.tier === 'ultra' ? 'Ultra' : t(TIER_KEYS[data.tier === 'pro_plus' ? 'plus' : data.tier])) : t('panel.quota.title')}</strong>
        <GetMembershipTag />
      </div>
      <button type="button" className="shrink-0 rounded px-2 py-1 text-[11px] text-[var(--accent-ink)] hover:bg-[var(--bg-muted)]" onClick={() => setRevision((n) => n + 1)}>{t('panel.quota.refresh')}</button>
    </div>
    {data ? <>
      {((data.sharedWallet ? ['platform'] : ['platform', 'byok']) as Array<'platform' | 'byok'>).map((key) => <div key={key} className="mb-2">
        <div className="flex justify-between gap-2 text-[11px]"><span>{data.sharedWallet ? '生态共享 AI 额度' : t(key === 'platform' ? 'panel.quota.platform' : 'panel.quota.byok')}</span><strong className={data[key].remaining <= 0 ? 'text-[var(--md-sys-color-error)]' : ''}>{money(data[key].remaining)} <span className="font-normal text-[var(--ink-faint)]">/ {money(data[key].cap)}</span></strong></div>
        <div className="mt-1">
          <UsageProgressBar
            ratio={data[key].cap > 0 ? data[key].remaining / data[key].cap : 0}
            ariaLabel={t(key === 'platform' ? 'panel.quota.platformRemaining' : 'panel.quota.byokRemaining')}
            invertRisk
          />
        </div>
      </div>)}
      <p className="text-[10px] leading-relaxed text-[var(--ink-faint)]">{data.sharedWallet ? `各项目共用同一额度，当前预留 ${money(data.heldCny ?? 0)}。` : <>{t('panel.quota.note')}<br />{t('panel.quota.periodEnd', { date: new Date(data.periodEnd).toLocaleDateString('zh-CN') })}</>}</p>
      {error ? <p className="mt-1 text-[10px] text-[var(--ink-faint)]">{t('panel.quota.updatedAt', { time: new Date(data.updatedAt).toLocaleTimeString('zh-CN') })}</p> : null}
    </> : !error ? <p role="status">{t('panel.quota.reading')}</p> : null}
    {error ? <p role="status" className="mt-1 text-[11px] text-[var(--md-sys-color-error)]">{error}</p> : null}
  </section>;
}
