"use client";

import { Fragment } from "react";
import type { ChatMessage } from "@/lib/types/chat";
import { getToolPartsByName } from "@/lib/chat/messages/messageParts";
import { dedupeByKey } from "@/lib/chat/sources/traceSources";
import type { StudyToolName } from "@/lib/ai/agent/tools/names";
import type { ToolPart } from "@/lib/ai/agent/tools/registry";
import { TOOL_RESULT_CARDS, type ToolResultCardEntry } from "@/components/chat/toolCards/registry";
import { useIsAgentSurface } from "@/lib/window/useManagedWindowSurface";

function dedupBy<T>(keyFn: (item: T) => string | null) {
  const seen = new Set<string>();
  return (item: T) => {
    const key = keyFn(item);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

function uniqueQueries(parts: readonly ToolPart<StudyToolName>[]): string[] {
  return dedupeByKey(
    parts.flatMap((part) => {
      const input = part.input;
      if (!input || typeof input !== "object" || !("query" in input)) return [];
      const query = String((input as { query?: unknown }).query ?? "").trim();
      return query ? [query] : [];
    }),
    (query) => query,
  );
}

function overlayAggregateMeta(
  part: ToolPart<StudyToolName>,
  parts: readonly ToolPart<StudyToolName>[],
): ToolPart<StudyToolName> {
  if (part.state !== "output-available") return part;
  const queries = uniqueQueries(parts);
  const input =
    queries.length && part.input && typeof part.input === "object"
      ? { ...part.input, query: queries.join(" · ") }
      : part.input;
  if (!("cacheHit" in part.output)) return Object.assign({}, part, { input });
  const cacheHit = parts.every(
    (item) => item.state === "output-available" && Boolean((item.output as { cacheHit?: boolean }).cacheHit),
  );
  return Object.assign({}, part, { input, output: { ...part.output, cacheHit } });
}

function mergeAggregatedPart(
  card: ToolResultCardEntry,
  parts: Array<ToolPart<StudyToolName>>,
  base?: ToolPart<StudyToolName>,
): ToolPart<StudyToolName> {
  const anchor = base ?? parts[0];
  const items = dedupeByKey(
    parts.flatMap((part) => card.itemsOf?.(part) ?? []),
    (item) => card.itemKey?.(item) ?? null,
  );
  const merged = card.withItems ? card.withItems(anchor, items) : anchor;
  return overlayAggregateMeta(merged, parts);
}

/** live 聚合的锚点：优先最后一个带 output 的 part（含 preliminary 部分结果），保住已流到的条目。 */
function liveMergeBase(parts: readonly ToolPart<StudyToolName>[]): ToolPart<StudyToolName> {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index].state === "output-available") return parts[index];
  }
  return parts[parts.length - 1];
}

export function ToolResultCards({
  message,
  isStreaming,
  names,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
  /** 缺省按 RESULT_CARD_ORDER；传入时只渲染该子集。 */
  names?: readonly StudyToolName[];
}) {
  const isAgentSurface = useIsAgentSurface();
  const cards = names
    ? TOOL_RESULT_CARDS.filter((card) => names.includes(card.name))
    : TOOL_RESULT_CARDS;
  const ctx = { isStreaming: !!isStreaming };

  return (
    <>
      {cards.map((card) => {
        const { name, ResultCard, resultKey, shouldRender, aggregate, hideInAgentChat } = card;
        if (isAgentSurface && hideInAgentChat) return <Fragment key={name} />;
        const all = getToolPartsByName(message, name);
        const ready = all
          .filter((part) => part.state === "output-available" && !part.preliminary && (shouldRender?.(part as never) ?? true));
        // liveWhileRunning 的工具把未完成 part 也送进卡片：流式期间全部 pending 都进 live 卡；
        // 流已结束时只剩「output-error」值得补显示（输入态/preliminary 不会再推进了）。
        const pending = card.liveWhileRunning
          ? all.filter((part) => part.state !== "output-available" || Boolean(part.preliminary))
          : [];
        const liveParts = isStreaming ? pending : pending.filter((part) => part.state === "output-error");

        if (aggregate) {
          if (isStreaming && pending.length) {
            const base = liveMergeBase([...ready, ...pending] as Array<ToolPart<StudyToolName>>);
            const merged = mergeAggregatedPart(card, [...ready, ...pending] as Array<ToolPart<StudyToolName>>, base);
            // 锚点是已完成调用时，merged 长得像终态卡——强制 preliminary 让卡片按 live 渲染。
            const livePart =
              merged.state === "output-available" ? { ...merged, preliminary: true } : merged;
            return (
              <ResultCard
                key={name}
                part={livePart as never}
                message={message}
                isStreaming={!!isStreaming}
                ctx={ctx}
              />
            );
          }
          return (
            <Fragment key={name}>
              {ready.length ? (
                <ResultCard
                  key="merged"
                  part={mergeAggregatedPart(card, ready as Array<ToolPart<StudyToolName>>) as never}
                  message={message}
                  isStreaming={!!isStreaming}
                  ctx={ctx}
                />
              ) : null}
              {liveParts.map((part) => (
                <ResultCard
                  key={`live:${part.toolCallId}`}
                  part={part as never}
                  message={message}
                  isStreaming={!!isStreaming}
                  ctx={ctx}
                />
              ))}
            </Fragment>
          );
        }

        return (
          <Fragment key={name}>
            {ready
              .filter(dedupBy((part) => resultKey?.(part as never) ?? null))
              .map((part) => (
                <ResultCard
                  key={resultKey?.(part as never) ?? part.toolCallId}
                  part={part as never}
                  message={message}
                  isStreaming={!!isStreaming}
                  ctx={ctx}
                />
              ))}
            {liveParts.map((part) => (
              <ResultCard
                key={`live:${part.toolCallId}`}
                part={part as never}
                message={message}
                isStreaming={!!isStreaming}
                ctx={ctx}
              />
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
