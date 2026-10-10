'use client';

import { ComposerToolbar } from './input/ComposerToolbar';
import { QueuedMessages } from './input/QueuedMessages';
import { QuotePreview } from './input/QuotePreview';

import React, { useState, useRef, useCallback, useMemo, useId } from 'react';
import { AgentGlobeIcon, AgentArrowUpIcon, AgentStopIcon, AgentPlusIcon } from '@/components/icons/AgentIcons';

import { useChatUI } from '@/lib/stores/chat/chatUI';
import { useSettings } from '@/lib/stores/settings';
import { useSkills } from '@/lib/stores/skills';
import { hasNotebookFileDrag, mergeAttachedFiles, readNotebookFileDrag, skillForcedTool, type AttachedFileRef, type ComposerForcedTool, type ForcedComposerTool } from '@/lib/chat/composerIntent';
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
import { useImageAttachments } from '@/lib/hooks/files/useImageAttachments';
import { ACCEPTED_DOCUMENT_FILE_TYPES } from '@/lib/ai/imageUtils';
import { useKeyboardSettings } from '@/lib/keyboard/useKeyboardSettings';

import InputLimitDialog from '@/components/chat/attachments/InputLimitDialog';

import AttachmentThumbnails from '@/components/chat/attachments/AttachmentThumbnails';
import ProjectPickerChip from '@/components/chat/composer/ProjectPickerChip';
import { shouldBlockFocusSteal } from '@/lib/notes/selectionPopover';
import { useT } from '@/lib/i18n/index';
import type { ChatInputProps, QueuedMessage, PaletteKind } from './input/types';
export type { ChatInputProps } from './input/types';
import { countCharacters, MAX_INPUT_CHARACTERS } from '@/lib/chat/inputLimits';
export { MAX_INPUT_CHARACTERS } from '@/lib/chat/inputLimits';
import { useComposerModelControls } from './input/useComposerModelControls';
import { useComposerGeometry } from './input/useComposerGeometry';
import { useComposerQueue } from './input/useComposerQueue';

const ChatInput: React.FC<ChatInputProps> = ({ onSend, onStop, isLoading, sessionId, onOpenSettings, disabled: externalDisabled, disabledReason, modelId, onModelChange, showTokenDashboard = true, floatingSessionId, disableQuote = false, quoteText, onClearQuote, onComposerInsetChange, notice, focusSignal, showProjectPicker = false, showAgentModeMenu = false, chatContext }) => {
  const t = useT();
  const [input, setInput] = useState('');
  const countId = useId();
  const characterCount = useMemo(() => countCharacters(input), [input]);
  const overLimit = characterCount > MAX_INPUT_CHARACTERS;
  const showCharacterCount = characterCount > 1_000;
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const composingRef = useRef(false);
  const [isFocused, setIsFocused] = useState(false);
  const { enableSearch, setEnableSearch, displayEffort, effectiveEnableThinking, effectiveThinkingEffort, setEnableThinking, setThinkingEffort } = useComposerModelControls(modelId);
  const { textareaRef, composerRef } = useComposerGeometry(input, onComposerInsetChange, focusSignal);

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
  }, [input, textareaRef]);

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
  const { queueMessage, visibleQueuedMessages, editQueuedMessage, cancelQueuedMessage } = useComposerQueue({ sessionId, isLoading, externalDisabled, dispatchMessage, setInput, textareaRef });

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
      queueMessage(message);
    } else {
      dispatchMessage(message);
    }
    clearDraft();
  }, [input, overLimit, attachments, attachedFiles, isLoading, externalDisabled, attachmentProcessing, effectiveQuote, toChatFormat, queueMessage, dispatchMessage, clearDraft, effectivePlanMode, forcedTool, sessionId, t]);

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
        <QueuedMessages visibleQueuedMessages={visibleQueuedMessages} editQueuedMessage={editQueuedMessage} cancelQueuedMessage={cancelQueuedMessage} />
      )}

      {effectiveQuote && (
        <QuotePreview effectiveQuote={effectiveQuote} clearQuote={clearQuote} />
      )}

      <ComposerToolbar showProjectPicker={showProjectPicker} showAgentModeMenu={showAgentModeMenu} inputDisabled={inputDisabled} showTokenDashboard={showTokenDashboard} isLoading={isLoading} floatingSessionId={floatingSessionId} modelId={modelId} onOpenSettings={onOpenSettings} onModelChange={onModelChange} effectiveEnableThinking={effectiveEnableThinking} displayEffort={displayEffort} onThinkingChange={({ enabled, effort }) => { setEnableThinking(enabled); setThinkingEffort(effort); }} />

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
