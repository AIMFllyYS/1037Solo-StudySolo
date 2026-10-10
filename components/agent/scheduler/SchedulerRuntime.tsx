"use client";

import { useEffect, useRef } from "react";
import { getMessageText } from "@/lib/chat/messageParts";
import { parseChatContent } from "@/lib/chat/rendering/parseChatContent";
import { useAgentChatContext } from "@/lib/hooks/chat/useAgentChatContext";
import { useChat } from "@/lib/hooks/chat/useChat";
import { ensureChatHistoryBootstrap, useChatHistory } from "@/lib/stores/chat/chatHistory";
import { useAcademicYear } from "@/lib/stores/academicYear";
import {
  MAX_CONCURRENT_RUNS,
  RUN_HEARTBEAT_MS,
  useScheduledTasks,
  type ScheduledRun,
} from "@/lib/stores/scheduledTasks";
import { useStore } from "@/lib/stores/ui";
import { collectArtifactIdsFromMessages, loadSessionMessages } from "@/lib/storage/chatStorage";
import type { ChatContext } from "@/lib/types/chat";

/**
 * Agent 定时任务的「前台常驻」调度运行时。
 *
 * 产品口径（拍板过）：不做服务端常驻调度 —— 只有用户停在这个应用页面里，
 * 任务才会跑；页面切到后台 tab 时暂停派发（浏览器会节流 interval，我们也不主动跑），
 * 但已发出的 run 不等 resume，由 stale 扫描兜底成 interrupted。
 * 页面关闭也一样：下次打开时把还没回来的 run 记为 interrupted，然后按 nextRun 续跑。
 *
 * 职责分两层：
 * - tick（本组件的 interval + visibilitychange）：扫 stale → 派发到期任务
 *   （claim：写 running 记录 + 重排 nextRun）→ 给 claim 到的 run 建会话。
 * - ScheduledRunDriver（每条 running 且已建会话的 run 一个）：sendMessage 一次，
 *   挂心跳，isLoading true→false 后收口 completeRun。
 */

export const SCHEDULER_TICK_MS = 15_000;

function agentChatContextNow(): ChatContext {
  // 与 useAgentChatContext 相同的语义，但在非 React 调用点（interval 回调）也能用。
  return {
    subjectId: useStore.getState().activeSubjectId,
    categoryId: "",
    itemId: "",
    currentTopic: "",
    academicYear: useAcademicYear.getState().year,
  };
}

/** tick 一次：扫 stale 标 interrupted，再在可见时派发到期任务并各自建会话。 */
function runSchedulerTick() {
  const chatHistory = useChatHistory.getState();
  // chatHistory 还没水合完不要派发：createSession 要写 manifest，半截状态下抢跑会丢数据。
  if (!chatHistory._hasHydrated) return;
  const claimed = useScheduledTasks.getState().tick({
    now: Date.now(),
    hidden: typeof document !== "undefined" ? document.hidden : false,
    maxConcurrent: MAX_CONCURRENT_RUNS,
  });
  for (const c of claimed) {
    const sessionId = chatHistory.createSession(agentChatContextNow(), "scheduled");
    chatHistory.updateSessionTitle(sessionId, c.taskName);
    useScheduledTasks.getState().attachSession(c.taskId, c.runId, sessionId);
  }
}

export default function SchedulerRuntime() {
  const hydrated = useScheduledTasks((s) => s._hasHydrated);
  const order = useScheduledTasks((s) => s.order);
  const byId = useScheduledTasks((s) => s.byId);

  // 挂载即引导会话存储（系统项目、manifest 等），然后开 tick。
  useEffect(() => {
    void ensureChatHistoryBootstrap();
    const timer = window.setInterval(runSchedulerTick, SCHEDULER_TICK_MS);
    const onVisibility = () => {
      // 回到前台立刻补拍：被节流漏掉的班次在这一次 tick 里以 delayed 补跑。
      if (!document.hidden) runSchedulerTick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    runSchedulerTick();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!hydrated) return null;

  const active = order.flatMap((taskId) => {
    const task = byId[taskId];
    if (!task) return [];
    return task.runHistory
      .filter((run) => run.status === "running" && run.sessionId)
      .map((run) => ({ task, run }));
  });

  return (
    <>
      {active.map(({ task, run }) => (
        <ScheduledRunDriver key={run.id} taskId={task.id} run={run} />
      ))}
    </>
  );
}

/**
 * 单条 running run 的执行器：把任务 prompt 通过 useChat 发到这条 run 的
 * 专属会话（kind=scheduled，不抢 activeSessionId），然后盯 isLoading 收口。
 * 挂在 effect 里的 sendMessage 用 queueMicrotask 推迟（FloatingChatBody 同款），
 * 这样 React StrictMode 的 setup→cleanup→setup 不会发两次。
 */
function ScheduledRunDriver({ taskId, run }: { taskId: string; run: ScheduledRun }) {
  const sessionId = run.sessionId as string;
  const chatContext = useAgentChatContext();
  const { error, isLoading, sendMessage } = useChat(chatContext, undefined, { sessionId });
  const sentRef = useRef(false);
  const sawLoadingRef = useRef(false);
  const doneRef = useRef(false);

  // 心跳：证明这条 run 还活着；页面一关心跳就停，下次打开被扫成 interrupted。
  useEffect(() => {
    const id = window.setInterval(() => {
      useScheduledTasks.getState().heartbeatRun(taskId, run.id, Date.now());
    }, RUN_HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [taskId, run.id]);

  useEffect(() => {
    if (sentRef.current) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || sentRef.current) return;
      sentRef.current = true;
      const ok = sendMessage(run.prompt);
      if (!ok) {
        doneRef.current = true;
        useScheduledTasks.getState().completeRun({
          taskId,
          runId: run.id,
          ok: false,
          sessionId,
          error: "sendMessage returned false",
          now: Date.now(),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sendMessage, run.prompt, run.id, sessionId, taskId]);

  useEffect(() => {
    if (isLoading) sawLoadingRef.current = true;
    if (doneRef.current || !sawLoadingRef.current || isLoading) return;
    doneRef.current = true;
    void (async () => {
      // 调度会话的完成摘要要覆盖整段回答：窗口化后 messagesById 只是尾部窗口。
      const messages = (await loadSessionMessages(sessionId)) ?? useChatHistory.getState().messagesById[sessionId] ?? [];
      const assistant = [...messages].reverse().find((m) => m.role === "assistant");
      const artifactIds = collectArtifactIdsFromMessages(messages);
      const raw = assistant ? getMessageText(assistant) : "";
      // 摘要走渲染链同一套清洗：去掉 <think> 与 <FollowUp> 提示块。
      const text = raw ? parseChatContent(raw, { streaming: false }).markdown : "";
      const ok = !error;
      useScheduledTasks.getState().completeRun({
        taskId,
        runId: run.id,
        ok,
        sessionId,
        summary: ok ? truncateSummary(text, artifactIds.length) : undefined,
        error: ok ? undefined : (error ?? "request failed"),
        artifactIds,
        now: Date.now(),
      });
    })();
  }, [isLoading, error, taskId, run.id, sessionId]);

  return null;
}

const SUMMARY_LEN = 180;

function truncateSummary(text: string, artifactCount: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat) return flat.length > SUMMARY_LEN ? `${flat.slice(0, SUMMARY_LEN)}…` : flat;
  // 没有正文摘要时退化为产物计数提示，历史里不至于一片空白。
  return artifactCount > 0 ? `artifacts ×${artifactCount}` : "";
}
