"use client";

import { useCallback } from "react";
import type { FullscreenTarget } from "@/lib/constants/layout";
import { useDraggable } from "@/lib/hooks/layout/useDraggable";
import { useFullscreenTrack } from "@/lib/hooks/runtime/useFullscreenTrack";
import { useResizable } from "@/lib/hooks/layout/useResizable";
import { useWindowManager, type WindowSize } from "@/lib/stores/workspace/windowManager";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";
import { isAgentWorkspace } from "@/lib/stores/workspace/workspace";
import { toggleManagedWindowFullscreen } from "@/lib/window/toggleManagedFullscreen";
import type { ManagedWindowPresentation } from "@/lib/window/presentation";

export type { FullscreenTarget };

export interface UseManagedWindowChromeOptions {
  windowId: string;
  onClose: () => void;
  /** 默认 `notes`：与现网八个 viewer 的全屏对齐笔记区行为一致。 */
  fullscreenTarget?: FullscreenTarget;
  minSize?: { minW: number; minH: number };
  overlayPriority?: number;
  overlayId?: string;
  registerOverlay?: boolean;
  onResize?: (size: WindowSize) => void;
  presentation?: Exclude<ManagedWindowPresentation, "pending">;
  interactive?: boolean;
  /** 焦点在右栏之外的输入框时抑制前台 Esc，避免打字时关掉右侧文档。 */
  escapeSuppressed?: boolean;
}

/**
 * 浮窗壳的接线：拖拽 / 缩放 / 全屏跟踪 / Esc 栈 / 进出全屏几何。
 * `ManagedWindow` 消费本 hook；`FloatingChatWindow` 若几何模型冲突可只复用这里、自绘外壳。
 */
export function useManagedWindowChrome({
  windowId,
  onClose,
  fullscreenTarget = "notes",
  minSize = { minW: 420, minH: 320 },
  overlayPriority = 30,
  overlayId,
  registerOverlay = true,
  onResize,
  presentation = "floating",
  interactive = true,
  escapeSuppressed = false,
}: UseManagedWindowChromeOptions) {
  const managed = useWindowManager((s) => s.windows.find((w) => w.id === windowId));
  const { bringToFront, commitGeometry, minimizeWindow } = useWindowManager();
  const isDock = presentation === "dock";
  const isSheet = presentation === "sheet";

  const { elRef, onPointerDown } = useDraggable((dx, dy) => {
    if (isAgentWorkspace() || isDock) return;
    const current = useWindowManager.getState().windows.find((w) => w.id === windowId);
    if (!current) return;
    commitGeometry(windowId, {
      pos: {
        x: Math.max(0, Math.min(current.pos.x + dx, window.innerWidth - current.size.width)),
        y: Math.max(0, Math.min(current.pos.y + dy, window.innerHeight - current.size.height)),
      },
    });
  });

  const onResizeStart = useResizable(
    elRef,
    (width, height) => {
      commitGeometry(windowId, { size: { width, height } });
      onResize?.({ width, height });
    },
    minSize,
  );

  useFullscreenTrack(windowId, !isDock && !isSheet && (managed?.fullscreen ?? false), fullscreenTarget);

  useOverlayRegistration({
    id: overlayId ?? windowId,
    open: registerOverlay && !!managed && interactive && !escapeSuppressed,
    onClose,
    priority: overlayPriority,
  });

  const toggleFullscreen = useCallback(() => {
    // dock 的全屏入口在右栏标签条上（面板级全屏）；sheet 覆盖整页，也没有浮窗全屏。
    if (isDock || isSheet) return;
    toggleManagedWindowFullscreen(windowId, fullscreenTarget);
  }, [fullscreenTarget, isDock, isSheet, windowId]);

  return {
    managed,
    elRef,
    onPointerDown,
    onResizeStart,
    toggleFullscreen,
    bringToFront,
    minimizeWindow,
    commitGeometry,
  };
}
