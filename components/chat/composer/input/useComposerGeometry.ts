import { useRef, useEffect } from 'react';

import { MAX_TEXTAREA_HEIGHT } from '@/lib/chat/composer/inputLimits';
export function useComposerGeometry(input: string, onComposerInsetChange?: (inset: number) => void, focusSignal?: number) {

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const lastInsetRef = useRef<number | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    let lastWidth = 0;
    const resize = () => {
      // 首帧分栏还没量出宽度时（clientWidth 退化），此时 scrollHeight 是假值：
      // 一旦写进去就没人再改，空输入框会永久停在 max-height（用户看到「空着也占好几行」）。
      if (el.clientWidth < 40) return;
      lastWidth = el.clientWidth;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    };
    resize();
    // 左右栏拖动/收起会改可用宽度，换行数随之变化：宽度变了就重新量一次高度。
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      resize();
    });
    observer?.observe(el);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [input]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer || !onComposerInsetChange) return;
    const reportInset = () => {
      const bottom = Number.parseFloat(window.getComputedStyle(composer).bottom) || 0;
      const next = Math.ceil(composer.getBoundingClientRect().height + bottom + 16);
      if (lastInsetRef.current !== null && Math.abs(next - lastInsetRef.current) < 2) return;
      lastInsetRef.current = next;
      onComposerInsetChange(next);
    };
    reportInset();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reportInset);
    observer?.observe(composer);
    window.addEventListener('resize', reportInset);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', reportInset);
      // 保留最后测量值；StrictMode effect 重放时不先清零，避免滚动区短暂失去避让空间。
    };
  }, [onComposerInsetChange]);

  // 外部要求聚焦（自增即触发一次）：只聚焦，不碰草稿。
  useEffect(() => {
    if (!focusSignal) return;
    textareaRef.current?.focus();
  }, [focusSignal]);
  return { textareaRef, composerRef };
}
