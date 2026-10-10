import React, { useState, useRef, useEffect, useCallback } from 'react';

import type { QueuedMessage } from './types';
interface ComposerQueueInput {
  sessionId?: string;
  isLoading: boolean;
  externalDisabled?: boolean;
  dispatchMessage: (message: QueuedMessage) => void;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}
export function useComposerQueue({ sessionId, isLoading, externalDisabled, dispatchMessage, setInput, textareaRef }: ComposerQueueInput) {

  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [editingQueuedId, setEditingQueuedId] = useState<string | null>(null);
  const queueAwaitingLoadingRef = useRef(false);
  const queueMessage = useCallback((message: QueuedMessage) => {
    if (editingQueuedId) {
      setQueuedMessages((items) => items.map((item) => item.id === editingQueuedId ? { ...item, content: message.content } : item));
      setEditingQueuedId(null);
    } else setQueuedMessages((items) => [...items, message]);
  }, [editingQueuedId]);

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
  }, [setInput, textareaRef]);

  const cancelQueuedMessage = useCallback((id: string) => {
    setQueuedMessages((items) => items.filter((item) => item.id !== id));
    setEditingQueuedId((current) => current === id ? null : current);
  }, []);
  // 队列按会话过滤展示：切到别的会话时不把那边排队的消息摆在这里。
  const visibleQueuedMessages = queuedMessages.filter((item) => item.sessionId === sessionId);
  return { queueMessage, visibleQueuedMessages, editQueuedMessage, cancelQueuedMessage };
}
