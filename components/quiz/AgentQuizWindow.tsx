"use client";

import { useCallback } from "react";
import ManagedWindow from "@/components/window/ManagedWindow";
import QuizRunner from "@/components/quiz/QuizRunner";
import { AgentQuizIcon } from "@/components/icons/AgentIcons";
import { useWindowManager, type AgentQuizData } from "@/lib/stores/windowManager";
import { QUIZ_DOCK_WINDOW_TYPE } from "@/lib/quiz-dock/open";

/**
 * 右栏出题窗挂载层：把 windowManager 里所有 `quiz-dock` 窗口逐个渲染成 ManagedWindow。
 * 挂在 AppShell 的全局窗层（DeferredWindowLayers），所以对话折叠 / 切页签都不会把作答进度卸掉。
 * 打开入口只有一个：`lib/quiz-dock/open.ts#openAgentQuiz`（一个 quizId 一个窗）。
 */
export default function AgentQuizWindowLayer() {
  const windows = useWindowManager((state) => state.windows);
  const ids = windows.filter((win) => win.type === QUIZ_DOCK_WINDOW_TYPE).map((win) => win.id);
  if (!ids.length) return null;
  return (
    <>
      {ids.map((id) => (
        <AgentQuizWindow key={id} windowId={id} />
      ))}
    </>
  );
}

function AgentQuizWindow({ windowId }: { windowId: string }) {
  const managed = useWindowManager((state) => state.windows.find((win) => win.id === windowId));
  const closeWindow = useWindowManager((state) => state.closeWindow);
  const handleClose = useCallback(() => closeWindow(windowId), [closeWindow, windowId]);

  const data = managed?.data as Partial<AgentQuizData> | undefined;
  const questions = Array.isArray(data?.questions) ? data.questions : [];

  // 窗口在但 data 缺失（旧数据 / 手工构造）：不渲染空壳。
  if (!managed || !data?.quizId) return null;

  return (
    <ManagedWindow
      windowId={windowId}
      title={managed.title || "出题"}
      icon={<AgentQuizIcon size={15} />}
      onClose={handleClose}
      minSize={{ minW: 420, minH: 360 }}
      testId="agent-quiz-window"
      bodyClassName="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    >
      <QuizRunner
        quizId={data.quizId}
        title={data.title || managed.title || "出题"}
        questions={questions}
        intent={data.intent}
        droppedCount={data.droppedCount}
      />
    </ManagedWindow>
  );
}
