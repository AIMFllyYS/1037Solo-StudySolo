import { useEffect, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

import { useT } from "@/lib/i18n/index";

import { fmtCost, calcCost, fmtDuration } from "@/lib/billing/displayFormats";
// Prefix cache 倒计时：自带每秒 tick，隔离重渲染范围（不影响外层看板）。
export function CacheCountdown({
  cacheTtlSec, lastRequestTime, pricing, lastTurn, turnCost,
}: {
  cacheTtlSec?: number;
  lastRequestTime?: number | null;
  pricing?: { input: number; cachedInput: number; output: number };
  lastTurn: { promptTokens: number; completionTokens: number; cachedTokens: number };
  turnCost: number;
}) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!lastRequestTime || !cacheTtlSec) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lastRequestTime, cacheTtlSec]);

  if (!cacheTtlSec || !lastRequestTime) {
    return (
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <Clock size={11} style={{ color: 'var(--ink-faint)' }} />
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{t('panel.token.countdown')}</span>
          <span style={{ fontSize: 9, color: 'var(--ink-faint)', fontWeight: 400 }}>{t('panel.token.estimate')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, color: 'var(--ink-soft)' }}>
          <span>{t('panel.token.remaining')}</span>
          <span style={{ color: 'var(--ink-faint)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>0s</span>
        </div>
        <div style={{ height: 5, borderRadius: 2.5, background: 'var(--bg-muted)', overflow: 'hidden' }}>
          <div style={{ width: '0%', height: '100%', borderRadius: 2.5, background: 'var(--ink-faint)' }} />
        </div>
        <div style={{ fontSize: 9, color: 'var(--ink-faint)', marginTop: 3, lineHeight: 1.3 }}>
          {t('panel.token.waiting')}
        </div>
      </div>
    );
  }

  const cacheElapsed = (now - lastRequestTime) / 1000;
  const cacheRemaining = Math.max(0, cacheTtlSec - cacheElapsed);
  const cacheExpired = cacheRemaining <= 0;
  const cacheRatio = cacheRemaining / cacheTtlSec;
  const cacheBarColor =
    cacheExpired ? 'var(--md-sys-color-error)' :
    cacheRatio < 0.2 ? 'var(--md-sys-color-error)' :
    cacheRatio < 0.5 ? 'var(--md-sys-color-tertiary)' :
    'var(--md-sys-color-primary)';

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <Clock size={11} style={{ color: 'var(--ink-faint)' }} />
        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{t('panel.token.countdown')}</span>
        <span style={{ fontSize: 9, color: 'var(--ink-faint)', fontWeight: 400 }}>{t('panel.token.estimate')}</span>
      </div>
      {cacheExpired ? (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 4,
          padding: '4px 6px', borderRadius: 4,
          background: 'color-mix(in srgb, var(--md-sys-color-error) 12%, transparent)',
          color: 'var(--md-sys-color-error)', fontSize: 10, lineHeight: 1.4,
        }}>
          <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {t('panel.token.expiredTitle')}
            {pricing && lastTurn.cachedTokens > 0 && (
              <strong>
                {t('panel.token.expiredDelta', {
                  amount: fmtCost(calcCost(lastTurn.promptTokens, lastTurn.completionTokens, 0, pricing) - turnCost),
                })}
              </strong>
            )}
          </span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, color: 'var(--ink-soft)' }}>
            <span>{t('panel.token.remaining')}</span>
            <span style={{ color: cacheBarColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {fmtDuration(cacheRemaining)}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 2.5, background: 'var(--bg-muted)', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.max(cacheRatio * 100, 0)}%`,
              height: '100%', borderRadius: 2.5,
              background: cacheBarColor,
              transition: 'width 1s linear, background 0.3s ease',
            }} />
          </div>
          <div style={{ fontSize: 9, color: 'var(--ink-faint)', marginTop: 3, lineHeight: 1.3 }}>
            {t('panel.token.priceShift', {
              before: pricing ? `¥${pricing.cachedInput}` : '—',
              after: pricing ? `¥${pricing.input}` : '—',
            })}
          </div>
        </>
      )}
    </div>
  );
}