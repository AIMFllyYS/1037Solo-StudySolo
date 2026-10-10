'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** 离开 header 区域后延迟收起，留足移向按钮/点击的时间（macOS 菜单栏约 400–600ms）。 */
const HIDE_DELAY_MS = 500;

function subscribeCoarsePointer(onChange: () => void) {
  const mq = window.matchMedia('(hover: none), (pointer: coarse)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getCoarsePointer() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

/** 触屏 / 粗指针设备：不自动隐藏 header，保持占位布局。 */
export function useCoarsePointer() {
  return useSyncExternalStore(subscribeCoarsePointer, getCoarsePointer, () => false);
}

/**
 * 桌面端对话开始后自动隐藏 ChatPanelHeader。
 *
 * 业界常见模式（VS Code 面板 / macOS 菜单栏）：
 * - 收起：仅顶部窄感应条可交互，其余区域穿透到正文
 * - 展开：整条 header 可点击，**无透明遮罩挡按钮**
 * - 弹窗打开（pinned）或按下 header 时保持展开
 */
export function useAutoHideChatHeader(hasUserSent: boolean, pinned: boolean) {
  const coarsePointer = useCoarsePointer();
  const autoHideEnabled = hasUserSent && !coarsePointer;
  const [revealed, setRevealed] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 与原先两个 effect 的稳态一致：自动隐藏关闭时清掉悬停/按住态（header 本就常显）；
  // 仅在自动隐藏开启且 pinned 时强制展开。两者同时成立时不可互斥地反复 setState。
  if (!autoHideEnabled) {
    if (revealed || engaged) {
      setRevealed(false);
      setEngaged(false);
    }
  } else if (pinned) {
    if (!revealed) setRevealed(true);
    if (engaged) setEngaged(false);
  }

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setEngaged(false);
      setRevealed(false);
    }, HIDE_DELAY_MS);
  }, [clearHideTimer]);

  /** 顶部感应条 / header 区域 pointer 进入 */
  const onRevealZoneEnter = useCallback(() => {
    clearHideTimer();
    setRevealed(true);
  }, [clearHideTimer]);

  /** header 容器 pointer 进入（展开态） */
  const onHeaderEnter = useCallback(() => {
    clearHideTimer();
    setRevealed(true);
  }, [clearHideTimer]);

  /** header 容器 pointer 离开 */
  const onHeaderLeave = useCallback(() => {
    if (pinned || engaged) return;
    scheduleHide();
  }, [pinned, engaged, scheduleHide]);

  /** 在 header 上按下指针（点击按钮前保持展开，防止 leave 误触收起） */
  const onHeaderPointerDown = useCallback(() => {
    clearHideTimer();
    setRevealed(true);
    setEngaged(true);
  }, [clearHideTimer]);

  const onHeaderPointerUp = useCallback(() => {
    setEngaged(false);
  }, []);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const headerVisible = !autoHideEnabled || pinned || revealed;

  return {
    autoHideEnabled,
    headerVisible,
    headerCollapsed: autoHideEnabled && !headerVisible,
    onRevealZoneEnter,
    onHeaderEnter,
    onHeaderLeave,
    onHeaderPointerDown,
    onHeaderPointerUp,
  };
}
