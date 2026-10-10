"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUiReducedMotion } from "@/lib/hooks/runtime/useUiReducedMotion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { safeHttpUrl } from "@/components/browser/safeUrl";
import { webSourceFavicon } from "@/lib/chat/sources/webSearchDisplay";
import { DURATION, EASE } from "@/lib/motion";
import { useT } from "@/lib/i18n/index";

/** 走马灯里的一条来源。index 是 1-based 展示序号（与正文 [n] 标注对齐）。 */
export interface WebSourceCarouselItem {
  key: string;
  index: number;
  title: string;
  url: string;
  host: string;
  icon?: string;
  snippet?: string;
}

/** 拖拽超过这个距离才算滚动（而不是点卡片）——与 ImageStrip 同一阈值。 */
const DRAG_THRESHOLD = 4;
/** 运行中追加的骨架卡数量。 */
const SKELETON_COUNT = 3;

/**
 * 来源 favicon：供应商 icon → Google s2 域名图 → 首字母占位。
 * 懒加载 + referrerPolicy=no-referrer，不向第三方站点泄漏当前页地址。
 */
function SourceFavicon({ icon, host, title }: { icon?: string; host: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const src = webSourceFavicon({ icon }, host);
  if (!src || failed) {
    const letter = (host || title || "?").trim().charAt(0).toUpperCase() || "?";
    return <span aria-hidden="true" className="web-source-favicon-fallback">{letter}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={14}
      height={14}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="web-source-favicon"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Perplexity 式来源走马灯：横向滚动的来源卡（favicon + 域名 + 标题），
 * 逐条交错入场模拟流式出现；点击卡片在条下展开摘要详情，可再进来源面板 / 原站。
 *
 * 性能约定：卡片进场只做 opacity + transform；`content-visibility: auto` 让
 * 滚出视口的卡跳过布局绘制；favicon 全部 lazy。几十条来源不卡。
 */
export default function WebSourceCarousel({
  items,
  onOpen,
  pending = false,
  compact = false,
  ariaLabel,
}: {
  items: readonly WebSourceCarouselItem[];
  /** 详情面板里「在来源面板查看」的回调（打开 SourceTraceViewer）。 */
  onOpen?: (item: WebSourceCarouselItem) => void;
  /** 搜索仍在进行：尾部追加骨架卡。 */
  pending?: boolean;
  /** 窄容器密度（右上参考列 / 思考链）。 */
  compact?: boolean;
  ariaLabel?: string;
}) {
  const t = useT();
  const reducedMotion = useUiReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; scrollLeft: number; pointerId: number; captured: boolean } | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [scrollable, setScrollable] = useState(false);

  const syncScrollState = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollable(max > 1);
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < max - 1);
  }, []);

  // 条目流式追加 / 容器改尺寸时都要重算可否滚动。
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    syncScrollState();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncScrollState);
    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length, syncScrollState]);

  // expandedKey 指向的来源消失时不渲染详情（activeItem 兜底为 null）——不单独清状态，
  // 这样同一来源（同 key）在流式刷新中闪现也不打断展开态。
  const nudge = useCallback(
    (direction: -1 | 1) => {
      const el = viewportRef.current;
      if (!el) return;
      el.scrollBy?.({
        left: direction * el.clientWidth * 0.7,
        behavior: reducedMotion ? "auto" : "smooth",
      });
    },
    [reducedMotion],
  );

  const toggle = useCallback(
    (item: WebSourceCarouselItem, cardEl: HTMLElement) => {
      setExpandedKey((current) => {
        const next = current === item.key ? null : item.key;
        if (next) {
          // 横向滚动容器里 scrollIntoView 的 inline:'nearest' 把卡带回可视区。
          cardEl.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
        }
        return next;
      });
    },
    [reducedMotion],
  );

  // 指针拖拽滚动（桌面手感同 ImageStrip）：阈值内不接管，超过后捕获指针拖 scrollLeft。
  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const el = viewportRef.current;
    if (!el || event.pointerType === "touch") return;
    dragRef.current = { startX: event.clientX, scrollLeft: el.scrollLeft, pointerId: event.pointerId, captured: false };
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    const el = viewportRef.current;
    if (!state || !el) return;
    const dx = event.clientX - state.startX;
    if (!state.captured && Math.abs(dx) >= DRAG_THRESHOLD) {
      try {
        el.setPointerCapture(state.pointerId);
      } catch {
        /* jsdom / 旧浏览器无捕获：点击照常，拖拽降级为原生滚动 */
      }
      state.captured = true;
      el.style.cursor = "grabbing";
    }
    if (state.captured) el.scrollLeft = state.scrollLeft - dx;
  }, []);

  const endDrag = useCallback(() => {
    const state = dragRef.current;
    const el = viewportRef.current;
    if (state?.captured && el) {
      try {
        el.releasePointerCapture(state.pointerId);
      } catch { /* noop */ }
      el.style.cursor = "";
    }
    dragRef.current = null;
  }, []);

  const activeItem = items.find((item) => item.key === expandedKey) ?? null;
  const activeUrl = safeHttpUrl(activeItem?.url);

  return (
    <div
      className={clsx("web-source-carousel", compact && "is-compact")}
      data-scrollable={scrollable || undefined}
      data-testid="web-source-carousel"
    >
      <div
        ref={viewportRef}
        className="web-source-viewport"
        role="list"
        aria-label={ariaLabel ?? t("trace.webSources.title")}
        onScroll={syncScrollState}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <ol className="web-source-strip">
          {items.map((item, order) => (
            <motion.li
              key={item.key}
              initial={reducedMotion ? false : { opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { duration: DURATION.normal, ease: EASE.decelerate, delay: Math.min(order * 0.045, 0.45) }
              }
            >
              <button
                type="button"
                className={clsx("web-source-card press", item.key === expandedKey && "is-open")}
                aria-expanded={item.key === expandedKey}
                title={item.host ? `${item.host}\n${item.title}` : item.title}
                onClick={(event) => toggle(item, event.currentTarget)}
              >
                <span className="web-source-card-top">
                  <SourceFavicon icon={item.icon} host={item.host} title={item.title} />
                  <span className="web-source-card-host">{item.host || t("agent.sources.noLink")}</span>
                  <span className="web-source-card-index" aria-hidden="true">{item.index}</span>
                </span>
                <span className="web-source-card-title">{item.title}</span>
              </button>
            </motion.li>
          ))}
          {pending
            ? Array.from(
                // 还没有任何来源时铺满骨架；已经有真卡了只留一张尾巴表示「还在搜」，
                // 免得「搜到一个显示一个」的增量节奏被三张骨架盖住。
                { length: items.length === 0 ? SKELETON_COUNT : 1 },
                (_, index) => (
                  <li key={`skeleton:${index}`} aria-hidden="true">
                    <span className="web-source-card is-skeleton">
                      <span className="web-source-card-top">
                        <span className="web-source-skel-ico" />
                        <span className="web-source-skel-line is-host" />
                      </span>
                      <span className="web-source-skel-line" />
                      <span className="web-source-skel-line is-short" />
                    </span>
                  </li>
                ),
              )
            : null}
        </ol>
        {scrollable && canScrollLeft ? (
          <button
            type="button"
            className="web-source-nudge is-left"
            aria-label={t("trace.webSources.scrollPrev")}
            onClick={() => nudge(-1)}
          >
            <ChevronLeft size={13} />
          </button>
        ) : null}
        {scrollable && canScrollRight ? (
          <button
            type="button"
            className="web-source-nudge is-right"
            aria-label={t("trace.webSources.scrollNext")}
            onClick={() => nudge(1)}
          >
            <ChevronRight size={13} />
          </button>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {activeItem ? (
          <motion.div
            key={activeItem.key}
            className="web-source-detail"
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : DURATION.normal, ease: EASE.decelerate }}
          >
            <div className="web-source-detail-inner">
              <p className="web-source-detail-head">
                <SourceFavicon icon={activeItem.icon} host={activeItem.host} title={activeItem.title} />
                {activeUrl ? (
                  <a href={activeUrl} target="_blank" rel="noopener noreferrer" className="web-source-detail-host">
                    {activeItem.host}
                  </a>
                ) : (
                  <span className="web-source-detail-host">{activeItem.host || t("agent.sources.noLink")}</span>
                )}
                <span className="web-source-detail-index" aria-hidden="true">#{activeItem.index}</span>
              </p>
              <p className="web-source-detail-title">{activeItem.title}</p>
              {activeItem.snippet ? <p className="web-source-detail-snippet">{activeItem.snippet}</p> : null}
              <p className="web-source-detail-actions">
                {activeUrl ? (
                  <a href={activeUrl} target="_blank" rel="noopener noreferrer" className="web-source-detail-action">
                    {t("window.source.openOriginal")}
                  </a>
                ) : null}
                {onOpen ? (
                  <button
                    type="button"
                    className="web-source-detail-action"
                    onClick={() => onOpen(activeItem)}
                  >
                    {t("agent.sources.openPanel")}
                  </button>
                ) : null}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
