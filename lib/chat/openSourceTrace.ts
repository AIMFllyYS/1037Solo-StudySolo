import { useWindowManager } from '@/lib/stores/workspace/windowManager';
import { translateNow } from "@/lib/i18n";
import type { SourceRound, TraceSource } from '@/lib/chat/traceSources';
import type { WebSearchSource } from '@/lib/types/chat';

export const SOURCE_TRACE_WINDOW_ID = 'source-trace-viewer';

export function sourceItemKey(source: TraceSource, index = 0): string {
  if (source.kind === 'note') {
    return source.path ? `note:${source.path}` : `note:${index}:${source.title || 'untitled'}`;
  }
  return source.url ? `web:${source.url}` : `web:${index}:${source.title || 'untitled'}`;
}

/**
 * 打开来源面板。
 *
 * `rounds` 可选：带上它，目录就按检索轮次分组（"搜了什么 → 查到什么"）；
 * 只传 sources 时窗口 data 的形状与旧版完全一致（不写空的 rounds 字段）。
 */
export function openSourceTrace(
  sources: TraceSource[],
  options?: { id?: string; title?: string; activeKey?: string; rounds?: SourceRound[] },
) {
  if (!sources.length) return;
  const id = options?.id ?? SOURCE_TRACE_WINDOW_ID;
  // 窗口标题会经通用 chrome（任务栏 / 标签条）原样显示，所以必须在开窗时就翻好——
  // 存 key 进 windowManager 会让标签条直接显示 "agent.sources.traceWindowTitle"。
  const title =
    options?.title ??
    translateNow('agent.sources.traceWindowTitle', { count: sources.length });
  const activeKey = options?.activeKey ?? sourceItemKey(sources[0], 0);
  const rounds = options?.rounds?.length ? options.rounds : null;
  const data = rounds ? { sources, activeKey, rounds } : { sources, activeKey };
  const { pos, size } = sourceTraceGeometry();
  const wm = useWindowManager.getState();
  const existing = wm.windows.find((win) => win.id === id);
  if (existing) {
    wm.updateWindow(id, { title, data });
    if (existing.minimized) wm.restoreWindow(id);
    else wm.bringToFront(id);
    return;
  }
  wm.openWindow({
    id,
    type: 'source-trace-viewer',
    title,
    pos,
    size,
    data,
  });
}

export function openWebSearchSources(sources: WebSearchSource[], activeUrl?: string, activeIndex?: number) {
  const items: TraceSource[] = sources.map((source) => ({
    kind: 'web' as const,
    title: source.title || source.url || translateNow('agent.sources.untitled'),
    url: source.url ?? '',
    snippet: source.snippet ?? '',
  }));
  if (!items.length) return;
  const index = activeIndex != null && activeIndex >= 0 && activeIndex < items.length
    ? activeIndex
    : Math.max(0, items.findIndex((item) => item.kind === 'web' && item.url && item.url === activeUrl));
  const active = items[index] ?? items[0];
  const firstUrl = items.find((item): item is Extract<TraceSource, { kind: 'web' }> => item.kind === 'web' && !!item.url)?.url;
  openSourceTrace(items, {
    id: `web-search:${firstUrl || items.length}`,
    title: translateNow('agent.sources.webWindowTitle', { count: items.length }),
    activeKey: sourceItemKey(active, index),
  });
}

function sourceTraceGeometry() {
  if (typeof window === 'undefined') {
    return { pos: { x: 48, y: 64 }, size: { width: 920, height: 680 } };
  }
  const width = Math.min(960, Math.floor(window.innerWidth * 0.78));
  const height = Math.min(820, Math.floor(window.innerHeight * 0.86));
  return {
    pos: {
      x: Math.max(16, Math.floor(window.innerWidth * 0.12)),
      y: Math.max(16, Math.floor(window.innerHeight * 0.06)),
    },
    size: { width, height },
  };
}
