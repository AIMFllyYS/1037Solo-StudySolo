'use client';

import React, { useSyncExternalStore } from 'react';
import { Globe, Layers, MousePointerClick, NotebookPen } from 'lucide-react';
import NewChatSuggestions from '@/components/chat/NewChatSuggestions';
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
  { id: 'outline', textKey: 'trace.welcome.example.outline', icon: <NotebookPen size={15} /> },
  { id: 'flashcards', textKey: 'trace.welcome.example.flashcards', icon: <Layers size={15} /> },
  { id: 'demo', textKey: 'trace.welcome.example.demo', icon: <MousePointerClick size={15} /> },
  { id: 'brief', textKey: 'trace.welcome.example.brief', icon: <Globe size={15} /> },
] as const satisfies readonly { id: string; textKey: I18nKey; icon: React.ReactNode }[];

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
    <NewChatSuggestions
      label={t('panel.agentWelcome.examplesTitle')}
      items={AGENT_WELCOME_EXAMPLES.map((example) => ({ id: example.id, text: t(example.textKey), icon: example.icon }))}
      onSelect={onSelect}
      className="animate-fade-up"
      testId="agent-welcome-examples"
      itemTestIdPrefix="agent-welcome-example"
    />
  );
}
