"use client";

import WebSourceCarousel from "@/components/chat/trace/WebSourceCarousel";
import { WebSearchProviderChips } from "@/components/chat/trace/WebSearchProviderChips";
import { openWebSearchSources } from "@/lib/chat/openSourceTrace";
import { dedupeByKey, webItemKey } from "@/lib/chat/traceSources";
import { webSearchProviderChips, webSourceHost } from "@/lib/chat/webSearchDisplay";
import type { WebSearchInput, WebSearchOutput } from "@/lib/ai/agent/tools/webSearch/types";
import type { TraceToolStep } from "@/lib/chat/buildTrace";

/**
 * 思考链里 webSearch 步骤的展开区：分源状态点 + 紧凑来源走马灯。
 * step.name === 'webSearch' 由调用处保证；part 的精确收窄做不到（union 不随
 * step.name 变窄），这里按 webSearch 的 input/output 形状读取。
 */
export function WebSearchStepDetail({ step }: { step: TraceToolStep }) {
  const part = step.part;
  const input = (part.input ?? null) as WebSearchInput | null;
  const output = part.state === "output-available" ? (part.output as WebSearchOutput | undefined) : null;
  const running = part.state !== "output-available" || Boolean(part.preliminary);
  const errorText =
    part.state === "output-error" ? String((part as { errorText?: unknown }).errorText ?? "") : undefined;
  const sources = dedupeByKey(output?.sources ?? [], webItemKey);
  const chips = webSearchProviderChips({ input, output, running, errorText });
  if (!sources.length && !chips.length && !errorText) return null;
  return (
    <div className="web-search-step-detail">
      {chips.length ? <WebSearchProviderChips chips={chips} /> : null}
      {errorText ? <p className="web-source-fold-error">{errorText}</p> : null}
      {sources.length || running ? (
        <WebSourceCarousel
          compact
          pending={running}
          items={sources.map((source, index) => ({
            key: source.url || `web:${index}:${source.title || "untitled"}`,
            index: index + 1,
            title: source.title || webSourceHost(source.url) || source.url,
            url: source.url,
            host: webSourceHost(source.url),
            icon: source.icon,
            snippet: source.snippet,
          }))}
          onOpen={(item) => openWebSearchSources(sources, item.url, item.index - 1)}
        />
      ) : null}
    </div>
  );
}
