"use client";

import { useEffect, type RefObject } from "react";
import { useStore } from "@/lib/store";
import type { TocItem } from "@/lib/types/toc";

/**
 * 从标题文本生成 URL 安全的 slug id。
 * 保留中英文/数字，去除数学公式分隔符与特殊符号，空格转连字符。
 */
function slugify(text: string): string {
  return text
    .replace(/\$/g, "")
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 50);
}

/**
 * 将扁平的标题元素列表构建为嵌套的 TocItem 树。
 * 基于 level 维护栈：遇到 level N 时弹出所有 level >= N 的节点，当前节点成为栈顶的 child。
 */
function buildTocTree(
  headings: { el: HTMLElement; level: 1 | 2 | 3 | 4; text: string; id: string }[],
): TocItem[] {
  const root: TocItem[] = [];
  const stack: TocItem[] = [];

  for (const h of headings) {
    const item: TocItem = {
      id: h.id,
      level: h.level,
      text: h.text,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(item);
    } else {
      stack[stack.length - 1].children.push(item);
    }
    stack.push(item);
  }

  return root;
}

/**
 * TOC 提取 hook：在正文容器挂载后扫描 h1-h4 元素，分配 id，构建 TOC 树，
 * 并通过 IntersectionObserver 跟踪当前可见标题。
 *
 * 使用 setTimeout + 重试机制替代 requestAnimationFrame，确保在 Suspense 边界
 * 和 AnimatePresence 动画延迟下 DOM 已稳定。
 *
 * @param containerRef 正文滚动容器的 ref
 * @param enabled      是否启用 TOC 提取（仅 activeTab==='content' && renderType==='markdown' 时为 true）
 * @param itemId       当前内容项 id（变化时触发重新扫描）
 * @param contentKey   内容标识（如 initialContent 字符串），确保同 itemId 不同内容时也重新扫描
 */
export function useToc(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  itemId: string,
  contentKey: string,
): void {
  const setTocData = useStore((s) => s.setTocData);
  const setActiveTocId = useStore((s) => s.setActiveTocId);

  useEffect(() => {
    if (!enabled) {
      setTocData([], null);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const root: HTMLElement = container;
    let observer: IntersectionObserver | null = null;
    let mountObserver: MutationObserver | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    let cancelled = false;

    /** 扫描 DOM 标题，构建 TOC 树。若未找到标题则重试 1 次。 */
    function scanHeadings(attempt: number): void {
      if (cancelled) return;

      const headingEls = root.querySelectorAll<HTMLElement>(
        "article h1, article h2, article h3, article h4",
      );

      if (headingEls.length === 0) {
        if (!mountObserver && typeof MutationObserver !== "undefined") {
          mountObserver = new MutationObserver(() => {
            if (cancelled || !root.querySelector("article h1, article h2, article h3, article h4")) return;
            mountObserver?.disconnect();
            mountObserver = null;
            scanHeadings(0);
          });
          mountObserver.observe(root, { childList: true, subtree: true });
        }
        // 重试：最多 1 次，间隔 50ms
        if (attempt < 1) {
          retryTimer = setTimeout(() => scanHeadings(attempt + 1), 50);
        } else {
          setTocData([], null);
        }
        return;
      }

      // 分配 id（slugify + 去重）
      const usedIds = new Map<string, number>();
      const headings: { el: HTMLElement; level: 1 | 2 | 3 | 4; text: string; id: string }[] = [];

      headingEls.forEach((el) => {
        const text = (el.textContent || "").trim();
        if (!text) return;

        const baseSlug = slugify(text) || `heading-${headings.length}`;
        let id = baseSlug;
        const count = usedIds.get(baseSlug);
        if (count) {
          id = `${baseSlug}-${count + 1}`;
          usedIds.set(baseSlug, count + 1);
        } else {
          usedIds.set(baseSlug, 1);
        }

        el.id = id;
        const level = Number(el.tagName.charAt(1)) as 1 | 2 | 3 | 4;
        headings.push({ el, level, text, id });
      });

      if (headings.length === 0) {
        setTocData([], null);
        return;
      }

      const tocTree = buildTocTree(headings);
      mountObserver?.disconnect();
      mountObserver = null;

      // IntersectionObserver：跟踪当前可见标题（rAF 节流）
      const obs = new IntersectionObserver(
        (entries) => {
          if (cancelled) return;
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            const visible = entries
              .filter((e) => e.isIntersecting)
              .sort(
                (a, b) =>
                  a.boundingClientRect.top - b.boundingClientRect.top,
              );
            if (visible.length > 0) {
              setActiveTocId(visible[0].target.id);
            }
          });
        },
        {
          root: root,
          rootMargin: "-84px 0px -70% 0px",
          threshold: 0,
        },
      );

      observer = obs;
      // 合并单次 set：TOC 树 + 初始 activeId
      setTocData(tocTree, headings.length > 0 ? headings[0].id : null);
      headings.forEach((h) => obs.observe(h.el));
    }

    // 首次扫描：优先用 requestIdleCallback 让路给正文 paint；不支持则退回 rAF。
    // 概率论一整卷试卷可能有 200+ 标题元素，一次 querySelectorAll + assign id + 观察器注册
    // 会占用 30~80ms 主线程；把这段工作推到浏览器空闲期，用户"看到内容"的时刻更靠前。
    // timeout 兜底 200ms，保证低速设备也能稳定拿到 TOC，不至于永久悬置。
    const win = typeof window !== "undefined" ? window : null;
    const ric = win?.requestIdleCallback;
    if (ric) {
      const idleId = ric(() => scanHeadings(0), { timeout: 200 });
      return () => {
        cancelled = true;
        win?.cancelIdleCallback?.(idleId);
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (retryTimer) clearTimeout(retryTimer);
        observer?.disconnect();
        mountObserver?.disconnect();
      };
    }
    rafId = requestAnimationFrame(() => scanHeadings(0));

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (retryTimer) clearTimeout(retryTimer);
      observer?.disconnect();
      mountObserver?.disconnect();
      // 不清空 TOC：保留旧目录直到新页面 hook 重建，避免闪烁
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, itemId, contentKey, containerRef]);
}
