import { translateNow } from "@/lib/i18n/index";
import type { NoteImageHit, SearchHit } from '@/lib/ai/agent/toolTypes';
import { getToolPartsByName } from '@/lib/chat/messages/messageParts';
import type { ChatMessagePart, WebSearchSource } from '@/lib/types/chat';

export type TraceSource =
  | { kind: 'note'; title: string; path: string; snippet: string; query?: string; roundId?: string }
  | { kind: 'web'; title: string; url: string; snippet: string; query?: string; roundId?: string; icon?: string };

/** 按 key 去重；空 key 放行（无 id 的条目不该被误丢）。 */
export function dedupeByKey<T>(items: readonly T[], keyFn: (item: T) => string | null | undefined): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key) {
      out.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function noteItemKey(item: { path?: string | null }): string | null {
  return item.path || null;
}

export function webItemKey(item: { url?: string | null }): string | null {
  return item.url || null;
}

export function noteImageItemKey(item: { src?: string | null }): string | null {
  return item.src || null;
}

export function collectMessageSources(parts: ChatMessagePart[]): TraceSource[] {
  const notes: Extract<TraceSource, { kind: 'note' }>[] = [
    ...getToolPartsByName({ parts }, 'searchNotes').flatMap((part) =>
      part.state === 'output-available' && !part.preliminary
        ? (part.output.hits ?? []).map((hit: SearchHit) => ({
            kind: 'note' as const,
            title: hit.title,
            path: hit.path,
            snippet: hit.snippet ?? '',
          }))
        : [],
    ),
    ...getToolPartsByName({ parts }, 'getSection').flatMap((part) => {
      if (part.state !== 'output-available' || part.preliminary || !part.output.found) return [];
      const path = part.output.path || (part.output.contextKey?.startsWith('section:') ? part.output.contextKey.slice('section:'.length) : '');
      if (!path) return [];
      return [{
        kind: 'note' as const,
        title: part.output.title || path,
        path,
        snippet: part.output.text ?? '',
      }];
    }),
    ...getToolPartsByName({ parts }, 'getCurrentPage').flatMap((part) => {
      if (part.state !== 'output-available' || part.preliminary || part.output.found === false) return [];
      const path = part.output.path || (part.output.contextKey?.startsWith('page:') ? part.output.contextKey.slice('page:'.length) : '');
      if (!path || path.split('/').filter(Boolean).length < 2) return [];
      return [{
        kind: 'note' as const,
        title: part.output.title || path,
        path,
        snippet: part.output.text ?? '',
      }];
    }),
  ];

  const web: Extract<TraceSource, { kind: 'web' }>[] = getToolPartsByName({ parts }, 'webSearch').flatMap((part) =>
    part.state === 'output-available' && !part.preliminary
      ? (part.output.sources ?? []).map((source: WebSearchSource) => ({
          kind: 'web' as const,
          title: source.title || source.url,
          url: source.url ?? '',
          snippet: source.snippet ?? '',
          ...(source.icon ? { icon: source.icon } : {}),
        }))
      : [],
  );

  return [
    ...dedupeByKey(notes, (item) => noteItemKey(item)),
    ...dedupeByKey(web, (item) => webItemKey(item)),
  ];
}

// ─── 检索轮次：一次工具调用的 query + 它返回的来源 ──────────────────
//
// collectMessageSources 是「这条消息引用了哪些来源」的扁平视图（保持原样，兼容旧调用）。
// 这里补的是另一件事：**Agent 到底搜了什么**。一轮 = 一次检索工具调用，
// 于是「搜了什么词 → 查到什么」能整条摊开，而不是一堆失去上下文的条目。

/** 会产生来源的检索类工具。 */
export type SourceRoundTool = 'searchNotes' | 'webSearch' | 'imageSearch' | 'searchNoteImages' | 'getSection' | 'getCurrentPage';

/** 一轮检索：一次工具调用的 query + 它返回的来源。 */
export interface SourceRound {
  /** 稳定去重键，如 `webSearch:0:<query>`；会话级会再加消息序号前缀。 */
  id: string;
  tool: SourceRoundTool;
  /** 这轮实际搜的词；searchNotes 走 id 直取（没给 query）时用命中标题兜底。 */
  query: string;
  sources: TraceSource[];
  /** 可选的本地化分组文案；缺省由 TOOL_PRESENTATION 的既有标签兜底。 */
  label?: string;
}

/** 单个来源的全局去重键：笔记用 path、网页用 url；空 key 返回 null（放行，不误丢）。 */
export function traceSourceKey(source: TraceSource): string | null {
  return source.kind === 'note' ? noteItemKey(source) : webItemKey(source);
}

function noteSourcesOfHits(hits: readonly SearchHit[]): TraceSource[] {
  return hits.map((hit) => ({
    kind: 'note' as const,
    title: hit.title,
    path: hit.path,
    snippet: hit.snippet ?? '',
  }));
}

function webSourcesOf(items: readonly WebSearchSource[]): TraceSource[] {
  return items.map((source) => ({
    kind: 'web' as const,
    // imageSearch 的条目常常只有 alt 没有 title，别让目录里出现空白标题。
    title: source.title || source.alt || source.url || translateNow('agent.sources.untitled'),
    url: source.url ?? '',
    snippet: source.snippet ?? '',
    ...(source.icon ? { icon: source.icon } : {}),
  }));
}

/**
 * 笔记配图：图也是「可点开的来源」，用图片 src 当 url（目录里一条图一个入口）。
 * TraceSource 只有 note / web 两种 kind，图片按 web 走——它的地址就是 src。
 */
function noteImageSourcesOf(images: readonly NoteImageHit[]): TraceSource[] {
  return images.map((image) => ({
    kind: 'web' as const,
    title: image.alt || image.caption || image.title || image.src,
    url: image.src,
    snippet: image.caption || image.context || '',
  }));
}

/** 给来源回填它属于哪一轮：扁平列表（如窗口 data 的 sources）也能按 query 分组。 */
function tagSource(source: TraceSource, query: string, roundId: string): TraceSource {
  // 分两支展开：union 直接 spread 会丢掉判别成员，显式收窄才留得住 kind。
  return source.kind === 'note'
    ? { ...source, query, roundId }
    : { ...source, query, roundId };
}

/**
 * 组装一轮。**没有来源的轮次直接丢掉**：搜了但零结果不该在来源面板里占一行。
 * query 缺失时用首条来源的标题兜底（searchNotes 的 id 直取路径就是这种）。
 */
function makeRound(
  tool: SourceRoundTool,
  partIndex: number,
  rawQuery: string,
  sources: TraceSource[],
): SourceRound | null {
  if (!sources.length) return null;
  const first = sources[0];
  const fallbackTitle = first.kind === 'note' ? first.title || first.path : first.title || first.url;
  const query = rawQuery.trim() || fallbackTitle;
  const id = `${tool}:${partIndex}:${query}`;
  return { id, tool, query, sources: sources.map((source) => tagSource(source, query, id)) };
}

/**
 * 一条消息里按时间顺序的检索轮次（part 顺序 = 调用顺序）。
 * preliminary / 非 output-available 的 part 一律不算——流式半成品不是来源。
 */
export function collectMessageSourceRounds(parts: ChatMessagePart[]): SourceRound[] {
  const rounds: SourceRound[] = [];
  parts.forEach((part, index) => {
    switch (part.type) {
      case 'tool-searchNotes': {
        if (part.state !== 'output-available' || part.preliminary) break;
        const round = makeRound('searchNotes', index, part.input?.query ?? '', noteSourcesOfHits(part.output.hits ?? []));
        if (round) rounds.push(round);
        break;
      }
      case 'tool-getSection': {
        if (part.state !== 'output-available' || part.preliminary || !part.output.found) break;
        const path = part.output.path || (part.output.contextKey?.startsWith('section:') ? part.output.contextKey.slice('section:'.length) : '');
        if (!path) break;
        const round = makeRound('getSection', index, part.input?.path || part.input?.sectionId || path, [{
          kind: 'note',
          title: part.output.title || path,
          path,
          snippet: part.output.text ?? '',
        }]);
        if (round) rounds.push(round);
        break;
      }
      case 'tool-getCurrentPage': {
        if (part.state !== 'output-available' || part.preliminary || part.output.found === false) break;
        const path = part.output.path || (part.output.contextKey?.startsWith('page:') ? part.output.contextKey.slice('page:'.length) : '');
        if (!path || path.split('/').filter(Boolean).length < 2) break;
        const round = makeRound('getCurrentPage', index, part.output.title || path, [{
          kind: 'note',
          title: part.output.title || path,
          path,
          snippet: part.output.text ?? '',
        }]);
        if (round) rounds.push(round);
        break;
      }
      case 'tool-webSearch': {
        if (part.state !== 'output-available' || part.preliminary) break;
        const round = makeRound('webSearch', index, part.input?.query ?? '', webSourcesOf(part.output.sources ?? []));
        if (round) rounds.push(round);
        break;
      }
      case 'tool-imageSearch': {
        if (part.state !== 'output-available' || part.preliminary) break;
        const round = makeRound('imageSearch', index, part.input?.query ?? '', webSourcesOf(part.output.sources ?? []));
        if (round) rounds.push(round);
        break;
      }
      case 'tool-searchNoteImages': {
        if (part.state !== 'output-available' || part.preliminary) break;
        const round = makeRound('searchNoteImages', index, part.input?.query ?? '', noteImageSourcesOf(part.output.images ?? []));
        if (round) rounds.push(round);
        break;
      }
      default:
        break;
    }
  });
  return rounds;
}

/**
 * 整条对话的检索轮次：按消息顺序保序，来源**全局去重**（note 用 path、web 用 url；空 key 放行）。
 *
 * 去重是跨轮的：同一条来源在第二轮又被搜到时只留在第一轮，否则同一篇笔记会在目录里出现多次。
 * 但轮次本身保留（轮次是"搜了什么"的记录），整轮都被去重掉才丢掉。
 */
export function collectSessionSourceRounds(
  messages: { role: string; parts: ChatMessagePart[] }[],
): SourceRound[] {
  const seen = new Set<string>();
  const rounds: SourceRound[] = [];
  messages.forEach((message, messageIndex) => {
    for (const round of collectMessageSourceRounds(message.parts)) {
      // 消息序号进 id：不同消息里的同名工具调用不能撞 key（目录分组 / React key 都吃它）。
      const id = `${messageIndex}:${round.id}`;
      const sources: TraceSource[] = [];
      for (const source of round.sources) {
        const key = traceSourceKey(source);
        if (key) {
          if (seen.has(key)) continue;
          seen.add(key);
        }
        sources.push(tagSource(source, round.query, id));
      }
      if (!sources.length) continue;
      rounds.push({ ...round, id, sources });
    }
  });
  return rounds;
}
