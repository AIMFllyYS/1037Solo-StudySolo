'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AgentLoopIcon, AgentTerminalIcon, AgentFileIcon, AgentChevronIcon, AgentAlertIcon, AgentArrowUpRightIcon, AgentQuoteIcon } from '@/components/icons/AgentIcons';
import { useArtifacts, type Artifact } from '@/lib/hooks/useArtifacts';
import { useSharedArtifact } from '@/components/share/ShareViewContext';
import { useSettings } from '@/lib/hooks/useSettings';
import { getModelInfoWithCustom, selectCustomApiGroupsForRequest } from '@/lib/ai/models';
import { parseSseJsonEvents } from '@/lib/utils/sseEvents';
import { createStreamUiThrottle } from '@/lib/chat/streamUiThrottle';
import { MessageContent } from '@/components/chat/messages/MessageContent';
import { useProcessingDisclosure } from '@/lib/hooks/useProcessingDisclosure';
import { openHtmlInNewTab } from '@/lib/utils/openHtmlInNewTab';
import { useT } from '@/lib/i18n/index';
import {getStorageOwner,getOwnerEpoch} from '@/lib/storage/ownerScope';
import {acquireArtifactBodyLease,hydrateArtifactBody} from '@/lib/stores/artifacts';

type ArtifactApiEvent =
  | { type: 'ping'; t?: number }
  | { type: 'artifact'; id: string; status: 'start'; title?: string }
  | { type: 'artifact'; id: string; status: 'reasoning'; delta?: string }
  | { type: 'artifact'; id: string; status: 'delta'; delta?: string }
  | { type: 'artifact'; id: string; status: 'done'; html?: string }
  | { type: 'artifact'; id: string; status: 'error'; message?: string };

/**
 * HTML 演示（Artifact）消息内卡片。链路入口见 lib/ai/agent/tools/renderInteractive/tool.ts。
 * 本文件只负责 SSE 生成与「打开演示」；真正的 iframe 浮窗在 ArtifactViewer（AppShell 全局层）。
 * 不要在 components/notes/ 或右侧面板里给演示再做一份组件。
 */
export default function ArtifactCard({
  artifactId,
  title: titleProp,
  prompt,
  modelId,
  unsupportedReason,
  autoStart = false,
  silent = false,
}: {
  artifactId: string;
  title?: string;
  prompt?: string;
  modelId?: string;
  unsupportedReason?: string;
  autoStart?: boolean;
  /** Agent 中间栏不画卡，但仍要跑生成，入口在右上参考列。 */
  silent?: boolean;
}) {
  /**
   * 只读分享页：产物来自分享快照，**不注入**本地产物表（公开页不该产生写入，
   * 更不该把别人的 HTML 带进访客自己的账号）。默认 context 返回 null，
   * 非分享页的取值路径与改动前完全一致。
   */
  const sharedArtifact = useSharedArtifact(artifactId);
  const storedArtifact = useArtifacts((s) => s.byId[artifactId]);
  const art: Artifact | undefined = useMemo(
    () => storedArtifact ?? (sharedArtifact ? { ...sharedArtifact, status: 'done' } : undefined),
    [storedArtifact, sharedArtifact],
  );
  const hydrated = useArtifacts((s) => s._hasHydrated);
  const saveDone = useArtifacts((s) => s.saveDone);
  useEffect(()=>{if(!storedArtifact?.bodyRef)return;const release=acquireArtifactBodyLease(artifactId);void hydrateArtifactBody(artifactId);return release;},[artifactId,storedArtifact?.bodyRef]);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const [streamHtml, setStreamHtml] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const startedRef = useRef(false);
  const [runId, setRunId] = useState(0);
  // 只取首帧 autoStart：主聊天结束导致 autoStart 翻转时，不中断或误标「数据缺失」。
  const [shouldAutoGen, setShouldAutoGen] = useState(autoStart);
  const t = useT();

  const title = titleProp || art?.title || t('window.artifact.defaultTitle');
  const html = streamHtml || art?.html || '';
  const reasoningText = reasoning || art?.reasoning || '';
  const streaming = status === 'streaming';
  const preparing = shouldAutoGen && !art && status === 'idle';
  const restoring = !hydrated && !art && !shouldAutoGen && status === 'idle';
  const done = status === 'done' || art?.status === 'done';
  const errored = status === 'error';
  const expired = hydrated && !art && !streaming && !preparing && !done && !shouldAutoGen;
  const thinkingActive = streaming || preparing;
  const [showThinking, setShowThinking] = useProcessingDisclosure(thinkingActive);
  const showThinkingSection = thinkingActive || reasoningText.length > 0;

  // 流式时自动滚到底部
  useEffect(() => {
    if (showCode && preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [html, showCode]);

  // artifact 一次性生成：startedRef 保证只发一次请求。
  // 关键：不在 cleanup 里 abort —— 否则 React StrictMode 的 setup→cleanup→setup 会掐断首个
  // 请求且因 startedRef 已置位而不再重发（dev 下「永远生成不出来」的真凶）；主聊天结束
  // (autoStart 翻转) 也会误中断尚在生成的演示。请求时长由服务端 12 分钟滑动超时收口。
  useEffect(() => {
    if (startedRef.current) return;
    if (!shouldAutoGen) return; // 历史消息里的旧卡片：不自动重生成
    if (art?.status==='done' || !prompt) return;      // 完成产物 / prompt 尚未就绪
    startedRef.current = true;
    // 一次性进入流式态：本 effect 的职责就是把生成请求这一外部异步系统挂起来，
    // 同步置初始 UI 态是必要的且只发生一次（startedRef 守卫），非级联渲染反模式。
    /* eslint-disable react-hooks/set-state-in-effect */
    setStatus('streaming');
    setShowCode(false);
    setError(null);
    setStreamHtml('');
    setReasoning('');
    /* eslint-enable react-hooks/set-state-in-effect */

    const settings = useSettings.getState();
    const artifactModelId = modelId || settings.selectedModelId;
    const artifactModelInfo = getModelInfoWithCustom(artifactModelId, settings.customApiGroups);
    if (artifactModelInfo?.type === 'image') {
      setStatus('error');
      setError(unsupportedReason || t('window.artifact.imageModelUnsupported'));
      return;
    }
    const owner=getStorageOwner(),epoch=getOwnerEpoch();
    (async () => {
      try {
        const response = await fetch('/api/artifact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: artifactId,
            title,
            prompt,
            modelId: artifactModelId,
            customApiGroups: selectCustomApiGroupsForRequest(settings.customApiGroups, artifactModelId),
          }),
        });

        if (!response.ok) {
          throw new Error(t('window.artifact.requestFailed', { status: response.status, statusText: response.statusText }));
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error(t('window.artifact.streamReadFailed'));
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let htmlBuf = '';
        let reasoningBuf = '';
        let terminal = false;
        let lastDraftAt=0;
        // delta/reasoning 事件按 chunk 来：与主聊天同一套 60ms 尾随节流，
        // 大演示流式期的 <pre> 重渲被压到 ~16/s（d2-P1-4）。终态事件先 flush 保序。
        const throttle = createStreamUiThrottle();

        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseJsonEvents<ArtifactApiEvent>(buffer);
          buffer = parsed.remaining;

          for (const event of parsed.events) {
            if (event.type === 'ping') continue;
            if (event.type !== 'artifact' || event.id !== artifactId) continue;
            if(owner!==getStorageOwner()||epoch!==getOwnerEpoch()){void reader.cancel().catch(()=>{});return;}
            if (event.status === 'start') {
              setStatus('streaming');
            } else if (event.status === 'reasoning') {
              reasoningBuf += event.delta || '';
              throttle.schedule(() => setReasoning(reasoningBuf));
            } else if (event.status === 'delta') {
              htmlBuf += event.delta || '';
              if(Date.now()-lastDraftAt>1000&&owner===getStorageOwner()&&epoch===getOwnerEpoch()){lastDraftAt=Date.now();void useArtifacts.getState().saveDraft(artifactId,title,htmlBuf,'generating').catch(()=>{});}
              throttle.schedule(() => { setStreamHtml(htmlBuf); setShowCode(true); });
            } else if (event.status === 'done') {
              terminal = true;
              const finalHtml = event.html || htmlBuf;
              htmlBuf = finalHtml;
              throttle.flush();
              setStreamHtml(finalHtml);
              setStatus('done');
              setShowCode(true);
              saveDone(artifactId, title, finalHtml, reasoningBuf);
            } else if (event.status === 'error') {
              if(owner===getStorageOwner()&&epoch===getOwnerEpoch())await useArtifacts.getState().saveDraft(artifactId,title,htmlBuf,'error');
              terminal = true;
              throttle.flush();
              setStatus('error');
              setError(event.message || t('window.artifact.generateFailed'));
            }
          }
        }
        if (!terminal) {
          if(owner===getStorageOwner()&&epoch===getOwnerEpoch())await useArtifacts.getState().saveDraft(artifactId,title,htmlBuf,'draft');
          setStatus('error');
          setError(t('window.artifact.interrupted'));
        }
      } catch (err) {
        if(owner!==getStorageOwner()||epoch!==getOwnerEpoch())return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setStatus('error');
        setError(err instanceof Error ? err.message : t('window.artifact.generateFailed'));
      }
    })();
  }, [artifactId, art, modelId, prompt, saveDone, title, unsupportedReason, runId, shouldAutoGen, t]);

  const openExternal = () => {
    if (!html) return;
    openHtmlInNewTab(html);
  };

  const codeChars = html.length;
  const onContainer = expired ? 'var(--md-sys-color-on-surface-variant)' : 'var(--md-sys-color-on-primary-container)';

  if (silent) return null;

  return (
    <div
      className="artifact-card my-2 overflow-hidden rounded-xl border"
      data-testid="artifact-card"
      style={{
        borderColor: errored || expired ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-primary)',
        background: expired ? 'var(--md-sys-color-surface-container-high)' : 'var(--md-sys-color-primary-container)',
      }}
    >
      {/* 头部：状态 + 右上角常驻「打开演示」。必须 wrap，窄栏也不能把按钮裁掉。 */}
      <div className="artifact-card-header" data-testid="artifact-card-header">
        <div className="artifact-card-heading">
          {streaming || preparing ? (
            <AgentLoopIcon size={15} className="animate-pulse motion-reduce:animate-none shrink-0" style={{ color: 'var(--md-sys-color-primary)' }} />
          ) : errored || expired ? (
            <AgentAlertIcon size={15} className="shrink-0" style={{ color: 'var(--md-sys-color-error)' }} />
          ) : (
            <AgentTerminalIcon size={15} className="shrink-0" style={{ color: 'var(--md-sys-color-primary)' }} />
          )}
          <span
            className="min-w-0 flex-1 truncate text-[12.5px] font-semibold"
            style={{ color: onContainer }}
          >
            {streaming || preparing
              ? t('window.artifact.generating', { title })
              : restoring
                ? t('window.artifact.restoring', { title })
                : errored
                  ? t('window.artifact.generateFailed')
                  : expired
                    ? t('window.artifact.dataMissingShort')
                    : t('window.artifact.ready', { title })}
          </span>
        </div>

        {(done || !!html) && !errored ? (
          <button
            type="button"
            data-testid="artifact-open-demo"
            onClick={() => {
              // 分享页的产物不在本地产物表里：开浮窗要先写 store（saveDone + openViewer），
              // 那是公开页不该做的事，改走既有的「Blob URL 新标签页」纯展示路径。
              if (sharedArtifact && !storedArtifact) {
                openHtmlInNewTab(html);
                return;
              }
              if (html && done) saveDone(artifactId, title, html, reasoningText);
              useArtifacts.getState().openViewer(artifactId);
            }}
            className="artifact-open-demo press inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
            style={{ background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)' }}
          >
            <AgentTerminalIcon size={14} /> {t('window.artifact.openDemo')}
          </button>
        ) : null}
      </div>

      {prompt && (streaming || preparing || restoring || done) && (
        <div
          style={{
            borderBottom: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 15%, transparent)',
          }}
        >
          <button
            type="button"
            data-testid="artifact-prompt-toggle"
            aria-expanded={showPrompt}
            onClick={() => setShowPrompt((v) => !v)}
            className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-[11.5px] font-medium"
            style={{ color: onContainer, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <AgentQuoteIcon size={13} className="shrink-0" />
            {t('window.artifact.basis')}
            <AgentChevronIcon size={13} style={{ transform: showPrompt ? 'rotate(180deg)' : undefined }} />
          </button>
          {showPrompt && (
            <div
              data-testid="artifact-prompt-body"
              className="chat-prose px-3 pb-2 text-[11px]"
              style={{
                color: 'var(--md-sys-color-on-surface-variant)',
                background: 'color-mix(in srgb, var(--md-sys-color-primary) 6%, transparent)',
              }}
            >
              <MessageContent content={prompt} enableVisualizations={false} preserveLineBreaks />
            </div>
          )}
        </div>
      )}

      {showThinkingSection && (
        <div
          style={{
            borderBottom: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 15%, transparent)',
          }}
        >
          <button
            type="button"
            data-testid="artifact-thinking-toggle"
            aria-expanded={showThinking}
            onClick={() => setShowThinking((v) => !v)}
            className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-[11.5px] font-medium"
            style={{ color: onContainer, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <AgentLoopIcon
              size={13}
              className={thinkingActive ? 'animate-pulse motion-reduce:animate-none' : undefined}
            />
            {thinkingActive ? t('window.artifact.thinking') : t('window.artifact.thinkingProcess')}
            <AgentChevronIcon size={13} style={{ transform: showThinking ? 'rotate(180deg)' : undefined }} />
          </button>
          {showThinking && (
            <div
              data-testid="artifact-thinking-body"
              className="chat-prose max-h-48 overflow-auto px-3 pb-2 text-[11px] leading-relaxed"
              style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
            >
              {reasoningText
                ? <MessageContent content={reasoningText} enableVisualizations={false} preserveLineBreaks />
                : t('window.artifact.planning')}
            </div>
          )}
        </div>
      )}

      {/* 生成进度（流式时）/ 代码切换条 */}
      {(streaming || preparing || restoring || done) && (
        <div
          className="flex items-center gap-2 border-t px-3 py-1.5"
          style={{ borderColor: 'color-mix(in srgb, var(--md-sys-color-primary) 22%, transparent)' }}
        >
          <button
            type="button"
            onClick={() => setShowCode((v) => !v)}
            className="inline-flex items-center gap-1 text-[11.5px] font-medium"
            style={{ color: 'var(--md-sys-color-on-primary-container)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <AgentFileIcon size={13} /> {showCode ? t('window.artifact.hideCode') : t('window.artifact.viewCode')}
            <AgentChevronIcon size={13} style={{ transform: showCode ? 'rotate(180deg)' : undefined }} />
          </button>
          <span className="text-[11px]" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
            {streaming || preparing ? t('window.artifact.writingChars', { count: codeChars }) : t('window.artifact.chars', { count: codeChars })}
          </span>
          {done && (
            <button
              type="button"
              onClick={openExternal}
              title={t('window.artifact.openInNewTab')}
              className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-medium"
              style={{ color: 'var(--md-sys-color-primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <AgentArrowUpRightIcon size={13} /> {t('window.artifact.openNewTab')}
            </button>
          )}
        </div>
      )}

      {/* 流式源码 */}
      {showCode && (streaming || preparing || done) && (
        <pre
          ref={preRef}
          className="hide-scrollbar m-0 max-h-[40vh] overflow-auto px-3 py-2 text-[11px] leading-relaxed"
          style={{
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            background: 'var(--md-sys-color-surface-container-lowest)',
            color: 'var(--md-sys-color-on-surface-variant)',
          }}
        >
          {html || t('window.artifact.generatingHtml')}
        </pre>
      )}

      {(errored || expired) && (
        <div className="flex items-center gap-2 px-3 pb-3 text-[12px]" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
          <span className="min-w-0 flex-1">
            {errored
              ? (error || t('window.artifact.errorHint'))
              : t('window.artifact.dataMissing')}
          </span>
          {prompt && (
            <button
              type="button"
              data-testid="artifact-retry"
              onClick={() => {
                startedRef.current = false;
                setShouldAutoGen(true);
                setStatus('idle');
                setError(null);
                setStreamHtml('');
                setReasoning('');
                setShowCode(false);
                setRunId((n) => n + 1);
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-medium"
              style={{ background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', cursor: 'pointer' }}
            >
              {t('window.artifact.regenerate')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
