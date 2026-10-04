"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import {
  useFloatingChats,
  persistFloatingSize,
  FLOATING_MIN_W,
  FLOATING_MIN_H,
  type FloatingWin,
} from "@/lib/hooks/useFloatingChats";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { useChatHistory } from "@/lib/hooks/useChatHistory";
import { useStore } from "@/lib/store";
import { useAcademicYear } from "@/lib/hooks/useAcademicYear";
import { useFloatingTokenTracker } from "@/lib/hooks/useFloatingTokenTracker";
import { useAuthSession } from "@/lib/hooks/useAuthSession";
import PencilSparklesIcon from "@/components/icons/PencilSparklesIcon";
import FloatingChatBody from "@/components/chat/FloatingChatBody";
import ManagedWindow from "@/components/window/ManagedWindow";
import { NOTES_PANEL_ID } from "@/lib/constants/layout";
import { useIsAgentSurface } from "@/lib/window/useManagedWindowSurface";
import { translate } from "@/lib/i18n";
import { useSettings } from "@/lib/stores/settings";
import { getOwnerEpoch, getStorageOwner } from "@/lib/storage/ownerScope";

export default function FloatingChatWindow({ win }: { win: FloatingWin }) {
  const managed = useWindowManager((state) => state.windows.find((item) => item.id === win.id));
  const closeFloatingWindow = useFloatingChats((state) => state.closeWindow);
  const updateFloatingWindow = useFloatingChats((state) => state.updateWindow);
  const { commitGeometry, updateWindow: updateManagedWindow } = useWindowManager();
  const sessionTitle = useChatHistory(
    (state) => state.sessionsMeta.find((item) => item.id === win.sessionId)?.title,
  );
  const auth = useAuthSession();
  const currentOwner = getStorageOwner();
  const ownerScopeMatches = win.ownerId === currentOwner && win.ownerEpoch === getOwnerEpoch();
  const authOwnerMatches = auth.status === "signedIn"
    ? auth.userId === currentOwner
    : auth.status === "signedOut" && currentOwner === null;
  const ownerMatches = ownerScopeMatches && authOwnerMatches;
  const isAgentSurface = useIsAgentSurface();
  const locale = useSettings((state) => state.locale);

  const activeSubjectId = useStore((state) => state.activeSubjectId);
  const activeCategoryId = useStore((state) => state.activeCategoryId);
  const activeItemId = useStore((state) => state.activeItemId);
  const academicYear = useAcademicYear((state) => state.year);
  const chatContext = useMemo(
    () => ({
      subjectId: activeSubjectId,
      categoryId: activeCategoryId,
      itemId: activeItemId,
      currentTopic: `${activeSubjectId} ${activeCategoryId} ${activeItemId}`,
      academicYear,
    }),
    [activeSubjectId, activeCategoryId, activeItemId, academicYear],
  );

  const baseTitle = !ownerMatches
    ? translate(locale, "menu.chatInput.access.ownerChangedTitle")
    : sessionTitle && sessionTitle !== "新对话"
      ? sessionTitle
      : win.seedMode === "explain"
        ? "AI 解释"
        : win.seedMode === "example"
          ? "AI 举例"
          : "AI 追问";
  // Agent 右栏是标签式的：主对话的产物与划词助手并排挂在同一条标签栏上，
  // 只写会话标题分不出哪个是划词出来的。前缀加在**窗口标题**上而不是会话标题上——
  // 会话标题会被 /api/chat-title 自动改写，贴在那里等于白贴。
  const titleLabel = isAgentSurface
    ? translate(locale, "agent.selection.title", { snippet: baseTitle })
    : baseTitle;

  useLayoutEffect(() => {
    // 标签条读的是窗口标题：这里必须写 titleLabel，写回 sessionTitle 会把「划词 ·」前缀冲掉。
    if (managed && managed.title !== titleLabel) {
      updateManagedWindow(win.id, { title: titleLabel });
    }
  }, [managed, titleLabel, updateManagedWindow, win.id]);

  useEffect(() => {
    function onResize() {
      if (!managed) return;
      if (!managed.fullscreen) {
        commitGeometry(win.id, {
          pos: {
            x: Math.max(0, Math.min(managed.pos.x, window.innerWidth - managed.size.width)),
            y: Math.max(0, Math.min(managed.pos.y, window.innerHeight - managed.size.height)),
          },
        });
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [commitGeometry, managed, win.id]);

  const fullscreenTarget = useCallback((): DOMRect | null => {
    const rect = document.getElementById(NOTES_PANEL_ID)?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) return rect;
    return new DOMRect(0, 48, Math.floor(window.innerWidth / 2), window.innerHeight - 48);
  }, []);

  if (!managed) return null;

  function handleClose() {
    if (ownerScopeMatches) useFloatingTokenTracker.getState().resetSession(win.sessionId);
    closeFloatingWindow(win.id);
  }

  return (
    <ManagedWindow
      windowId={win.id}
      title={titleLabel}
      icon={<PencilSparklesIcon size={15} />}
      onClose={handleClose}
      fullscreenTarget={fullscreenTarget}
      minSize={{ minW: FLOATING_MIN_W, minH: FLOATING_MIN_H }}
      registerOverlay={false}
      onResize={(size) => persistFloatingSize(size)}
      unmountWhenMinimized
      bodyClassName="flex flex-col"
      frameStyle={{
        background: "var(--md-sys-color-surface-container-lowest)",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.15), 0 0 0 1px var(--md-sys-color-outline-variant)",
        animation: "scale-up 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      }}
    >
      <FloatingChatBody
        win={win}
        chatContext={chatContext}
        onModelChange={(modelId) => updateFloatingWindow(win.id, { modelId })}
      />
    </ManagedWindow>
  );
}
