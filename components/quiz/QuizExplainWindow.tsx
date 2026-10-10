"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuizExplain, persistQuizExplainSize, QUIZ_EXPLAIN_MIN_H, QUIZ_EXPLAIN_MIN_W, type QuizExplainWin } from "@/lib/stores/learning/quizExplain";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useStore } from "@/lib/store";
import { useAcademicYear } from "@/lib/stores/academicYear";
import { useFloatingTokenTracker } from "@/lib/stores/chat/floatingTokenTracker";
import { AgentQuizIcon } from "@/components/icons/AgentIcons";
import QuizExplainBody from "@/components/quiz/QuizExplainBody";
import ManagedWindow from "@/components/window/ManagedWindow";
import { NOTES_PANEL_ID } from "@/lib/constants/layout";
import { useT } from "@/lib/i18n";

export default function QuizExplainWindow({ win }: { win: QuizExplainWin }) {
  const managed = useWindowManager((state) => state.windows.find((item) => item.id === win.id));
  const closeWindow = useQuizExplain((state) => state.closeWindow);
  const t = useT();
  const updateWindow = useQuizExplain((state) => state.updateWindow);
  const { commitGeometry, updateWindow: updateManagedWindow } = useWindowManager();
  const sessionTitle = useChatHistory(
    (state) => state.sessionsMeta.find((item) => item.id === win.sessionId)?.title,
  );

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

  useEffect(() => {
    if (sessionTitle && managed && managed.title !== sessionTitle) {
      updateManagedWindow(win.id, { title: sessionTitle });
    }
  }, [managed, sessionTitle, updateManagedWindow, win.id]);

  useEffect(() => {
    function onResize() {
      if (!managed || managed.fullscreen) return;
      commitGeometry(win.id, {
        pos: {
          x: Math.max(0, Math.min(managed.pos.x, window.innerWidth - managed.size.width)),
          y: Math.max(0, Math.min(managed.pos.y, window.innerHeight - managed.size.height)),
        },
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [commitGeometry, managed, win.id]);

  const fullscreenTarget = useCallback((): DOMRect | null => {
    const rect = document.getElementById(NOTES_PANEL_ID)?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) return rect;
    return new DOMRect(16, 48, Math.max(480, window.innerWidth - 32), window.innerHeight - 64);
  }, []);

  if (!managed) return null;

  function handleClose() {
    useFloatingTokenTracker.getState().resetSession(win.sessionId);
    closeWindow(win.id);
  }

  return (
    <ManagedWindow
      windowId={win.id}
      title={sessionTitle && sessionTitle !== t("agent.session.untitled") ? sessionTitle : t("window.quiz.explain.title")}
      icon={<AgentQuizIcon size={15} />}
      onClose={handleClose}
      fullscreenTarget={fullscreenTarget}
      minSize={{ minW: QUIZ_EXPLAIN_MIN_W, minH: QUIZ_EXPLAIN_MIN_H }}
      registerOverlay={false}
      onResize={(size) => persistQuizExplainSize(size)}
      unmountWhenMinimized
      testId="quiz-explain-window"
      bodyClassName="flex flex-col"
      frameStyle={{
        background: "var(--md-sys-color-surface-container-lowest)",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.15), 0 0 0 1px var(--md-sys-color-outline-variant)",
        animation: "scale-up 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      }}
    >
      <QuizExplainBody
        win={win}
        chatContext={chatContext}
        onModelChange={(modelId) => updateWindow(win.id, { modelId })}
      />
    </ManagedWindow>
  );
}
