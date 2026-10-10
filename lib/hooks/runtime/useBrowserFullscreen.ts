"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 真正的网页全屏（Fullscreen API，等同 F11）。
 *
 * 与 Agent 右栏那个「全屏」（面板接管工作区）是两回事：
 * 这个是把整个 document 交给浏览器全屏，顶栏与 Agent 对话面板顶部的按钮共用这一份实现。
 */
export function useBrowserFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    onChange();
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* 用户拒绝或浏览器不支持时静默忽略 */
    }
  }, []);

  return { isFullscreen, toggleFullscreen };
}
