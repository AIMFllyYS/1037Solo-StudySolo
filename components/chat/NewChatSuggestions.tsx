'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface NewChatSuggestion {
  id: string;
  text: string;
  icon: ReactNode;
}

/** Initial guidance, presented as the original approved Agent rows. */
export default function NewChatSuggestions({ items, onSelect, label, className, testId = 'new-chat-suggestions', itemTestIdPrefix = 'new-chat-suggestion' }: {
  items: readonly NewChatSuggestion[];
  onSelect: (text: string) => void;
  label?: string;
  className?: string;
  testId?: string;
  itemTestIdPrefix?: string;
}) {
  return (
    <div className={clsx('chat-welcome-examples', className)} data-testid={testId} aria-label={label}>
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onSelect(item.text)} className="chat-welcome-example press" data-testid={`${itemTestIdPrefix}-${item.id}`}>
          <span className="chat-welcome-example-icon" aria-hidden>{item.icon}</span>
          <span className="chat-welcome-example-text">{item.text}</span>
        </button>
      ))}
    </div>
  );
}
