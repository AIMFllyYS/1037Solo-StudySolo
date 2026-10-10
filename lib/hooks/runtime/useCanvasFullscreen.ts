"use client";

import { useState, useCallback, useEffect } from "react";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";

/**
 * 画布「放大查看」全屏态。
 * 各画布体（RawSvgViewer / SvgCanvas / renderers/HtmlRenderer）共用，统一 Esc 退出。
 */
export function useCanvasFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);
  const toggle = useCallback(() => setFullscreen((v) => !v), []);
  const exit = useCallback(() => setFullscreen(false), []);

  useOverlayRegistration({
    id: "canvas-fullscreen",
    open: fullscreen,
    onClose: exit,
    priority: 85,
  });

  useEffect(() => {
    if (!fullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  return { fullscreen, toggle, exit };
}
