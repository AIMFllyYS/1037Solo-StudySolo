'use client';

import React, { useCallback, useState } from 'react';
import { ArrowLeft, Clock, Trash2, MessageSquare, ImagePlus } from 'lucide-react';
import { useChatHistory } from '@/lib/stores/chat/chatHistory';
import { useFloatingChats } from '@/lib/stores/chat/floatingChats';
import { useImageGen, type ImageGenSession } from '@/lib/stores/assets/imageGen';
import PencilSparklesIcon from '@/components/icons/PencilSparklesIcon';
import { useOverlayRegistration } from '@/lib/keyboard/useOverlayRegistration';
import { useT } from '@/lib/i18n';

interface ChatHistoryOverlayProps {
  /** 「对话」栏行点击：切换主对话会话。 */
  onSelectMain: (sessionId: string) => void;
  /** 「划词」栏行点击：还原（重开）该划词浮窗。 */
  onRestoreFloating: (sessionId: string) => void;
  onClose: () => void;
}

type TabType = 'main' | 'floating' | 'image';

/** 历史记录面板：分「对话 / 划词 / 生图」三栏；仅在打开时挂载并订阅 sessions。 */
const ChatHistoryOverlay: React.FC<ChatHistoryOverlayProps> = ({
  onSelectMain,
  onRestoreFloating,
  onClose,
}) => {
  const t = useT();
  const sessions = useChatHistory((s) => s.sessionsMeta);
  const activeSessionId = useChatHistory((s) => s.activeSessionId);
  const deleteSession = useChatHistory((s) => s.deleteSession);
  const imageSessions = useImageGen((s) => s.sessions);
  const bringToFront = useImageGen((s) => s.bringToFront);
  const removeSession = useImageGen((s) => s.removeSession);
  const close = useCallback(() => onClose(), [onClose]);
  useOverlayRegistration({ id: 'chat-history-workspace', open: true, onClose: close, priority: 50 });

  const handleDelete = (id: string) => {
    const fc = useFloatingChats.getState();
    const win = fc.windows.find((w) => w.sessionId === id);
    if (win) fc.closeWindow(win.id);
    deleteSession(id);
  };
  const [tab, setTab] = useState<TabType>('main');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const mainSessions = sessions.filter((s) => s.kind !== 'floating' && s.kind !== 'note');
  const floatingSessions = sessions.filter((s) => s.kind === 'floating');

  const imageSessionList: ImageGenSession[] = Object.values(imageSessions).sort(
    (a, b) => b.createdAt - a.createdAt,
  );

  const isFloating = tab === 'floating';
  const isImage = tab === 'image';
  const list = isFloating ? floatingSessions : mainSessions;
  const pageTitle = isImage ? t('menu.history.page.image') : isFloating ? t('menu.history.page.floating') : t('menu.history.page.main');
  const pageDescription = isImage
    ? t('menu.history.desc.image')
    : isFloating
      ? t('menu.history.desc.floating')
      : t('menu.history.desc.main');

  const switchTab = (next: TabType) => { setTab(next); setConfirmId(null); };

  const statusKeys: Record<string, string> = {
    done: 'menu.history.status.done',
    loading: 'menu.history.status.loading',
    error: 'menu.history.status.error',
    idle: 'menu.history.status.idle',
  };

  return (
    <div className="chat-history-overlay" data-testid="chat-history-workspace">
      <aside className="chat-history-sidebar" aria-label={t('menu.history.navAria')}>
        <button onClick={close} className="chat-settings-back" aria-label={t('menu.history.back')}>
          <ArrowLeft size={15} /><span>{t('menu.history.back')}</span>
        </button>
        <div className="chat-settings-brand">
          <span className="chat-settings-brand-icon"><Clock size={16} /></span>
          <span><strong>{t('menu.history.title')}</strong><small>AI Agent</small></span>
        </div>
        <nav className="chat-history-tabs">
        <button
          className={`chat-history-tab ${tab === 'main' ? 'chat-history-tab-active' : ''}`}
          aria-current={tab === 'main' ? 'page' : undefined}
          onClick={() => switchTab('main')}
        >
          <MessageSquare size={15} /><span><strong>{t('menu.history.tab.main')}</strong><small>{t('menu.history.sessionCount', { count: mainSessions.length })}</small></span>
        </button>
        <button
          className={`chat-history-tab ${isFloating ? 'chat-history-tab-active' : ''}`}
          aria-current={isFloating ? 'page' : undefined}
          onClick={() => switchTab('floating')}
        >
          <PencilSparklesIcon size={15} /><span><strong>{t('menu.history.tab.floating')}</strong><small>{t('menu.history.sessionCount', { count: floatingSessions.length })}</small></span>
        </button>
        <button
          className={`chat-history-tab ${isImage ? 'chat-history-tab-active' : ''}`}
          aria-current={isImage ? 'page' : undefined}
          onClick={() => switchTab('image')}
        >
          <ImagePlus size={15} /><span><strong>{t('menu.history.tab.image')}</strong><small>{t('menu.history.taskCount', { count: imageSessionList.length })}</small></span>
        </button>
        </nav>
      </aside>

      <main className="chat-history-main">
        <header className="chat-history-content-header">
          <h1>{pageTitle}</h1>
          <p>{pageDescription}</p>
        </header>
        <div className="chat-history-list">
        {isImage ? (
          imageSessionList.length === 0 ? (
            <div className="chat-history-empty">{t('menu.history.empty.image')}</div>
          ) : (
            imageSessionList.map((s) => {
              const statusKey = statusKeys[s.status];
              return (
              <div
                key={s.id}
                className="chat-history-item"
                onClick={() => {
                  if (confirmId) { setConfirmId(null); return; }
                  bringToFront(s.id);
                  onClose();
                }}
                title={t('menu.history.openImage')}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {s.images.length > 0 && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={s.images[0].url || (s.images[0].b64_json ? `data:image/png;base64,${s.images[0].b64_json}` : undefined)}
                      alt={s.title}
                      className="h-9 w-9 shrink-0 rounded object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="chat-history-item-title">{s.title}</div>
                    <div className="chat-history-item-meta">
                      <span>{new Date(s.createdAt).toLocaleString()}</span>
                      <span
                        style={{
                          color: s.status === 'done'
                            ? 'var(--md-sys-color-tertiary)'
                            : s.status === 'error'
                              ? 'var(--md-sys-color-error)'
                              : 'var(--md-sys-color-on-surface-variant)',
                        }}
                      >
                        {statusKey ? t(statusKey) : s.status}
                        {s.status === 'done' && s.images.length > 0 && ` · ${t('menu.history.imageCount', { count: s.images.length })}`}
                      </span>
                    </div>
                  </div>
                </div>

                {confirmId === s.id ? (
                  <div className="chat-history-confirm" onClick={(e) => e.stopPropagation()}>
                    <span className="chat-history-confirm-label">{t('menu.history.confirmDelete')}</span>
                    <button
                      className="chat-history-confirm-yes"
                      onClick={(e) => { e.stopPropagation(); removeSession(s.id); setConfirmId(null); }}
                    >
                      {t('menu.common.delete')}
                    </button>
                    <button
                      className="chat-history-confirm-no"
                      onClick={(e) => { e.stopPropagation(); setConfirmId(null); }}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmId(s.id); }}
                    className="chat-history-item-delete"
                    title={t('menu.common.delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              );
            })
          )
        ) : (
          list.length === 0 ? (
            <div className="chat-history-empty">{isFloating ? t('menu.history.empty.floating') : t('menu.history.empty.main')}</div>
          ) : (
            list.map((session) => (
              <div
                key={session.id}
                className={`chat-history-item ${session.id === activeSessionId && !isFloating ? 'chat-history-item-active' : ''}`}
                onClick={() => {
                  if (confirmId) { setConfirmId(null); return; }
                  if (isFloating) onRestoreFloating(session.id);
                  else onSelectMain(session.id);
                }}
                title={isFloating ? t('menu.history.restoreFloating') : undefined}
              >
                <div className="chat-history-item-title">{session.title}</div>
                <div className="chat-history-item-meta">
                  <span>{new Date(session.updatedAt).toLocaleString()}</span>
                  <span>{t('menu.history.messageCount', { count: session.messageCount ?? 0 })}</span>
                </div>

                {confirmId === session.id ? (
                  <div className="chat-history-confirm" onClick={(e) => e.stopPropagation()}>
                    <span className="chat-history-confirm-label">{t('menu.history.confirmDelete')}</span>
                    <button
                      className="chat-history-confirm-yes"
                      onClick={(e) => { e.stopPropagation(); handleDelete(session.id); setConfirmId(null); }}
                    >
                      {t('menu.common.delete')}
                    </button>
                    <button
                      className="chat-history-confirm-no"
                      onClick={(e) => { e.stopPropagation(); setConfirmId(null); }}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmId(session.id); }}
                    className="chat-history-item-delete"
                    title={t('menu.common.delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))
          )
        )}
        </div>
      </main>
    </div>
  );
};

export default ChatHistoryOverlay;
