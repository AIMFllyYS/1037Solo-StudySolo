'use client';

import React, { useSyncExternalStore } from 'react';
import { Sparkles } from 'lucide-react';
import { translateNow, useT, type I18nKey, type Translate } from "@/lib/i18n";

/**
 * Agent 空对话欢迎页：问候语在上、输入框居中、示例清单在下（对齐 ChatGPT 官网那种首页）。
 *
 * 这里刻意不做「我是你的 X 助教 + 当前学习：Y」那一套：Agent 是通用型助手，
 * 开新对话时不预设主题，示例只是几条**能直接点走**的起手式，点下去就等于把这句话发出去。
 */
/**
 * 纯函数也要能取词：默认按 store 的当前语言即时解析。
 * 组件内部一律显式传 `useT()` 的 t，换语言才能跟着重渲染。
 */

/** 起手式清单：文案进词典（textKey），起手式本身仍是固定可点的四条。 */
export const AGENT_WELCOME_EXAMPLES = [
  { id: 'outline', textKey: 'trace.welcome.example.outline', descriptionKey: 'panel.agentWelcome.description.outline' },
  { id: 'flashcards', textKey: 'trace.welcome.example.flashcards', descriptionKey: 'panel.agentWelcome.description.flashcards' },
  { id: 'demo', textKey: 'trace.welcome.example.demo', descriptionKey: 'panel.agentWelcome.description.demo' },
  { id: 'brief', textKey: 'trace.welcome.example.brief', descriptionKey: 'panel.agentWelcome.description.brief' },
] as const satisfies readonly { id: string; textKey: I18nKey; descriptionKey: I18nKey }[];

type WelcomeExampleId = (typeof AGENT_WELCOME_EXAMPLES)[number]['id'];

function WelcomeArtwork({ kind }: { kind: WelcomeExampleId }) {
  switch (kind) {
    case 'outline':
      return (
        <svg viewBox="0 0 64 52" width="64" height="52" fill="none" aria-hidden="true">
          <rect x="11" y="5" width="35" height="42" rx="6" fill="var(--bg-panel)" stroke="currentColor" strokeOpacity=".25" />
          <path d="M19 16h19M19 23h14M19 30h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".62" />
          <circle cx="45" cy="35" r="10" fill="var(--accent-weak)" stroke="var(--accent)" strokeOpacity=".35" />
          <path d="m41 35 2.5 2.5L49 32" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'flashcards':
      return (
        <svg viewBox="0 0 64 52" width="64" height="52" fill="none" aria-hidden="true">
          <rect x="12" y="8" width="31" height="35" rx="6" transform="rotate(-8 12 8)" fill="var(--bg-panel)" stroke="currentColor" strokeOpacity=".22" />
          <rect x="20" y="8" width="31" height="35" rx="6" fill="var(--bg-panel)" stroke="currentColor" strokeOpacity=".32" />
          <path d="M26 18h18M26 25h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".52" />
          <path d="m27 33 3 3 6-7" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'demo':
      return (
        <svg viewBox="0 0 64 52" width="64" height="52" fill="none" aria-hidden="true">
          <rect x="8" y="7" width="43" height="34" rx="7" fill="var(--bg-panel)" stroke="currentColor" strokeOpacity=".25" />
          <path d="M16 17h26M16 25h26M16 33h26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".34" />
          <circle cx="24" cy="17" r="4" fill="var(--accent)" />
          <circle cx="37" cy="25" r="4" fill="var(--accent-ink)" opacity=".78" />
          <circle cx="29" cy="33" r="4" fill="var(--md-sys-color-tertiary)" />
          <path d="m46 35 8 9-4 .5-2 4-3-14.5Z" fill="var(--md-sys-color-on-surface)" stroke="var(--bg-panel)" strokeWidth="1.5" />
        </svg>
      );
    case 'brief':
      return (
        <svg viewBox="0 0 64 52" width="64" height="52" fill="none" aria-hidden="true">
          <circle cx="28" cy="24" r="16" fill="var(--bg-panel)" stroke="currentColor" strokeOpacity=".3" />
          <path d="M12 24h32M28 8c5 5 7 10 7 16s-2 11-7 16M28 8c-5 5-7 10-7 16s2 11 7 16M16 14h24M16 34h24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".52" />
          <circle cx="45" cy="34" r="8" fill="var(--accent-weak)" stroke="var(--accent)" strokeOpacity=".45" />
          <path d="m51 40 6 6" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
  }
}

/** 按本机时间分档打招呼；纯函数，方便单测直接钉住每一档。 */
export function welcomeGreeting(hour: number, t: Translate = translateNow): string {
  if (hour < 5) return t('trace.welcome.earlyMorning');
  if (hour < 11) return t('trace.welcome.morning');
  if (hour < 13) return t('trace.welcome.noon');
  if (hour < 18) return t('trace.welcome.afternoon');
  if (hour < 23) return t('trace.welcome.evening');
  return t('trace.welcome.earlyMorning');
}

/**
 * 时钟是外部可变值，用 useSyncExternalStore 读：服务端快照给空串，
 * 于是首帧水合与客户端不一致的风险为零（欢迎页本身也只在客户端就绪后才出现）。
 */
const subscribeClock = () => () => {};
const readHour = () => new Date().getHours();
const readHourOnServer = () => -1;

export function AgentWelcomeGreeting() {
  const t = useT();
  const hour = useSyncExternalStore(subscribeClock, readHour, readHourOnServer);
  if (hour < 0) return null;
  return (
    <p className="chat-welcome-greeting animate-fade-up" data-testid="agent-welcome-greeting">
      {welcomeGreeting(hour, t)}
    </p>
  );
}

export function AgentWelcomeExamples({ onSelect }: { onSelect: (text: string) => void }) {
  const t = useT();
  return (
    <section
      className="chat-welcome-examples animate-fade-up"
      data-testid="agent-welcome-examples"
      aria-label={t('panel.agentWelcome.examplesTitle')}
    >
      <div className="chat-welcome-examples-heading">
        <Sparkles size={14} aria-hidden="true" />
        <span>{t('panel.agentWelcome.examplesTitle')}</span>
      </div>
      {AGENT_WELCOME_EXAMPLES.map((example) => (
        <button
          key={example.id}
          type="button"
          onClick={() => onSelect(t(example.textKey))}
          className="chat-welcome-example press"
          data-testid={`agent-welcome-example-${example.id}`}
          data-example-id={example.id}
        >
          <span className="chat-welcome-example-art" aria-hidden="true"><WelcomeArtwork kind={example.id} /></span>
          <span className="chat-welcome-example-copy">
            <span className="chat-welcome-example-title">{t(example.textKey)}</span>
            <span className="chat-welcome-example-description">{t(example.descriptionKey)}</span>
          </span>
        </button>
      ))}
    </section>
  );
}
