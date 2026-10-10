import { useT } from '@/lib/i18n/index';

import type { QueuedMessage } from './types';
export function QueuedMessages({ visibleQueuedMessages, editQueuedMessage, cancelQueuedMessage }: {
  visibleQueuedMessages: QueuedMessage[];
  editQueuedMessage: (message: QueuedMessage) => void;
  cancelQueuedMessage: (id: string) => void;
}) {
  const t = useT();
  return (<div className="chat-input-queue" role="region" aria-label={t('menu.chatInput.queue.title')}>
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
        </div>);
}
