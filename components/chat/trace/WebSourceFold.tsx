'use client';

import React, { useState } from 'react';
import { AgentGlobeIcon } from '@/components/icons/AgentIcons';
import type { WebSearchSource } from '@/lib/types/chat';
import AgentFoldHeader from '@/components/chat/trace/AgentFoldHeader';
import WebSourceCarousel from '@/components/chat/trace/WebSourceCarousel';
import { WebSearchProviderChips } from '@/components/chat/trace/WebSearchProviderChips';
import { openWebSearchSources } from '@/lib/chat/sources/openSourceTrace';
import { dedupeByKey, webItemKey } from '@/lib/chat/sources/traceSources';
import { WEB_SEARCH_PROVIDER_LABELS, webSourceHost, type ProviderChip } from '@/lib/chat/sources/webSearchDisplay';
import { useT } from '@/lib/i18n/index';

export default function WebSourceFold({
  sources,
  cacheHit,
  label,
  live = false,
  chips = [],
  errorText,
}: {
  sources: WebSearchSource[];
  cacheHit?: boolean;
  label?: string;
  /** 搜索进行中：标题换「正在搜索…」并在走马灯尾部追加骨架卡。 */
  live?: boolean;
  /** 分源状态点（Kimi/智谱/Perplexity），空数组不显示。 */
  chips?: ProviderChip[];
  /** 整次调用失败的原因文案。 */
  errorText?: string;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const unique = dedupeByKey(sources, webItemKey);
  if (!unique.length && !live && !errorText) return null;
  const resolvedLabel = label ?? t('trace.webSources.title');
  const runningProviders = chips
    .filter((chip) => chip.state !== 'skipped')
    .map((chip) => chip.provider);
  const providerNames = runningProviders
    .map((provider) => WEB_SEARCH_PROVIDER_LABELS[provider])
    .join(' · ');
  const title = live
    ? t('trace.webSources.searching', { providers: providerNames || t('trace.webSources.title') })
    : errorText && !unique.length
      ? t('trace.webSources.failed')
      : t('trace.webSources.foldTitle', {
          label: resolvedLabel,
          count: unique.length,
          footnote: cacheHit ? t('trace.webSources.cached') : '',
        });

  return (
    <div
      className="agent-fold web-source-fold"
      data-testid="web-source-fold"
      data-live={live || undefined}
      aria-label={resolvedLabel}
    >
      <AgentFoldHeader
        icon={<AgentGlobeIcon size={16} className="shrink-0" />}
        title={title}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
      />
      {chips.length ? <div className="web-source-fold-chips"><WebSearchProviderChips chips={chips} /></div> : null}
      {errorText ? <p className="web-source-fold-error">{errorText}</p> : null}
      {unique.length || live ? (
        <WebSourceCarousel
          items={unique.map((source, index) => ({
            key: source.url || `web:${index}:${source.title || 'untitled'}`,
            index: index + 1,
            title: source.title || webSourceHost(source.url) || source.url,
            url: source.url,
            host: webSourceHost(source.url),
            icon: source.icon,
            snippet: source.snippet,
          }))}
          pending={live}
          onOpen={(item) => openWebSearchSources(unique, item.url, item.index - 1)}
          ariaLabel={resolvedLabel}
        />
      ) : null}
      {expanded ? (
        <ul className="agent-fold-list hide-scrollbar">
          {unique.map((source, index) => (
            <li key={source.url || `web:${index}:${source.title || "untitled"}`}>
              <button
                type="button"
                className="web-source-item"
                onClick={() => openWebSearchSources(unique, source.url, index)}
              >
                <span className="web-source-item-title">
                  <span className="min-w-0 flex-1 truncate">{index + 1}. {source.title || webSourceHost(source.url) || source.url}</span>
                </span>
                <span className="web-source-item-host" title={source.url || undefined}>
                  {source.url || t('agent.sources.noLink')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
