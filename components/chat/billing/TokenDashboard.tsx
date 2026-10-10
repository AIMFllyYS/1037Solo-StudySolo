'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Clock, AlertTriangle, X, Pin, RefreshCw, Loader2, BarChart2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTokenTracker } from '@/lib/stores/chat/tokenTracker';
import { useFloatingTokenTracker } from '@/lib/stores/chat/floatingTokenTracker';
import { useSettings } from '@/lib/stores/settings';
import { getModelInfoWithCustom, resolveCacheTtlSec } from '@/lib/ai/models';
import {
  FIRST_TURN_OVERHEAD_TOKENS,
  contextRingCaption,
  contextRingColor,
  contextRingLevel,
  formatContextCacheValue,
  resolveSessionContextBudget,
} from '@/lib/context/estimateFullContext';
import { useChatHistory } from '@/lib/stores/chat/chatHistory';
import { estimateTokens } from '@/lib/context/estimateTokens';
import { getMessageText } from '@/lib/chat/messageParts';
import { useDraggable } from '@/lib/hooks/layout/useDraggable';
import { Tooltip } from '@/components/ui/Tooltip';
import { useOverlayRegistration } from '@/lib/keyboard/useOverlayRegistration';
import { openBillingDashboard } from '@/lib/window/openBillingDashboard';
import { useBillingStore } from '@/lib/stores/billing';
import { costCnyToUsd, summarizeSessionLedger } from '@/lib/billing/ledgerView';
import { refreshBillingFromLedger } from '@/lib/billing/syncUsageLedger';
import { UsageProgressBar } from '@/components/chat/billing/UsageProgressBar';
import { ContextUsageRing } from '@/components/chat/billing/ContextUsageRing';
import { ACCOUNT_USAGE_CHANGED, notifyAccountUsageChanged } from '@/lib/billing/quotaView';
import { compactActiveSession } from '@/lib/context/compactChatSession';
import { translateNow, useT } from "@/lib/i18n/index";
import { loadSessionSummary, type SessionSummary } from "@/lib/storage/sessionSummary";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(yuan: number): string {
  if (yuan < 0.0001) return '¥0';
  if (yuan < 0.01) return `¥${yuan.toFixed(4)}`;
  return `¥${yuan.toFixed(2)}`;
}

function fmtUsd(yuan: number, rate: number): string {
  const usd = costCnyToUsd(yuan, rate);
  if (usd < 0.0001) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtMoneyPair(yuan: number, rate: number): string {
  return `${fmtCost(yuan)} / ${fmtUsd(yuan, rate)}`;
}

function fmtDuration(sec: number): string {
  if (sec <= 0) return translateNow('panel.token.expired');
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function calcCost(
  prompt: number, completion: number, cached: number,
  pricing?: { input: number; cachedInput: number; output: number },
): number {
  if (!pricing) return 0;
  const uncached = Math.max(0, prompt - cached);
  return (uncached * pricing.input + cached * pricing.cachedInput + completion * pricing.output) / 1_000_000;
}

// 上下文分项（IDE 式构成条）：键对应 ContextBreakdown，色值固定且明暗主题均可辨。
const BREAKDOWN_CATS: { key: 'tools' | 'skills' | 'pages' | 'webSearch' | 'conversation'; labelKey: string; color: string }[] = [
  { key: 'tools', labelKey: 'panel.token.cat.tools', color: '#8b5cf6' },
  { key: 'skills', labelKey: 'panel.token.cat.skills', color: '#ec4899' },
  { key: 'pages', labelKey: 'panel.token.cat.pages', color: '#f59e0b' },
  { key: 'webSearch', labelKey: 'panel.token.cat.webSearch', color: '#3b82f6' },
  { key: 'conversation', labelKey: 'panel.token.cat.conversation', color: '#10b981' },
];

export default function TokenDashboard({ isLoading = false, floatingSessionId, modelId }: { isLoading?: boolean; floatingSessionId?: string; modelId?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [panelHeight, setPanelHeight] = useState(560);
  // 拖动：rAF + transform（零重渲染），松手才提交。left 正向、bottom 反向（向上拖 = bottom 增大）。
  const { elRef, onPointerDown } = useDraggable((dx, dy) => setPos((p) => ({ x: p.x + dx, y: p.y - dy })));

  // 全局 tracker（主面板用）——费用改读台账，tracker 只负责上下文与缓存倒计时。
  const gLastTurn = useTokenTracker((s) => s.lastTurn);
  const gCtxTokens = useTokenTracker((s) => s.currentContextTokens);
  const gCtxLimit = useTokenTracker((s) => s.modelContextLimit);
  const gLastRequestTime = useTokenTracker((s) => s.lastRequestTime);
  const gBreakdown = useTokenTracker((s) => s.contextBreakdown);
  const gServerContextTokens = useTokenTracker((s) => s.serverContextTokens);
  const gContextTruncated = useTokenTracker((s) => s.contextTruncated);
  const gContextWarning = useTokenTracker((s) => s.contextWarning);

  // 浮窗 tracker（划词浮窗用，按 sessionId 隔离）
  const floatingData = useFloatingTokenTracker((s) => floatingSessionId ? (s.sessions[floatingSessionId] ?? null) : null);
  const fData = floatingSessionId ? floatingData ?? useFloatingTokenTracker.getState().getSession(floatingSessionId) : null;

  const lastTurn = fData?.lastTurn ?? gLastTurn;
  const ctxTokens = fData?.currentContextTokens ?? gCtxTokens;
  const ctxLimit = fData?.modelContextLimit ?? gCtxLimit;
  const lastRequestTime = fData?.lastRequestTime ?? gLastRequestTime;
  const breakdown = fData?.contextBreakdown ?? gBreakdown;
  const serverContextTokens = fData?.serverContextTokens ?? gServerContextTokens;
  const contextTruncated = fData?.contextTruncated ?? gContextTruncated;
  const contextWarning = fData?.contextWarning ?? gContextWarning;

  const globalSelectedModelId = useSettings((s) => s.selectedModelId);
  const customApiGroups = useSettings((s) => s.customApiGroups);
  const usdExchangeRate = useSettings((s) => s.usdExchangeRate);
  const selectedModelId = modelId ?? globalSelectedModelId;
  const activeSessionId = useChatHistory((s) => s.activeSessionId);
  const billingRecords = useBillingStore((s) => s.records);
  const ledgerSessionId = floatingSessionId ?? activeSessionId;
  const sessionLedger = useMemo(
    () => summarizeSessionLedger(billingRecords, ledgerSessionId),
    [billingRecords, ledgerSessionId],
  );
  const modelInfo = getModelInfoWithCustom(selectedModelId, customApiGroups);
  const pricing = modelInfo?.pricing;
  const cacheTtlSec = resolveCacheTtlSec(modelInfo?.cacheTtlSec);

  // ── 上下文实时估算（前端先算，后端 usage 再覆盖为真值）+ 手动刷新 ──
  // 读 getState 不订阅 sessions，避免流式时整组件重渲染风暴。
  const recompute = useCallback(() => {
    const st = useChatHistory.getState();
    const sid = floatingSessionId ?? st.activeSessionId;
    const msgs = st.messagesById[sid ?? ''] ?? [];
    const modelLimit = (getModelInfoWithCustom(modelId ?? useSettings.getState().selectedModelId, useSettings.getState().customApiGroups)?.contextK ?? 128) * 1000;
    const tracker = floatingSessionId
      ? useFloatingTokenTracker.getState().getSession(floatingSessionId)
      : useTokenTracker.getState();
    const limit = resolveSessionContextBudget(tracker.sessionContextBudgetTokens, modelLimit);

    const serverCtx = floatingSessionId
      ? useFloatingTokenTracker.getState().getSession(floatingSessionId).serverContextTokens
      : useTokenTracker.getState().serverContextTokens;

    const setCurrentContext = (tokens: number) => {
      if (floatingSessionId) {
        useFloatingTokenTracker.getState().setCurrentContext(floatingSessionId, tokens, limit);
      } else {
        useTokenTracker.getState().setCurrentContext(tokens, limit);
      }
    };

    const displayBase = tracker.contextBreakdown?.displayTotal ?? serverCtx;
    if (displayBase > 0) {
      const lastAssistantIdx = (() => {
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') return i;
        }
        return -1;
      })();
      const newMsgs = lastAssistantIdx >= 0 ? msgs.slice(lastAssistantIdx + 1) : msgs;
      const newText = newMsgs
        .map((m) => getMessageText(m))
        .join('');
      const newTokens = estimateTokens(newText);
      setCurrentContext(displayBase + newTokens);
    } else {
      const windowStart = st.sessionWindowById[sid ?? '']?.startTurn ?? 0;
      const prefixTokens = open && summary?.sessionId === sid
        ? summary.turnTokenEstimates.slice(0, windowStart).reduce((total, value) => total + value, 0)
        : 0;
      const text = msgs
        .map((m) => getMessageText(m))
        .join('');
      const est = prefixTokens + estimateTokens(text) + FIRST_TURN_OVERHEAD_TOKENS;
      setCurrentContext(est);
    }
  }, [floatingSessionId, modelId, summary, open]);

  const runCompact = useCallback(async () => {
    if (compacting) return;
    setCompacting(true);
    try {
      await compactActiveSession(floatingSessionId ?? useChatHistory.getState().activeSessionId);
      recompute();
    } catch {
      // The shared in-conversation status reports the error and preserves original history.
    } finally {
      setCompacting(false);
    }
  }, [compacting, floatingSessionId, recompute]);

  // Build a bounded derived estimate on demand; keep the authoritative body windowed.
  useEffect(() => {
    if (!open) return;
    const sid = floatingSessionId ?? useChatHistory.getState().activeSessionId;
    if (!sid) return;
    const controller = new AbortController();
    void loadSessionSummary(sid, controller.signal).then((value) => {
      if (!controller.signal.aborted && value) setSummary(value);
    }).catch(() => { if (!controller.signal.aborted) setSummary(null); });
    return () => controller.abort();
  }, [open, floatingSessionId, activeSessionId]);

  // Closed panels do not scan/join the chat every five seconds.
  useEffect(() => {
    recompute();
    if (!open) return;
    const id = setInterval(recompute, 2500);
    return () => clearInterval(id);
  }, [open, recompute, activeSessionId, isLoading]);

  useEffect(() => {
    if (!open) return;
    const refresh = () => { void refreshBillingFromLedger(); };
    refresh();
    window.addEventListener(ACCOUNT_USAGE_CHANGED, refresh);
    return () => window.removeEventListener(ACCOUNT_USAGE_CHANGED, refresh);
  }, [ledgerSessionId, open]);

  const ratio = ctxLimit > 0 ? ctxTokens / ctxLimit : 0;
  const pctText = `${Math.min(Math.round(ratio * 100), 999)}%`;
  const ringLevel = contextRingLevel(ratio);
  const ringColor = contextRingColor(ringLevel);
  const ringCaptionKey = contextRingCaption(ringLevel);
  const ringCaption = ringCaptionKey ? t(ringCaptionKey) : '';
  const barColor = ringColor;
  const cachedTokens = breakdown?.cachedTokens ?? lastTurn.cachedTokens;
  const showCacheRow = breakdown?.cachedTokens !== undefined
    || lastTurn.cachedTokens > 0
    || lastTurn.promptTokens > 0;

  const turnCost = sessionLedger.lastTurn.costCny;
  const totalCost = sessionLedger.costCny;

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      const pw = Math.min(300, width - 16);
      const mobile = width < 640;
      setPos({ x: Math.max(8, Math.min(r.left, width - pw - 8)), y: mobile
        ? Math.max(8, window.innerHeight - top - height + 8)
        : Math.max(8, window.innerHeight - r.top + 6) });
      setPanelHeight(Math.max(120, Math.min(560, mobile ? height * 0.75 : r.top - top - 16)));
    };
    place();
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [open]);

  useOverlayRegistration({
    id: 'token-dashboard',
    open: open && !pinned,
    onClose: () => setOpen(false),
    priority: 55,
  });

  useEffect(() => {
    if (!open || pinned) return;
    const onDown = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || elRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, pinned, elRef]);

  const hasContextData = serverContextTokens > 0 || ctxTokens > 0;
  const iconSvg = <ContextUsageRing ratio={hasContextData ? ratio : 0} size={14} />;

  return (
    <>
      <Tooltip
        content={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {isLoading && <Loader2 size={11} className="animate-spin" />}
            {t('panel.token.tooltip', { pct: pctText, used: fmtTokens(ctxTokens), limit: fmtTokens(ctxLimit) })}
            {ringCaption ? ` · ${ringCaption}` : ''}
          </span>
        }
        placement="top"
      >
        <button
          ref={btnRef}
          onClick={() => setOpen((v) => !v)}
          aria-label={t('panel.token.open')}
          aria-expanded={open}
          className="press flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
        >
          {iconSvg}
          <span
            className="model-menu-label model-menu-label-full"
            style={hasContextData ? { color: ringColor, opacity: 0.85, transition: 'color 0.3s ease' } : undefined}
          >
            {fmtTokens(ctxTokens)}
          </span>
        </button>
      </Tooltip>

      {open && createPortal(
        <div
          ref={elRef}
          style={{
            position: 'fixed',
            left: pos.x,
            bottom: pos.y,
            width: 'min(300px, calc(100vw - 16px))',
            maxHeight: panelHeight,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            zIndex: 9999,
          }}
          className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] shadow-lg animate-[dropdown-in_0.15s_ease-out]"
        >
          {/* Title bar — draggable */}
          <div
            onPointerDown={onPointerDown}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderBottom: '1px solid var(--line)',
              cursor: 'grab', userSelect: 'none', touchAction: 'none',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{t('panel.token.title')}</span>
            <span style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => openBillingDashboard()}
                title={t('panel.token.openBilling')}
                data-no-drag
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--md-sys-color-primary)' }}
              >
                <BarChart2 size={13} />
              </button>
              <button
                onClick={() => {
                  setRefreshing(true);
                  recompute();
                  notifyAccountUsageChanged();
                  setTimeout(() => setRefreshing(false), 600);
                }}
                title={t('panel.token.refresh')}
                data-no-drag
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} />
              </button>
              <button
                onClick={() => setPinned((v) => !v)}
                title={t(pinned ? 'panel.token.unpin' : 'panel.token.pin')}
                data-no-drag
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: pinned ? 'var(--md-sys-color-primary)' : 'var(--ink-faint)',
                }}
              >
                <Pin size={13} style={{ transform: pinned ? 'rotate(-45deg)' : undefined }} />
              </button>
              <button
                onClick={() => { setOpen(false); setPinned(false); }}
                aria-label={t('panel.token.close')}
                data-no-drag
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-faint)' }}
              >
                <X size={13} />
              </button>
            </span>
          </div>

          <div style={{ padding: '10px 12px', fontSize: 11 }}>
            {/* Context usage bar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, color: 'var(--ink-soft)' }}>
                <span>{t('panel.token.used')}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: barColor, fontWeight: 600 }}>
                    {fmtTokens(ctxTokens)} / {fmtTokens(ctxLimit)} &nbsp;{pctText}
                  </span>
                  <button
                    type="button"
                    onClick={() => { void runCompact(); }}
                    disabled={compacting}
                    data-testid="context-compact"
                    style={{
                      background: 'none',
                      border: '1px solid var(--line)',
                      borderRadius: 6,
                      padding: '1px 6px',
                      fontSize: 10,
                      color: 'var(--accent-ink)',
                      cursor: compacting ? 'wait' : 'pointer',
                    }}
                  >
                    {t(compacting ? 'panel.token.compacting' : 'panel.token.compact')}
                  </button>
                </span>
              </div>
              <UsageProgressBar ratio={ratio} ariaLabel={t('panel.token.usageAria')} />
              {ringCaption && (
                <div style={{ marginTop: 4, fontSize: 10, color: ringColor }}>{ringCaption}</div>
              )}
            </div>

            {(contextTruncated || showCacheRow) && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginBottom: 10 }}>
                {showCacheRow && (
                  <Row label={t('panel.token.cacheRow')} value={formatContextCacheValue(cachedTokens, fmtTokens)} />
                )}
                {contextTruncated && (
                  <Row label={t('panel.token.sendPolicy')} value={t('panel.token.sendPolicyRolling')} accent />
                )}
                {contextWarning && (
                  <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.35, color: 'var(--md-sys-color-error)' }}>
                    {contextWarning}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--ink-soft)' }}>
                <span>{t('panel.token.breakdown')}</span>
                <span style={{ fontWeight: 600 }}>{fmtTokens(breakdown?.total ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, background: 'var(--bg-muted)', overflow: 'hidden' }}>
                {BREAKDOWN_CATS.map((c) => {
                  const v = breakdown?.[c.key] ?? 0;
                  const w = ctxLimit > 0 ? (v / ctxLimit) * 100 : 0;
                  if (w <= 0) return null;
                  return (
                    <div
                      key={c.key}
                      title={`${t(c.labelKey)} ${fmtTokens(v)}`}
                      style={{ width: `${w}%`, height: '100%', background: c.color, transition: 'width 0.3s ease' }}
                    />
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 6 }}>
                {BREAKDOWN_CATS.map((c) => {
                  const v = breakdown?.[c.key] ?? 0;
                  const total = breakdown?.total ?? 0;
                  const pct = total > 0 ? Math.round((v / total) * 100) : 0;
                  return (
                    <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--ink-soft)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                      <span>{t(c.labelKey)}</span>
                      <span style={{ color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtTokens(v)}·{pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Last turn */}
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginBottom: 8 }}>
              <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{t('panel.token.lastTurn')}</div>
              <Row label={t('panel.token.promptTokens')} value={fmtTokens(sessionLedger.lastTurn.promptTokens)} />
              <Row label={t('panel.token.completionTokens')} value={fmtTokens(sessionLedger.lastTurn.completionTokens)} />
              <Row label={t('panel.token.cacheHit')} value={fmtTokens(sessionLedger.lastTurn.cachedTokens)} />
              <Row label={t('panel.token.turnCost')} value={fmtMoneyPair(turnCost, usdExchangeRate)} accent />
            </div>

            {/* Prefix cache countdown — 隔离到子组件，其每秒 tick 不再重渲整个看板 */}
            <CacheCountdown
              cacheTtlSec={cacheTtlSec}
              lastRequestTime={lastRequestTime}
              pricing={pricing}
              lastTurn={lastTurn}
              turnCost={turnCost}
            />

            {/* Session total */}
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{t('panel.token.total')}</div>
              <Row label={t('panel.token.totalInput')} value={fmtTokens(sessionLedger.promptTokens)} />
              <Row label={t('panel.token.totalOutput')} value={fmtTokens(sessionLedger.completionTokens)} />
              <Row label={t('panel.token.cacheHit')} value={t('panel.token.hitCount', { count: sessionLedger.cacheHitCount })} />
              <Row label={t('panel.token.hitRate')} value={`${Math.round(sessionLedger.cacheHitRate * 100)}%`} />
              <Row label={t('panel.token.totalCost')} value={fmtMoneyPair(totalCost, usdExchangeRate)} accent />
            </div>

            <div style={{ marginTop: 8, fontSize: 9, color: 'var(--ink-faint)', lineHeight: 1.3 }}>
              {t('panel.token.priceNote', { minutes: Math.round(cacheTtlSec / 60) })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '1.5px 0',
      color: accent ? 'var(--md-sys-color-primary)' : 'var(--ink-soft)',
    }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: accent ? 600 : 400 }}>{value}</span>
    </div>
  );
}

// Prefix cache 倒计时：自带每秒 tick，隔离重渲染范围（不影响外层看板）。
function CacheCountdown({
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
