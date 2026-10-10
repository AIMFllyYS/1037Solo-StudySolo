'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyTextToClipboard } from '@/lib/clipboard/copyText';
import { useUiReducedMotion } from '@/lib/hooks/runtime/useUiReducedMotion';
import { AgentUserIcon } from '@/components/icons/AgentIcons';
import BrandLogo from '@/components/layout/BrandLogo';
import type { ChatMessage as ChatMessageType } from '@/lib/types/chat';
import { MessageContent } from '@/components/chat/messages/MessageContent';
import { FollowUpQuestions } from '@/components/chat/messages/FollowUpQuestions';
import { AgentTrace, TRACE_COLLAPSE_MS, agentProcessingLabel } from '@/components/chat/trace/AgentTrace';
import AttachmentThumbnails from '@/components/chat/attachments/AttachmentThumbnails';
import { openMessageMenu } from '@/lib/stores/workspace/contextMenu';
import { buildTrace, type AgentTraceModel, type TraceStep } from '@/lib/chat/buildTrace';
import { getMessageText } from '@/lib/chat/messageParts';
import { extractFollowUpQuestionsFromContent } from '@/lib/chat/rendering/parseChatContent';
import { collectCitationCatalog } from '@/lib/chat/citationCatalog';
import { collectMessageSources } from '@/lib/chat/traceSources';
import { ToolResultCards } from '@/components/chat/toolCards/ToolResultCards';
import ChatFeedbackActions from '@/components/chat/ChatFeedbackActions';
import { useT } from '@/lib/i18n/index';
import { useReincludedAttachments } from '@/lib/stores/assets/reincludedAttachments';
import { useChatHistory } from '@/lib/stores/chat/chatHistory';
import { getStorageOwner, getOwnerEpoch } from '@/lib/storage/ownerScope';

interface ChatMessageProps {
  message: ChatMessageType;
  onFollowUpSelect: (question: string) => void;
  isStreaming?: boolean;
  sessionId?: string;
  repairModelId?: string;
  topic?: string;
  /** 窗内笔记对话置 false：追问属于教学场景的聊天套话，与笔记角色冲突。默认 true。 */
  showFollowUps?: boolean;
  /**
   * 这条历史消息可以「重新带入本轮」：它带图片附件，且不是本轮那条用户消息
   * （本轮消息的图本来就随请求发送，不需要再挂一次）。
   */
  reincludable?: boolean;
}

/**
 * 用户消息气泡右下角的复制按钮：鼠标悬停（或键盘聚焦）气泡时才浮现，点击复制整段输入，
 * 成功后图标短暂变成对勾。右键菜单（复制 / 引用 / 追问 / 记录）仍保留。
 */
function UserCopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      data-testid="user-message-copy"
      className="chat-bubble-copy"
      data-copied={copied || undefined}
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        void copyTextToClipboard(text).then(() => setCopied(true));
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function traceFromSteps(steps: TraceStep[]): AgentTraceModel {
  return {
    steps,
    blocks: [{ kind: 'trace', steps }],
    answerText: '',
    toolCount: steps.filter((step) => step.kind === 'tool').length,
    errorCount: steps.filter((step) => step.status === 'error').length,
    interruptedCount: steps.filter((step) => step.status === 'interrupted').length,
    waitingCount: steps.filter((step) => step.status === 'waiting').length,
  };
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onFollowUpSelect, isStreaming: requestStreaming, sessionId, repairModelId, topic, showFollowUps = true, reincludable = false }) => {
  const isStreaming = requestStreaming && !message.parts.some((part) => part.type === 'data-answer-complete');
  const isUser = message.role === 'user';
  const parts = message.parts;
  const stepDurationsMs = message.metadata?.stepDurationsMs;
  const reducedMotion = useUiReducedMotion();
  const t = useT();
  const streaming = !!isStreaming;
  const [revealFollowups, setRevealFollowups] = useState(!streaming);
  const [prevStreaming, setPrevStreaming] = useState(streaming);
  const [revealNonce, setRevealNonce] = useState(0);
  if (prevStreaming !== streaming) {
    setPrevStreaming(streaming);
    if (streaming) {
      setRevealFollowups(false);
      setRevealNonce(0);
    } else if (reducedMotion) {
      setRevealFollowups(true);
      setRevealNonce(0);
    } else {
      setRevealFollowups(false);
      setRevealNonce((n) => n + 1);
    }
  }

  useEffect(() => {
    if (revealNonce === 0) return;
    const timer = window.setTimeout(() => setRevealFollowups(true), TRACE_COLLAPSE_MS);
    return () => window.clearTimeout(timer);
  }, [revealNonce]);
  const trace = useMemo(
    () => buildTrace({ parts, metadata: stepDurationsMs ? { stepDurationsMs } : undefined }, !!isStreaming, t),
    [parts, stepDurationsMs, isStreaming, t],
  );
  const userText = useMemo(() => isUser ? getMessageText({ parts }) : '', [isUser, parts]);
  const followUpQuestions = useMemo(() => {
    if (message.followUpQuestions?.length) return message.followUpQuestions;
    const fromParts = parts.flatMap((part) => part.type === 'data-followup' ? part.data.questions : []);
    if (fromParts.length) return fromParts;
    return extractFollowUpQuestionsFromContent(getMessageText({ parts }));
  }, [message.followUpQuestions, parts]);

  const traceSources = useMemo(() => isUser ? [] : collectMessageSources(parts), [isUser, parts]);
  const citations = useMemo(() => isUser ? [] : collectCitationCatalog(parts), [isUser, parts]);
  const reincluded = useReincludedAttachments((state) =>
    sessionId ? state.bySession[sessionId]?.includes(message.id) ?? false : false);
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const onToolOutputChange = (toolCallId: string, output: unknown) => {
    if (!sessionId || streaming || getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return;
    const history = useChatHistory.getState();
    const current = history.messagesById[sessionId]?.find(item => item.id === message.id);
    if (!current) return;
    history.updateMessage(sessionId, message.id, { parts: current.parts.map(part =>
      (part.type.startsWith('tool-') || part.type === 'dynamic-tool') && 'toolCallId' in part && part.toolCallId === toolCallId && part.state === 'output-available'
        ? { ...part, output } as typeof part : part) });
  };

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`} data-message-role={message.role} data-message-id={message.id}>
      <div className="chat-message-header">
        {isUser ? (
          <span className="chat-message-header-left">
            <span className="chat-message-header-name">{t('trace.message.you')}</span>
            <AgentUserIcon size={16} />
          </span>
        ) : (
          <span className="chat-message-header-left chat-message-assistant-status" aria-label={t('trace.message.assistantAria')}>
            <BrandLogo size={20} />
            <span className="chat-message-assistant-status-text" role="status" aria-live="polite">
              {agentProcessingLabel(trace, !!isStreaming, message.metadata?.durationMs, t)}
            </span>
            {message.metadata?.thinkingEnabled ? <span className="sr-only">{t('trace.message.thinkingEnabled')}</span> : null}
            {message.metadata?.searchEnabled ? <span className="sr-only">{t('trace.message.searchEnabled')}</span> : null}
          </span>
        )}
      </div>

      <div className="chat-message-content">
        {isUser ? (
          <>
            {message.attachments && message.attachments.length > 0 && (
              <div className="chat-message-attachments">
                <AttachmentThumbnails readonlyAttachments={message.attachments} size={80} />
                {reincludable && sessionId && (
                  <button
                    type="button"
                    data-testid="reinclude-attachment"
                    aria-pressed={reincluded}
                    title={t('window.attachment.reincludeHint')}
                    onClick={() =>
                      (reincluded
                        ? useReincludedAttachments.getState().unmark(sessionId, message.id)
                        : useReincludedAttachments.getState().mark(sessionId, message.id))}
                    className={`chat-reinclude-toggle${reincluded ? ' is-on' : ''}`}
                  >
                    {reincluded ? t('window.attachment.reincludeMarked') : t('window.attachment.reinclude')}
                  </button>
                )}
              </div>
            )}
            <div
              className="chat-bubble-user chat-prose has-copy"
              style={{ background: 'var(--md-sys-color-surface-container-high)', boxShadow: 'none' }}
              onContextMenu={(e) => openMessageMenu(e, userText)}
            >
              <MessageContent content={userText} enableVisualizations={false} preserveLineBreaks />
              {userText.trim() ? <UserCopyButton text={userText} label={t('common.copy')} /> : null}
            </div>
          </>
        ) : (
          <>
            {trace.blocks.map((block, index) => {
              if (block.kind === 'trace') {
                return (
                  <AgentTrace
                    key={block.steps[0]?.id ?? `trace:${index}`}
                    trace={traceFromSteps(block.steps)}
                    isStreaming={isStreaming}
                    summaryMode="process"
                    toolContext={{ message, isStreaming: streaming, ctx: { isStreaming: streaming }, onToolOutputChange }}
                  />
                );
              }
              return (
                <div
                  key={`answer:${index}`}
                  className="chat-bubble-assistant chat-prose"
                  style={{ background: 'transparent', border: 'none', padding: 0, borderRadius: 0 }}
                  onContextMenu={(e) => openMessageMenu(e, trace.answerText)}
                >
                  <MessageContent
                    content={block.text}
                    isStreaming={isStreaming}
                    enableVisualizations={true}
                    sessionId={sessionId}
                    messageId={message.id}
                    repairModelId={repairModelId}
                    topic={topic}
                    citations={citations}
                  />
                </div>
              );
            })}
            <ToolResultCards message={message} isStreaming={isStreaming} />
            {showFollowUps && revealFollowups && !isStreaming && (followUpQuestions.length > 0 || traceSources.length > 0) ? (
              <FollowUpQuestions questions={followUpQuestions} onSelect={onFollowUpSelect} sources={traceSources} />
            ) : null}
            {!isStreaming && sessionId && trace.answerText.trim() ? (
              <ChatFeedbackActions sessionId={sessionId} messageId={message.id} answerText={trace.answerText} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default React.memo(ChatMessage);
