"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, ChevronDown, History, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useIsClient } from "@/lib/hooks/runtime/useIsClient";
import { useMinimumSkeleton } from "@/lib/hooks/layout/useMinimumSkeleton";
import { useUiReducedMotion } from "@/lib/hooks/runtime/useUiReducedMotion";
import { useT } from "@/lib/i18n";
import { describeSchedule, formatRelative, formatDuration, formatAbsolute } from "@/lib/scheduler/describe";
import {
  MAX_CONCURRENT_RUNS,
  MAX_SCHEDULED_TASKS,
  runningRunOf,
  useScheduledTasks,
  type ScheduledRun,
  type ScheduledTask,
  type ScheduledTaskInput,
} from "@/lib/stores/scheduledTasks";
import { collapseVariants, LAYOUT_REFLOW, reflowItemProps } from "@/lib/motion";
import ScheduledTaskForm from "./ScheduledTaskForm";

/**
 * 定时任务页：任务列表（名称 / 调度 / 上次 / 下次 / 启停）+ 新建编辑表单 + 运行历史。
 *
 * 产品约束就写在页面头顶那条 banner 里：**只在本应用页面打开时运行**——
 * 不做服务端常驻调度，页面关了就真的不跑，后台 tab 暂停派发、回前台补跑一次（标 delayed）。
 */

/** 相对时间需要秒级刷新：30 秒一拍足够，避免每分钟抖一串 re-render。 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** 标签页是否在后台：驱动「派发暂停」的提示条。 */
function useHidden(): boolean {
  const [hidden, setHidden] = useState(() => (typeof document === "undefined" ? false : document.hidden));
  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return hidden;
}

export default function ScheduledTasksPage() {
  const t = useT();
  const mounted = useIsClient();
  const now = useNow();
  const hidden = useHidden();
  const reducedMotion = useUiReducedMotion();
  const hydrated = useScheduledTasks((s) => s._hasHydrated);
  const order = useScheduledTasks((s) => s.order);
  const byId = useScheduledTasks((s) => s.byId);
  const [editing, setEditing] = useState<null | "new" | string>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const tasks = useMemo(
    () => order.map((id) => byId[id]).filter((task): task is ScheduledTask => Boolean(task)),
    [order, byId],
  );

  const showSkeleton = useMinimumSkeleton({ ready: mounted && hydrated });
  const editingTask = typeof editing === "string" && editing !== "new" ? byId[editing] : undefined;

  return (
    <section
      data-testid="agent-scheduled-page"
      className="flex h-full min-h-0 flex-col bg-[var(--agent-content-bg,var(--md-sys-color-surface-container-low))]"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--line-soft)] px-4 py-2.5">
        <h1 className="text-[15px] font-semibold text-[var(--ink)]">{t("agent.scheduled.title")}</h1>
        <span className="text-[11.5px] text-[var(--ink-faint)]">
          {t("agent.scheduled.count", { count: tasks.length })}
        </span>
        <div className="ml-auto">
          <button
            type="button"
            data-testid="scheduled-new"
            onClick={() => setEditing("new")}
            disabled={tasks.length >= MAX_SCHEDULED_TASKS}
            className="press flex items-center gap-1.5 rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--md-sys-color-on-primary)] disabled:opacity-45"
          >
            <Plus size={14} />
            {t("agent.scheduled.new")}
          </button>
        </div>
      </header>

      {/* 「仅在页面打开时运行」是产品承诺，不是角落备注——放在列表上方常驻。 */}
      <div
        role="note"
        className="flex shrink-0 items-start gap-2 border-b border-[var(--line-soft)] bg-[var(--accent-weak)] px-4 py-2 text-[11.5px] leading-relaxed text-[var(--accent-ink)]"
        data-testid="scheduled-banner"
      >
        <AlarmClock size={14} className="mt-[2px] shrink-0" aria-hidden />
        <span>
          {t("agent.scheduled.banner")}
          {hidden ? <strong className="ml-1 font-semibold">{t("agent.scheduled.paused")}</strong> : null}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="scheduled-body">
        {showSkeleton ? (
          <div role="status" aria-label={t("agent.scheduled.title")} className="animate-fade-up flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-[var(--line-soft)] px-3 py-3">
                <div className="h-8 w-8 animate-shimmer rounded-lg bg-[var(--bg-muted)]" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="h-3.5 w-[40%] animate-shimmer rounded bg-[var(--bg-muted)]" />
                  <div className="h-3 w-[62%] animate-shimmer rounded bg-[var(--bg-muted)]" />
                </div>
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <AlarmClock size={28} className="text-[var(--ink-faint)]" aria-hidden />
            <p className="m-0 text-[13px] text-[var(--ink-soft)]">{t("agent.scheduled.empty")}</p>
            <p className="m-0 max-w-[360px] text-[12px] leading-relaxed text-[var(--ink-faint)]">
              {t("agent.scheduled.emptyHint")}
            </p>
          </div>
        ) : (
          <motion.div layout={!reducedMotion} transition={LAYOUT_REFLOW} className="flex flex-col gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {tasks.map((task) => (
                <motion.div key={task.id} data-testid={`scheduled-task-${task.id}`} {...reflowItemProps(reducedMotion)}>
                  <TaskRow
                    task={task}
                    now={now}
                    expanded={expanded === task.id}
                    onToggleExpand={() => setExpanded((cur) => (cur === task.id ? null : task.id))}
                    onEdit={() => setEditing(task.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {editing !== null && (editing === "new" || editingTask) ? (
        <ScheduledTaskForm
          title={editing === "new" ? t("agent.scheduled.new") : t("agent.scheduled.edit")}
          submitLabel={editing === "new" ? t("agent.scheduled.create") : t("agent.scheduled.save")}
          initial={
            editingTask
              ? { name: editingTask.name, prompt: editingTask.prompt, schedule: editingTask.schedule, enabled: editingTask.enabled }
              : undefined
          }
          onCancel={() => setEditing(null)}
          onSubmit={(input: ScheduledTaskInput) => {
            useScheduledTasks.getState().upsert(editing === "new" ? input : { ...input, id: editing });
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function TaskRow({
  task,
  now,
  expanded,
  onToggleExpand,
  onEdit,
}: {
  task: ScheduledTask;
  now: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
}) {
  const t = useT();
  const setEnabled = useScheduledTasks((s) => s.setEnabled);
  const runNow = useScheduledTasks((s) => s.runNow);
  const remove = useScheduledTasks((s) => s.remove);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [runBusyNote, setRunBusyNote] = useState(false);
  const running = runningRunOf(task);

  const onRunNow = () => {
    const claimed = runNow(task.id);
    setRunBusyNote(!claimed);
    if (!claimed) window.setTimeout(() => setRunBusyNote(false), 2500);
  };

  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-panel)]">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* 状态点：正在跑=呼吸点，其余静态。 */}
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${
            running
              ? "animate-pulse bg-[var(--md-sys-color-primary)]"
              : task.enabled
                ? "bg-[color-mix(in_srgb,var(--md-sys-color-primary)_45%,transparent)]"
                : "bg-[var(--ink-faint)]"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-medium text-[var(--ink)]">{task.name}</span>
            <span className="shrink-0 text-[11.5px] text-[var(--ink-faint)]">{describeSchedule(task.schedule, t)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[var(--ink-faint)]">
            <span className="truncate">
              {t("agent.scheduled.last")}: {task.lastRunAt ? formatRelative(task.lastRunAt, now, t) : t("agent.scheduled.never")}
            </span>
            <span className="shrink-0">
              {t("agent.scheduled.next")}:{" "}
              {task.enabled && task.nextRunAt
                ? formatRelative(task.nextRunAt, now, t)
                : t("agent.scheduled.disabled")}
            </span>
            {runBusyNote ? (
              <span className="shrink-0 text-[var(--md-sys-color-error)]">
                {t("agent.scheduled.runBusy", { max: MAX_CONCURRENT_RUNS })}
              </span>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={task.enabled}
          title={task.enabled ? t("agent.scheduled.disable") : t("agent.scheduled.enable")}
          aria-label={task.enabled ? t("agent.scheduled.disable") : t("agent.scheduled.enable")}
          onClick={() => setEnabled(task.id, !task.enabled)}
          className={`relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors ${
            task.enabled ? "bg-[var(--md-sys-color-primary)]" : "bg-[var(--line)]"
          }`}
          data-testid={`scheduled-toggle-${task.id}`}
        >
          <span
            aria-hidden
            className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${
              task.enabled ? "left-[16px]" : "left-[2px]"
            }`}
          />
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onRunNow}
            disabled={Boolean(running)}
            title={running ? t("agent.scheduled.running") : t("agent.scheduled.runNow")}
            aria-label={t("agent.scheduled.runNow")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--bg-muted)] disabled:opacity-40"
            data-testid={`scheduled-run-${task.id}`}
          >
            <Play size={14} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            title={t("agent.scheduled.edit")}
            aria-label={t("agent.scheduled.edit")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
            data-testid={`scheduled-edit-${task.id}`}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => (confirmDelete ? remove(task.id) : setConfirmDelete(true))}
            onBlur={() => setConfirmDelete(false)}
            title={confirmDelete ? t("agent.menu.confirmDelete") : t("agent.scheduled.deleteTask")}
            aria-label={confirmDelete ? t("agent.menu.confirmDelete") : t("agent.scheduled.deleteTask")}
            className={`flex h-7 w-7 items-center justify-center rounded-md ${
              confirmDelete
                ? "bg-[color-mix(in_srgb,var(--md-sys-color-error)_14%,transparent)] text-[var(--md-sys-color-error)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
            }`}
            data-testid={`scheduled-delete-${task.id}`}
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            title={t("agent.scheduled.history")}
            aria-label={t("agent.scheduled.history")}
            aria-expanded={expanded}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
            data-testid={`scheduled-expand-${task.id}`}
          >
            <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div key="history" variants={collapseVariants} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
            <RunHistory task={task} now={now} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const STATUS_TONE: Record<ScheduledRun["status"], string> = {
  running: "text-[var(--md-sys-color-primary)]",
  success: "text-[color-mix(in_srgb,var(--md-sys-color-primary)_80%,var(--ink))]",
  error: "text-[var(--md-sys-color-error)]",
  interrupted: "text-[var(--ink-faint)]",
};

function RunHistory({ task, now }: { task: ScheduledTask; now: number }) {
  const t = useT();
  const clearHistory = useScheduledTasks((s) => s.clearHistory);
  const runs = [...task.runHistory].reverse();

  return (
    <div className="border-t border-[var(--line-soft)] px-3 py-2" data-testid={`scheduled-history-${task.id}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ink-soft)]">
        <History size={12} aria-hidden />
        {t("agent.scheduled.history")}
        <button
          type="button"
          onClick={() => clearHistory(task.id)}
          className="ml-auto text-[11px] text-[var(--ink-faint)] hover:text-[var(--md-sys-color-error)]"
          data-testid={`scheduled-clear-${task.id}`}
        >
          {t("agent.scheduled.clearHistory")}
        </button>
      </div>
      {runs.length === 0 ? (
        <p className="m-0 py-1.5 text-[11.5px] text-[var(--ink-faint)]">{t("agent.scheduled.noHistory")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RunRow({ run, now }: { run: ScheduledRun; now: number }) {
  const t = useT();
  return (
    <li className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-muted)] px-2.5 py-1.5 text-[11.5px]">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
        <span className={`font-medium ${STATUS_TONE[run.status]}`} data-testid={`run-status-${run.id}`}>
          {t(`agent.scheduled.status.${run.status}`)}
        </span>
        {run.delayed ? (
          <span className="rounded-full border border-[var(--line-soft)] px-1.5 text-[10px] text-[var(--ink-faint)]">
            {t("agent.scheduled.delayed")}
          </span>
        ) : null}
        <span className="text-[var(--ink-soft)]" title={formatAbsolute(run.startedAt)}>
          {formatRelative(run.startedAt, now, t)}
        </span>
        {run.finishedAt !== undefined ? (
          <span className="text-[var(--ink-faint)]">
            {t("agent.scheduled.duration", { duration: formatDuration(run.finishedAt - run.startedAt, t) })}
          </span>
        ) : null}
        {run.artifactIds.length > 0 ? (
          <span className="text-[var(--ink-faint)]">{t("agent.scheduled.artifacts", { count: run.artifactIds.length })}</span>
        ) : null}
        {run.sessionId ? (
          <Link
            href={`/c/${run.sessionId}`}
            className="ml-auto text-[11.5px] text-[var(--md-sys-color-primary)] hover:underline"
            data-testid={`run-link-${run.id}`}
          >
            {t("agent.scheduled.viewConversation")}
          </Link>
        ) : null}
      </div>
      {run.summary ? (
        <p className="m-0 mt-1 truncate text-[11px] leading-relaxed text-[var(--ink-soft)]" title={run.summary}>
          {run.summary}
        </p>
      ) : null}
      {run.error ? (
        <p className="m-0 mt-1 truncate text-[11px] leading-relaxed text-[var(--md-sys-color-error)]" title={run.error}>
          {t("agent.scheduled.errorLabel")}: {run.error}
        </p>
      ) : null}
    </li>
  );
}
