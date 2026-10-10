'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { X, Pin, RefreshCw, Loader2, BarChart2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTokenTracker } from '@/lib/stores/chat/tokenTracker';
import { useFloatingTokenTracker } from '@/lib/stores/chat/floatingTokenTracker';
import { useSettings } from '@/lib/stores/settings';
import { getModelInfoWithCustom, resolveCacheTtlSec } from '@/lib/ai/models';
import { FIRST_TURN_OVERHEAD_TOKENS, contextRingCaption, contextRingColor, contextRingLevel, formatContextCacheValue, resolveSessionContextBudget } from '@/lib/context/estimateFullContext';
import { useChatHistory } from '@/lib/stores/chat/chatHistory';
import { estimateTokens } from '@/lib/context/estimateTokens';
import { getMessageText } from '@/lib/chat/messages/messageParts';
import { useDraggable } from '@/lib/hooks/layout/useDraggable';
import { Tooltip } from '@/components/ui/Tooltip';
import { useOverlayRegistration } from '@/lib/keyboard/useOverlayRegistration';
import { openBillingDashboard } from '@/lib/window/openBillingDashboard';
import { useBillingStore } from '@/lib/stores/billing';
import { summarizeSessionLedger } from '@/lib/billing/ledgerView';
import { refreshBillingFromLedger } from '@/lib/billing/syncUsageLedger';
import { UsageProgressBar } from '@/components/chat/billing/UsageProgressBar';
import { ContextUsageRing } from '@/components/chat/billing/ContextUsageRing';
import { ACCOUNT_USAGE_CHANGED, notifyAccountUsageChanged } from '@/lib/billing/quotaView';
import { compactActiveSession } from '@/lib/context/compactChatSession';
import { useT } from "@/lib/i18n/index";
import { loadSessionSummary, type SessionSummary } from "@/lib/storage/sessionSummary";
import { fmtTokens, fmtMoneyPair } from "@/lib/billing/displayFormats";
import { Row } from "./tokenDashboard/Row";
import { BREAKDOWN_CATS } from "./tokenDashboard/categories";
import { CacheCountdown } from "./tokenDashboard/CacheCountdown";
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