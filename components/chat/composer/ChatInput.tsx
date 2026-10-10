'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, useId } from 'react';
import {
  AgentGlobeIcon, AgentArrowUpIcon, AgentStopIcon, AgentQuoteIcon,
  AgentCloseIcon, AgentPlusIcon,
} from '@/components/icons/AgentIcons';
import type { ChatContext } from '@/lib/types/chat';
import type { SendMessageOptions } from '@/lib/chat/sendMessage';
import { useChatUI } from '@/lib/hooks/useChatUI';
import { useSettings, type ThinkingEffort } from '@/lib/hooks/useSettings';
import { useSkills } from '@/lib/hooks/useSkills';
import {
  hasNotebookFileDrag,
  mergeAttachedFiles,
  readNotebookFileDrag,
  skillForcedTool,
  type AttachedFileRef,
  type ComposerForcedTool,
  type ForcedComposerTool,
} from '@/lib/chat/composerIntent';
import { detectComposerTrigger, flattenFileMentions, listFileMentions, replaceComposerTrigger } from '@/lib/chat/fileMentions';
import { readPlanModeGate, resolvePlanMode } from '@/lib/chat/planModeGate';
import { compactActiveSession } from '@/lib/context/compactChatSession';
import Link from 'next/link';
import { useToast } from '@/lib/stores/toast';
import { countComposerAttachments, referencedFileIdsInText } from '@/lib/files/contract';
import ComposerChips from '@/components/chat/composer/ComposerChips';
import ComposerCommandPanel, { listComposerCommands, type ComposerToggle } from '@/components/chat/composer/ComposerCommandPanel';
import ComposerPalette from '@/components/chat/composer/ComposerPalette';
import FileMentionMenu from '@/components/chat/composer/FileMentionMenu';
import { useImageAttachments } from '@/lib/hooks/useImageAttachments';
import { ACCEPTED_DOCUMENT_FILE_TYPES } from '@/lib/ai/imageUtils';
import { useKeyboardSettings } from '@/lib/keyboard/useKeyboardSettings';
import {
  getModelInfoWithCustom,
  modelSupportsThinkingEffort,
  clampThinkingEffort,
} from '@/lib/ai/models';
import ModelMenu from '@/components/chat/composer/ModelMenu';
import AnchoredMenu from '@/components/ui/AnchoredMenu';
import AgentModeMenu, { AgentModeMenuItems } from '@/components/chat/composer/AgentModeMenu';
import { MoreHorizontal } from 'lucide-react';
import InputLimitDialog from '@/components/chat/attachments/InputLimitDialog';
import TokenDashboard from '@/components/chat/billing/TokenDashboard';
import AttachmentThumbnails from '@/components/chat/attachments/AttachmentThumbnails';
import ProjectPickerChip from '@/components/chat/composer/ProjectPickerChip';
import { shouldBlockFocusSteal } from '@/lib/notes/selectionPopover';
import { useT } from '@/lib/i18n/index';
export interface ChatInputProps {
  onSend: (content: string, options?: SendMessageOptions) => void;
  onStop: () => void;
  isLoading: boolean;
  /**
   * 本输入框写入的会话 id。生成中再发的消息会进队列；队列项绑定当时所在会话——
   * 切到别的会话后 drain 不会把这条会话的待发消息错发给另一条。
   */
  sessionId?: string;
  chatContext: ChatContext;
  onOpenSettings?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** 受控模型（划词浮窗每窗独立选模型）；不传则模型菜单读写全局 useSettings。 */
  modelId?: string;
  onModelChange?: (id: string) => void;
  /** 是否显示上下文 token 看板（划词浮窗传 false，避免显示主面板的全局统计）。默认 true。 */
  showTokenDashboard?: boolean;
  /** 划词浮窗的 sessionId，用于独立 token 统计。不传则用全局 tracker。 */
  floatingSessionId?: string;
  /** 禁用「引用到输入框」（划词浮窗传 true，避免全局选区引用串入浮窗）。默认 false。 */
  disableQuote?: boolean;
  /**
   * 局部引用槽：提供时优先于全局 quotedText（disableQuote 只屏蔽全局那条）。
   * 笔记内嵌 Agent 等独立会话用它隔离引用，不串进主对话。
   */
  quoteText?: string | null;
  /** 局部引用槽的清除回调；不传则走全局 clearQuotedText。 */
  onClearQuote?: () => void;
  /** 浮动输入区占用的底部安全距离（高度 + 实际底距 + 呼吸间距），供会话滚动区避让。 */
  onComposerInsetChange?: (inset: number) => void;
  /** 可选上下文警告等内容：与输入区一起测量，避免被底部浮层遮住。 */
  notice?: React.ReactNode;
  /** 自增即聚焦输入框一次（例如点了「新建对话」但其实已经在新对话里，提示用户直接开说）。 */
  focusSignal?: number;
  /**
   * 显示「对话所属项目」chip（输入框右下角）。
   * 只有 Agent 中央对话传 true：划词浮窗 / 题目解析 / 手机迷你聊天都不该出现项目归属。
   */
  showProjectPicker?: boolean;
  /** Agent 执行模式（询问/完全同意）入口；由 ChatPanel 默认开启，迷你输入框保持关闭。 */
  showAgentModeMenu?: boolean;
}

export const MAX_INPUT_CHARACTERS = 50_000;

type QueuedMessage = {
  id: string;
  /** 排队时所在会话：drain 只放与当前会话一致的项，防止跨会话错发。 */
  sessionId?: string;
  content: string;
  quotedText?: string;
  attachments?: SendMessageOptions["attachments"];
  planMode?: boolean;
  forcedTool?: ComposerForcedTool;
  attachedFiles?: AttachedFileRef[];
};

type PaletteKind = "slash" | "hash" | null;

function countCharacters(text: string) {
  // Count Unicode code points without allocating a second large array.
  let count = 0;
  for (const character of text) count += character ? 1 : 0;
  return count;
}

/** 输入框最大高度（与 `.chat-input-textarea` 的 CSS max-height 保持一致）。 */
const MAX_TEXTAREA_HEIGHT = 120;

const ChatInput: React.FC<ChatInputProps> = ({ onSend, onStop, isLoading, sessionId, onOpenSettings, disabled: externalDisabled, disabledReason, modelId, onModelChange, showTokenDashboard = true, floatingSessionId, disableQuote = false, quoteText, onClearQuote, onComposerInsetChange, notice, focusSignal, showProjectPicker = false, showAgentModeMenu = false, chatContext }) => {
  const t = useT();
  const [input, setInput] = useState('');
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [editingQueuedId, setEditingQueuedId] = useState<string | null>(null);
  const queueAwaitingLoadingRef = useRef(false);
  const countId = useId();
  const characterCount = useMemo(() => countCharacters(input), [input]);
  const overLimit = characterCount > MAX_INPUT_CHARACTERS;
  const showCharacterCount = characterCount > 1_000;
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const composingRef = useRef(false);
  const [isFocused, setIsFocused] = useState(false);
  // 本机默认值只在水合完成后由 hydrateSettings() 应用（首帧是 DEFAULTS，见 lib/stores/settings.ts），
  // 用户手动改过就以覆盖值为准：既不会 hydration mismatch，也避免在 effect 里 setState。
  const defaultThinking = useSettings((s) => s.defaultThinking);
  const defaultThinkingEffort = useSettings((s) => s.defaultThinkingEffort);
  const defaultSearch = useSettings((s) => s.defaultSearch);
  const [thinkingEnabledOverride, setThinkingEnabledOverride] = useState<boolean | null>(null);
  const [thinkingEffortOverride, setThinkingEffortOverride] = useState<ThinkingEffort | null>(null);
  const [searchOverride, setSearchOverride] = useState<boolean | null>(null);
  const enableThinking = thinkingEnabledOverride ?? defaultThinking;
  const thinkingEffort = thinkingEffortOverride ?? defaultThinkingEffort;
  const enableSearch = searchOverride ?? defaultSearch;
  const setEnableThinking = setThinkingEnabledOverride;
  const setThinkingEffort = setThinkingEffortOverride;
  const setEnableSearch = setSearchOverride;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const lastInsetRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const { quotedText, clearQuotedText } = useChatUI();
  const skills = useSkills((s) => s.skills);
  const settingsSnapshot = useSettings();
  const planGate = readPlanModeGate(settingsSnapshot);
  // 计划模式：设置里没有对应字段时保持关闭，有则由设置决定。
  // 与其它开关同样用「派生值 + 用户覆盖」，避免在 useState 初始化器里读持久化设置
  // （首帧 store 仍是默认值，固化下来会永久停留，也会造成 hydration 不一致）。
  const [planModeOverride, setPlanModeOverride] = useState<boolean | null>(null);
  const [forcedTool, setForcedTool] = useState<ComposerForcedTool | undefined>();
  const [attachedFiles, setAttachedFiles] = useState<AttachedFileRef[]>([]);
  const [palette, setPalette] = useState<PaletteKind>(null);
  const [paletteAnchor, setPaletteAnchor] = useState<"plus" | "textarea">("textarea");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState("");
  const mentionTriggerRef = useRef<ReturnType<typeof detectComposerTrigger>>(null);
  const globalSelectedModelId = useSettings((s) => s.selectedModelId);
  const customApiGroups = useSettings((s) => s.customApiGroups);
  const selectedModelId = modelId ?? globalSelectedModelId;
  const selectedModelInfo = useMemo(
    () => getModelInfoWithCustom(selectedModelId, customApiGroups),
    [selectedModelId, customApiGroups],
  );
  const thinkingSupported = selectedModelInfo?.thinking === true;
  const thinkingEffortSupported = modelSupportsThinkingEffort(selectedModelInfo);
  const displayEffort = thinkingEffortSupported
    ? clampThinkingEffort(selectedModelInfo, thinkingEffort)
    : thinkingEffort;
  const effectiveEnableThinking = (enableThinking || !!selectedModelInfo?.thinkingRequired) && thinkingSupported;
  const effectiveThinkingEffort = effectiveEnableThinking ? displayEffort : undefined;
  const effectiveQuote = quoteText !== undefined ? quoteText : (disableQuote ? null : quotedText);
  const quotedCloudFileIds = useMemo(() => referencedFileIdsInText(`${input}\n${effectiveQuote ?? ''}`), [input, effectiveQuote]);
  const clearQuote = onClearQuote ?? clearQuotedText;
  const sendShortcutEnabled = useKeyboardSettings((s) => s.isEnabled('chat.send'));
  const {
    attachments,
    processing: attachmentProcessing,
    addFiles,
    remove: removeAttachment,
    clear: clearAttachments,
    toChatFormat,
    handlePaste,
    handleDrop,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    isDragging,
    endDrag,
    error: attachError,
    info: attachInfo,
  } = useImageAttachments({ reservedCount: attachedFiles.length, citedFileIds: quotedCloudFileIds });
  const [fileDragOver, setFileDragOver] = useState(false);
  const showDropOverlay = isDragging || fileDragOver;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    let lastWidth = 0;
    const resize = () => {
      // 首帧分栏还没量出宽度时（clientWidth 退化），此时 scrollHeight 是假值：
      // 一旦写进去就没人再改，空输入框会永久停在 max-height（用户看到「空着也占好几行」）。
      if (el.clientWidth < 40) return;
      lastWidth = el.clientWidth;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    };
    resize();
    // 左右栏拖动/收起会改可用宽度，换行数随之变化：宽度变了就重新量一次高度。
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      resize();
    });
    observer?.observe(el);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [input]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer || !onComposerInsetChange) return;
    const reportInset = () => {
      const bottom = Number.parseFloat(window.getComputedStyle(composer).bottom) || 0;
      const next = Math.ceil(composer.getBoundingClientRect().height + bottom + 16);
      if (lastInsetRef.current !== null && Math.abs(next - lastInsetRef.current) < 2) return;
      lastInsetRef.current = next;
      onComposerInsetChange(next);
    };
    reportInset();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reportInset);
    observer?.observe(composer);
    window.addEventListener('resize', reportInset);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', reportInset);
      // 保留最后测量值；StrictMode effect 重放时不先清零，避免滚动区短暂失去避让空间。
    };
  }, [onComposerInsetChange]);

  // 外部要求聚焦（自增即触发一次）：只聚焦，不碰草稿。
  useEffect(() => {
    if (!focusSignal) return;
    textareaRef.current?.focus();
  }, [focusSignal]);

  const planMode = planModeOverride ?? planGate.defaultOn;
  const effectivePlanMode = resolvePlanMode(planMode, settingsSnapshot);
  const mentionGroups = useMemo(
    () => listFileMentions(chatContext, mentionQuery),
    [chatContext, mentionQuery],
  );
  const slashItems = useMemo(
    () => listComposerCommands({ planAllowed: planGate.allowed, skills, query: mentionQuery }),
    [planGate.allowed, skills, mentionQuery],
  );
  const forcedSkillName = forcedTool?.startsWith("skill:")
    ? skills.find((skill) => skillForcedTool(skill.id) === forcedTool)?.name
    : undefined;

  const closePalette = useCallback(() => {
    setPalette(null);
    setPaletteIndex(0);
    mentionTriggerRef.current = null;
  }, []);

  const consumeTrigger = useCallback(() => {
    const trigger = mentionTriggerRef.current;
    const el = textareaRef.current;
    if (!trigger || !el) return;
    const cursor = el.selectionStart ?? input.length;
    const next = replaceComposerTrigger(input, trigger, cursor);
    setInput(next);
    mentionTriggerRef.current = null;
  }, [input]);

  const applyPlan = useCallback(() => {
    if (!planGate.allowed) return;
    setPlanModeOverride(!planMode);
    setForcedTool(undefined);
    consumeTrigger();
    closePalette();
  }, [planGate.allowed, planMode, consumeTrigger, closePalette]);

  const applyCompact = useCallback(() => {
    consumeTrigger();
    closePalette();
    void compactActiveSession(sessionId).catch(() => {});
  }, [consumeTrigger, closePalette, sessionId]);

  const applyTool = useCallback((tool: ForcedComposerTool) => {
    setForcedTool((current) => current === tool ? undefined : tool);
    if (!planGate.forced) setPlanModeOverride(false);
    consumeTrigger();
    closePalette();
  }, [planGate.forced, consumeTrigger, closePalette]);

  const applySkill = useCallback((skill: { id: string }) => {
    const next = skillForcedTool(skill.id);
    setForcedTool((current) => current === next ? undefined : next);
    if (!planGate.forced) setPlanModeOverride(false);
    consumeTrigger();
    closePalette();
  }, [planGate.forced, consumeTrigger, closePalette]);

  const applyFile = useCallback((file: AttachedFileRef) => {
    if (countComposerAttachments(attachments, mergeAttachedFiles(attachedFiles, [file]).length, `${input}\n${effectiveQuote ?? ''}`) > 9) { useToast.getState().show('单次消息最多 9 个附件，发送后可继续添加。'); return; }
    setAttachedFiles((current) => mergeAttachedFiles(current, [file]));
    consumeTrigger();
    closePalette();
  }, [consumeTrigger, closePalette, attachments, attachedFiles, input, effectiveQuote]);

  const dispatchMessage = useCallback((message: QueuedMessage) => {
    onSend(message.content, {
      quotedText: message.quotedText,
      enableThinking: effectiveEnableThinking,
      thinkingEffort: effectiveThinkingEffort,
      enableSearch,
      attachments: message.attachments,
      planMode: message.planMode,
      forcedTool: message.forcedTool,
      attachedFiles: message.attachedFiles,
      sessionId: message.sessionId,
    });
  }, [onSend, effectiveEnableThinking, effectiveThinkingEffort, enableSearch]);

  const clearDraft = useCallback(() => {
    setInput('');
    clearAttachments();
    setAttachedFiles([]);
    if (effectiveQuote) clearQuote();
  }, [clearAttachments, effectiveQuote, clearQuote]);

  const handleSend = useCallback(() => {
    if (overLimit) { setShowLimitDialog(true); return; }
    const trimmed = input.trim();
    if ((!trimmed && attachments.length === 0 && attachedFiles.length === 0) || externalDisabled || attachmentProcessing) return;
    if (countComposerAttachments(attachments, attachedFiles.length, `${input}\n${effectiveQuote ?? ''}`) > 9) { useToast.getState().show('单次消息最多 9 个附件，原附件已保留，请先移除多余项。'); return; }

    const message: QueuedMessage = {
      id: crypto.randomUUID(),
      sessionId,
      content: trimmed || (attachedFiles.length > 0 ? t('menu.chatInput.autoPrompt.files') : t('menu.chatInput.autoPrompt.attachments')),
      quotedText: effectiveQuote || undefined,
      attachments: toChatFormat(),
      planMode: effectivePlanMode || undefined,
      forcedTool: effectivePlanMode ? undefined : forcedTool,
      attachedFiles: attachedFiles.length > 0 ? attachedFiles : undefined,
    };
    if (isLoading) {
      if (editingQueuedId) {
        setQueuedMessages((items) => items.map((item) => item.id === editingQueuedId ? { ...item, content: message.content } : item));
        setEditingQueuedId(null);
      } else {
        setQueuedMessages((items) => [...items, message]);
      }
    } else {
      dispatchMessage(message);
    }
    clearDraft();
  }, [input, overLimit, attachments, attachedFiles, isLoading, externalDisabled, attachmentProcessing, effectiveQuote, toChatFormat, editingQueuedId, dispatchMessage, clearDraft, effectivePlanMode, forcedTool, sessionId, t]);

  useEffect(() => {
    if (isLoading) {
      // 下一轮生成已经开始，允许在它结束后继续发送队列中的下一条。
      queueAwaitingLoadingRef.current = false;
      return;
    }
    if (externalDisabled || queuedMessages.length === 0) return;
    // onSend 通常会让父级立即进入 loading；即使父级更新稍有延迟，也不能
    // 在同一轮 effect 中把多条排队消息一次性发出。
    if (queueAwaitingLoadingRef.current) return;
    // 只放属于当前会话的排队项：别的会话的队列等用户切回去再发，不能发错地方。
    const next = queuedMessages.find((item) => item.sessionId === sessionId);
    if (!next) return;
    queueAwaitingLoadingRef.current = true;
    // 微任务里再改 state：effect 体里同步 setState 会触发级联渲染（lint 明令禁止）。
    queueMicrotask(() => {
      setQueuedMessages((items) => items.filter((item) => item.id !== next.id));
      setEditingQueuedId((current) => current === next.id ? null : current);
      dispatchMessage(next);
    });
  }, [dispatchMessage, externalDisabled, isLoading, queuedMessages, sessionId]);

  const editQueuedMessage = useCallback((message: QueuedMessage) => {
    setInput(message.content);
    setEditingQueuedId(message.id);
    textareaRef.current?.focus();
  }, []);

  const cancelQueuedMessage = useCallback((id: string) => {
    setQueuedMessages((items) => items.filter((item) => item.id !== id));
    setEditingQueuedId((current) => current === id ? null : current);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (palette) {
      const count = palette === "hash" ? flattenFileMentions(mentionGroups).length : slashItems.length;
      if (e.key === "Escape") { e.preventDefault(); closePalette(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setPaletteIndex((i) => (i + 1) % Math.max(count, 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setPaletteIndex((i) => (i - 1 + Math.max(count, 1)) % Math.max(count, 1)); return; }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (palette === "hash") {
          const file = flattenFileMentions(mentionGroups)[paletteIndex];
          if (file) applyFile(file);
        } else {
          const item = slashItems[paletteIndex];
          if (item?.kind === "plan") applyPlan();
          else if (item?.kind === "compact") applyCompact();
          else if (item?.kind === "tool") applyTool(item.id as ForcedComposerTool);
          else if (item?.skill) applySkill(item.skill);
        }
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (!sendShortcutEnabled) return;
      e.preventDefault();
      handleSend();
    }
  };

  const syncTrigger = (value: string, cursor: number) => {
    const trigger = detectComposerTrigger(value, cursor);
    mentionTriggerRef.current = trigger;
    if (!trigger) {
      if (palette === "hash" || (palette === "slash" && mentionQuery)) closePalette();
      return;
    }
    setMentionQuery(trigger.query);
    setPaletteAnchor("textarea");
    setPalette(trigger.type);
    setPaletteIndex(0);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    await addFiles(Array.from(files));
    e.target.value = '';
  };

  const inputDisabled = !!externalDisabled;
  // 队列按会话过滤展示：切到别的会话时不把那边排队的消息摆在这里。
  const visibleQueuedMessages = queuedMessages.filter((item) => item.sessionId === sessionId);
  const composerEmpty = !input.trim() && attachments.length === 0 && attachedFiles.length === 0;
  const showStopButton = isLoading && (inputDisabled || composerEmpty);
  // An access/readiness gate blocks new sends but must not hide the real abort
  // action for a run that was already in progress.
  const sendDisabled = showStopButton
    ? false
    : !!externalDisabled || attachmentProcessing || overLimit || (!input.trim() && attachments.length === 0 && attachedFiles.length === 0);

  // "+"菜单顶部的开关：联网搜索（思考深度已移到模型菜单里）。
  const plusToggles: ComposerToggle[] = [{
    id: 'search',
    label: t('menu.chatInput.search.label'),
    hint: t('menu.chatInput.search.hint'),
    icon: <AgentGlobeIcon size={14} />,
    on: enableSearch,
    disabled: inputDisabled,
    onToggle: () => setEnableSearch(!enableSearch),
  }];

  return (
    <div
      ref={composerRef}
      className="chat-input-container"
      onDrop={(event) => {
        setFileDragOver(false);
        endDrag();
        const files = readNotebookFileDrag(event.dataTransfer);
        if (files.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          const merged = mergeAttachedFiles(attachedFiles, files);
          if (countComposerAttachments(attachments, merged.length, `${input}\n${effectiveQuote ?? ''}`) > 9) { useToast.getState().show('单次消息最多 9 个附件，发送后可继续添加。'); return; }
          setAttachedFiles(merged);
          return;
        }
        handleDrop(event);
      }}
      onDragOver={(event) => {
        if (hasNotebookFileDrag(event.dataTransfer)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setFileDragOver(true);
          return;
        }
        handleDragOver(event);
      }}
      onDragEnter={(event) => {
        if (hasNotebookFileDrag(event.dataTransfer)) {
          event.preventDefault();
          setFileDragOver(true);
        }
        handleDragEnter(event);
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && composerRef.current?.contains(next)) {
          handleDragLeave(event);
          return;
        }
        setFileDragOver(false);
        endDrag();
        handleDragLeave(event);
      }}
    >
      {showDropOverlay ? <div className="chat-input-drop-overlay" data-testid="composer-drop-overlay" aria-hidden="true" /> : null}
      {notice}
      {attachError && (
        <div style={{
          padding: '6px 12px', fontSize: '11px', color: 'var(--md-sys-color-error)',
          background: 'var(--md-sys-color-error-container)', borderRadius: '8px', margin: '0 0 4px',
        }}>
          {attachError}
          {attachError.includes('云端存储空间不足') ? <Link href="/agent/assets?tab=cloud" className="ml-2 underline">打开我的资产，清理云端文件</Link> : null}
        </div>
      )}
      {attachInfo ? <div className="chat-attachment-notice" role="status">{attachInfo}</div> : null}
      {attachmentProcessing ? <div className="chat-attachment-notice" role="status">正在处理并上传附件到云端，请稍候…</div> : null}

      {visibleQueuedMessages.length > 0 && (
        <div className="chat-input-queue" role="region" aria-label={t('menu.chatInput.queue.title')}>
          <div className="chat-input-queue-heading">
            <span className="chat-input-queue-label"><span className="chat-input-queue-pulse" />{t('menu.chatInput.queue.title')}</span>
            <span className="chat-input-queue-count">{t('menu.chatInput.queue.count', { count: visibleQueuedMessages.length })}</span>
          </div>
          <div className="chat-input-queue-list">
            {visibleQueuedMessages.map((message, index) => (
              <div className="chat-input-queue-item" key={message.id}>
                <span className="chat-input-queue-index">{index + 1}</span>
                <span className="chat-input-queue-text" title={message.content}>{message.content}</span>
                <button type="button" className="chat-input-queue-action" onClick={() => editQueuedMessage(message)} aria-label={t('menu.chatInput.queue.editAria', { index: index + 1 })}>{t('menu.chatInput.queue.edit')}</button>
                <button type="button" className="chat-input-queue-action chat-input-queue-action-muted" onClick={() => cancelQueuedMessage(message.id)} aria-label={t('menu.chatInput.queue.cancelAria', { index: index + 1 })}>{t('common.cancel')}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {effectiveQuote && (
        <div className="chat-input-quote">
          <AgentQuoteIcon size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--md-sys-color-tertiary)' }} />
          <div className="chat-input-quote-label">
            <AgentQuoteIcon size={10} />
            <span>{t('menu.chatInput.quote.label')}</span>
          </div>
          <div className="chat-input-quote-text">
            {effectiveQuote}
          </div>
          <button
            onClick={clearQuote}
            className="chat-input-quote-close"
            title={t('menu.chatInput.quote.remove')}
          >
            <AgentCloseIcon size={14} />
          </button>
        </div>
      )}

      <div className="chat-input-toolbar" aria-label={t('menu.chatInput.toolbarAria')}>
        {showProjectPicker || showAgentModeMenu ? (
          <AnchoredMenu
            label={t('menu.chatInput.more')}
            placement="top"
            width={240}
            disabled={inputDisabled}
            className="chat-input-more"
            testId="chat-input-more"
            trigger={<MoreHorizontal size={15} aria-hidden />}
          >
            {(close) => (
              <div className="chat-input-more-panel">
                <AgentModeMenuItems onPicked={close} />
              </div>
            )}
          </AnchoredMenu>
        ) : null}
        <div className="chat-input-toolbar-group chat-input-toolbar-options">
          {showProjectPicker || showAgentModeMenu ? <AgentModeMenu disabled={inputDisabled} /> : null}
        </div>

        <div className="chat-input-toolbar-group chat-input-toolbar-models">
          {showTokenDashboard && <TokenDashboard isLoading={isLoading} floatingSessionId={floatingSessionId} modelId={modelId} />}
          <ModelMenu
            onOpenSettings={onOpenSettings}
            value={modelId}
            onChange={onModelChange}
            thinkingEnabled={effectiveEnableThinking}
            thinkingEffort={displayEffort}
            onThinkingChange={({ enabled, effort }) => {
              setEnableThinking(enabled);
              setThinkingEffort(effort);
            }}
          />
        </div>
      </div>

      <div className={`chat-input-row ${isFocused ? 'chat-input-row-focused' : ''} ${showCharacterCount ? 'chat-input-row-with-count' : ''}`}>
        {attachments.length > 0 ? (
          <AttachmentThumbnails previews={attachments} onRemove={removeAttachment} embedded />
        ) : null}
        <ComposerChips
          planMode={effectivePlanMode}
          forcedTool={effectivePlanMode ? undefined : forcedTool}
          forcedSkillName={forcedSkillName}
          attachedFiles={attachedFiles}
          onClearPlan={() => { if (!planGate.forced) setPlanModeOverride(false); }}
          onClearTool={() => setForcedTool(undefined)}
          onRemoveFile={(path) => setAttachedFiles((items) => items.filter((item) => item.path !== path))}
        />
        <div className="chat-input-editor-row">
        <button
          ref={plusRef}
          type="button"
          className="chat-input-plus"
          disabled={inputDisabled}
          title={t('menu.chatInput.addIntent')}
          aria-label={t('menu.chatInput.addIntent')}
          aria-expanded={palette === "slash"}
          data-testid="composer-plus"
          onClick={() => {
            if (palette === "slash" && !mentionTriggerRef.current) closePalette();
            else {
              mentionTriggerRef.current = null;
              setMentionQuery("");
              setPaletteIndex(0);
              setPaletteAnchor("plus");
              setPalette("slash");
            }
          }}
        >
          <AgentPlusIcon size={16} />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            const next = e.target.value;
            setInput(next);
            syncTrigger(next, e.target.selectionStart ?? next.length);
            if (!composingRef.current && !overLimit && countCharacters(next) > MAX_INPUT_CHARACTERS) setShowLimitDialog(true);
          }}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            const next = e.currentTarget.value;
            syncTrigger(next, e.currentTarget.selectionStart ?? next.length);
            if (countCharacters(next) > MAX_INPUT_CHARACTERS) setShowLimitDialog(true);
          }}
          aria-label={t('menu.chatInput.inputAria')}
          aria-describedby={showCharacterCount ? countId : undefined}
          aria-invalid={overLimit || undefined}
          onMouseDown={(e) => {
            if (shouldBlockFocusSteal(typeof window !== "undefined" ? window.getSelection() : null, e.currentTarget)) {
              e.preventDefault();
            }
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={externalDisabled ? (disabledReason || t('menu.chatInput.placeholder.disabled')) : isLoading ? t('menu.chatInput.placeholder.queued') : t('menu.chatInput.placeholder.default')}
          disabled={inputDisabled}
          rows={1}
          className="chat-input-textarea"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept={`image/jpeg,image/png,image/gif,image/webp,${ACCEPTED_DOCUMENT_FILE_TYPES}`}
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {showCharacterCount && (
          <div id={countId} className={`chat-input-count ${overLimit ? 'chat-input-count-error' : ''}`} aria-live={overLimit ? 'assertive' : 'off'}>
            <span>{t('menu.chatInput.charCount', { count: characterCount.toLocaleString('en-US') })}</span>
          </div>
        )}

        {showProjectPicker ? <ProjectPickerChip /> : null}

        <button
          onClick={showStopButton ? onStop : handleSend}
          disabled={sendDisabled}
          className="chat-input-send"
          style={{
            background: showStopButton ? 'var(--md-sys-color-error-container)' : ((!input.trim() && attachments.length === 0 && attachedFiles.length === 0) ? 'var(--md-sys-color-outline-variant)' : 'var(--md-sys-color-primary)'),
            color: showStopButton ? 'var(--md-sys-color-on-error-container)' : ((!input.trim() && attachments.length === 0 && attachedFiles.length === 0) ? 'var(--md-sys-color-on-surface-variant)' : 'var(--md-sys-color-on-primary)'),
            cursor: sendDisabled ? 'not-allowed' : 'pointer',
          }}
          title={showStopButton ? t('menu.chatInput.stop') : t('menu.chatInput.send')}
        >
          {showStopButton ? <AgentStopIcon size={14} /> : <AgentArrowUpIcon size={14} />}
        </button>
        </div>
      </div>
      {showProjectPicker ? (
        <div
          className="chat-input-hints"
          data-testid="agent-composer-hints"
          aria-label={t("panel.agentComposer.hintsAria")}
        >
          {sendShortcutEnabled ? (
            <>
              <span className="chat-input-hint"><kbd>Enter</kbd><span>{t("panel.agentComposer.enterToSend")}</span></span>
              <span className="chat-input-hint"><kbd>Shift + Enter</kbd><span>{t("panel.agentComposer.shiftEnterForLineBreak")}</span></span>
            </>
          ) : (
            <span className="chat-input-hint">{t("panel.agentComposer.sendWithButton")}</span>
          )}
        </div>
      ) : null}
      <ComposerPalette
        open={palette !== null}
        anchorRef={palette === "slash" && paletteAnchor === "plus" ? plusRef : textareaRef}
        ignoreRefs={[plusRef]}
        label={palette === "hash" ? t("menu.fileMention.aria") : t("menu.composer.aria")}
        onClose={closePalette}
      >
        {palette === "hash" ? (
          <FileMentionMenu groups={mentionGroups} activeIndex={paletteIndex} onSelect={applyFile} />
        ) : (
          <ComposerCommandPanel
            planMode={effectivePlanMode}
            planAllowed={planGate.allowed}
            forcedTool={forcedTool}
            skills={skills}
            query={mentionQuery}
            activeIndex={paletteIndex}
            toggles={paletteAnchor === "plus" ? plusToggles : undefined}
            onSelectPlan={applyPlan}
            onSelectCompact={applyCompact}
            onSelectTool={applyTool}
            onSelectSkill={applySkill}
          />
        )}
      </ComposerPalette>
      {showLimitDialog && <InputLimitDialog count={characterCount} limit={MAX_INPUT_CHARACTERS} onClose={() => setShowLimitDialog(false)} />}
    </div>
  );
};

export default ChatInput;
