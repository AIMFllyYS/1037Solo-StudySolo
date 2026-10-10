import ModelMenu from '@/components/chat/composer/ModelMenu';
import AnchoredMenu from '@/components/ui/AnchoredMenu';
import AgentModeMenu, { AgentModeMenuItems } from '@/components/chat/composer/AgentModeMenu';
import { MoreHorizontal } from 'lucide-react';

import TokenDashboard from '@/components/chat/billing/TokenDashboard';

import { useT } from '@/lib/i18n/index';

import type { ThinkingEffort } from '@/lib/stores/settings';
interface ComposerToolbarProps {
  showProjectPicker: boolean; showAgentModeMenu: boolean; inputDisabled: boolean;
  showTokenDashboard: boolean; isLoading: boolean; floatingSessionId?: string; modelId?: string;
  onOpenSettings?: () => void; onModelChange?: (id: string) => void;
  effectiveEnableThinking: boolean; displayEffort: ThinkingEffort;
  onThinkingChange: (next: { enabled: boolean; effort: ThinkingEffort }) => void;
}
export function ComposerToolbar({ showProjectPicker, showAgentModeMenu, inputDisabled, showTokenDashboard, isLoading, floatingSessionId, modelId, onOpenSettings, onModelChange, effectiveEnableThinking, displayEffort, onThinkingChange }: ComposerToolbarProps) {
  const t = useT();
  return (<div className="chat-input-toolbar" aria-label={t('menu.chatInput.toolbarAria')}>
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
            onThinkingChange={onThinkingChange}
          />
        </div>
      </div>);
}
