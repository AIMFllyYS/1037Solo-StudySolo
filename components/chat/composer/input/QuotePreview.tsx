import { AgentQuoteIcon, AgentCloseIcon } from '@/components/icons/AgentIcons';

import { useT } from '@/lib/i18n/index';

export function QuotePreview({ effectiveQuote, clearQuote }: { effectiveQuote: string; clearQuote: () => void }) {
  const t = useT();
  return (<div className="chat-input-quote">
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
        </div>);
}
