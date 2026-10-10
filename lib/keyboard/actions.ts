import { openBillingDashboard } from "@/lib/window/openBillingDashboard";
import { useStore } from "@/lib/store";
import { useFloatingChats } from "@/lib/stores/chat/floatingChats";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useBrowser } from "@/lib/stores/workspace/browser";
import { useGlobalSearch } from "./useGlobalSearch";
import { useShortcutHelp } from "./useShortcutHelp";
import { useOverlayStack } from "./useOverlayStack";
import { useReviewKeyboard } from "./useReviewKeyboard";
import {
  closeActiveWindow,
  toggleMinimizeActiveWindow,
  toggleFullscreenActiveWindow,
} from "./windowActions";
import type { ShortcutDef } from "./shortcuts";

export type NavigateFn = (href: string) => void;

function currentChatContext() {
  const state = useStore.getState();
  return {
    subjectId: state.activeSubjectId,
    categoryId: state.activeCategoryId,
    itemId: state.activeItemId,
    currentTopic: `${state.activeSubjectId} ${state.activeCategoryId} ${state.activeItemId}`,
  };
}

/** 执行 shortcut action；返回 true 表示已处理（应 preventDefault）。 */
export function dispatchShortcutAction(
  def: ShortcutDef,
  ctx: { navigate: NavigateFn; isReviewPage: boolean },
): boolean {
  switch (def.id) {
    case "global.search":
      useGlobalSearch.getState().setOpen(true);
      return true;

    case "global.aiFloating":
      useFloatingChats.getState().openBlankWindow();
      return true;

    case "global.toggleSidebar":
      useStore.getState().toggleSidebar();
      return true;

    case "global.billing":
      openBillingDashboard();
      return true;

    case "global.newChat": {
      const chatContext = currentChatContext();
      // 已有空白新对话就复用它，不再落第二条（连按快捷键不该刷出一堆空会话）
      useChatHistory.getState().startNewChat(chatContext);
      useStore.getState().setRightTab("ai");
      return true;
    }

    case "global.toggleTopBar":
      useStore.getState().toggleTopBar();
      return true;

    case "global.openReview": {
      const subjectId = useStore.getState().activeSubjectId;
      ctx.navigate(`/${subjectId}/review`);
      return true;
    }

    case "global.shortcutHelp":
      useShortcutHelp.getState().setOpen(true);
      return true;

    case "global.rightTab.ai":
      useStore.getState().setRightTab("ai");
      return true;

    case "global.rightTab.video":
      useStore.getState().setRightTab("video");
      return true;

    case "global.rightTab.interactive":
      useStore.getState().setRightTab("interactive");
      return true;

    case "global.rightTab.browser":
      useStore.getState().setRightTab("browser");
      useBrowser.getState().openBrowse();
      return true;

    case "window.close":
      return closeActiveWindow();

    case "window.minimize":
      return toggleMinimizeActiveWindow();

    case "window.fullscreen":
      return toggleFullscreenActiveWindow();

    case "overlay.escape":
      return useOverlayStack.getState().closeTop();

    case "review.prevCard":
      if (!ctx.isReviewPage) return false;
      useReviewKeyboard.getState().handlers?.onPrev();
      return !!useReviewKeyboard.getState().handlers;

    case "review.nextCard":
      if (!ctx.isReviewPage) return false;
      useReviewKeyboard.getState().handlers?.onNext();
      return !!useReviewKeyboard.getState().handlers;

    case "review.flipCard": {
      if (!ctx.isReviewPage) return false;
      const handlers = useReviewKeyboard.getState().handlers;
      if (!handlers?.canFlip) return false;
      handlers.onFlip();
      return true;
    }

    // chat.send / chat.newline 由 ChatInput 本地处理
    default:
      return false;
  }
}
