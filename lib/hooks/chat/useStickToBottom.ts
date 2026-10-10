import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** 距底多少 px 内算「回到底部」，仅用于恢复跟随，不用于退出跟随。 */
export const STICK_THRESHOLD_PX = 80;

const LEAVE_KEYS = new Set(['PageUp', 'ArrowUp', 'Home']);

export function distanceFromBottom(el: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

/** 贴底写入：内容增高或骤缩时都把 scrollTop 钉到当前可滚最大值。 */
export function pinScrollToBottom(el: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>): void {
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  if (Math.abs(el.scrollTop - max) > 0.5) {
    el.scrollTop = max;
  }
}

function isOnVerticalScrollbar(el: HTMLElement, clientX: number): boolean {
  return clientX >= el.getBoundingClientRect().left + el.clientWidth;
}

/**
 * 让一个可滚动容器在内容增长/收缩时「贴底跟随」。
 *
 * 退出跟随只认真实用户手势（上滑滚轮、下拉触摸、PageUp/ArrowUp/Home、拖动滚动条）。
 * 浏览器夹取或程序性写入造成的 scrollTop 下降不会退出跟随；位置只用于「滑回底部后恢复」。
 *
 * @param ref       目标滚动容器
 * @param active    是否处于「应跟随」阶段（通常 = 内容仍在流式生成）
 * @param threshold 距底多少 px 内恢复跟随（默认 STICK_THRESHOLD_PX）
 * @param deps      额外 effect 依赖；变化时重启 rAF 循环并立即贴底（如 composerInset）
 */
export function useStickToBottom(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  threshold = STICK_THRESHOLD_PX,
  deps: unknown[] = [],
) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const wantStickRef = useRef(true);
  const scrollbarDragRef = useRef(false);
  const hoveredRef = useRef(false);

  const setWantStick = useCallback((v: boolean) => {
    if (wantStickRef.current === v) return;
    wantStickRef.current = v;
    setIsAtBottom(v);
  }, []);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (distanceFromBottom(el) < threshold) {
      setWantStick(true);
      return;
    }
    if (scrollbarDragRef.current) {
      setWantStick(false);
    }
  }, [ref, threshold, setWantStick]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.addEventListener !== 'function') return;

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) setWantStick(false);
    };

    let lastTouchY = 0;
    const onTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? lastTouchY;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? lastTouchY;
      if (y - lastTouchY > 2) setWantStick(false);
      lastTouchY = y;
    };

    const onPointerEnter = () => {
      hoveredRef.current = true;
    };
    const onPointerLeave = () => {
      hoveredRef.current = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      scrollbarDragRef.current = isOnVerticalScrollbar(el, event.clientX);
    };
    const onPointerUp = () => {
      scrollbarDragRef.current = false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!LEAVE_KEYS.has(event.key)) return;
      const focused = document.activeElement;
      if (!hoveredRef.current && focused !== el && !el.contains(focused)) return;
      setWantStick(false);
    };

    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('pointerenter', onPointerEnter);
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('pointerenter', onPointerEnter);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, setWantStick]);

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const observedDom = typeof el.nodeType === 'number' && typeof MutationObserver !== 'undefined';
    const tick = () => {
      raf = 0;
      if (document.visibilityState !== 'hidden' && wantStickRef.current) pinScrollToBottom(el);
      // Fallback for non-DOM hosts. Browsers schedule only after observable changes.
      if (!observedDom) raf = requestAnimationFrame(tick);
    };
    const schedule = () => {
      if (!raf && wantStickRef.current && document.visibilityState !== 'hidden') raf = requestAnimationFrame(tick);
    };
    const resize = typeof ResizeObserver !== 'undefined' && observedDom ? new ResizeObserver(schedule) : null;
    const observeChildren = () => {
      resize?.disconnect();
      resize?.observe(el);
      for (const child of Array.from(el.children ?? [])) resize?.observe(child);
    };
    const mutation = observedDom ? new MutationObserver(() => { observeChildren(); schedule(); }) : null;
    // Ignore opacity/transform animation writes; ResizeObserver handles actual geometry changes.
    mutation?.observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
    observeChildren();
    document.addEventListener('visibilitychange', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(raf); resize?.disconnect(); mutation?.disconnect();
      document.removeEventListener('visibilitychange', schedule);
    };
    // deps 由调用方追加（如 safeBottomInset），展开后参与重启循环。
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 第四参是调用方声明的附加依赖
  }, [active, ref, isAtBottom, ...deps]);

  return { onScroll, isAtBottom, setWantStick, wantStickRef };
}
