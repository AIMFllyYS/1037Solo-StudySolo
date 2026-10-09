"use client";

import { CalendarClock, Loader2, MessageSquare } from "lucide-react";
import { useId } from "react";
import clsx from "clsx";
import FolderTreeRow from "@/components/layout/FolderTreeRow";
import PencilSparklesIcon from "@/components/icons/PencilSparklesIcon";
import NotebookFormulaIcon from "@/components/icons/NotebookFormulaIcon";
import { translate, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/stores/settings";
import { useSessionRuns, type SessionRunRecord } from "@/lib/stores/sessionRuns";
import type { SessionMeta } from "@/lib/storage/chatStorage";

/** 会话行的图标：划词助手 / 笔记记录 / 定时任务 / 普通对话各一种，不要互相借。 */
export function sessionIcon(session: SessionMeta) {
  if (session.kind === "floating") return <PencilSparklesIcon size={14} />;
  if (session.kind === "note") return <NotebookFormulaIcon size={14} />;
  if (session.kind === "scheduled") return <CalendarClock size={14} strokeWidth={1.75} />;
  return <MessageSquare size={14} strokeWidth={1.75} />;
}

/**
 * 父文件夹名称文字的左缘 = FolderTreeRow 的 paddingLeft 4 + 箭头位 16 + gap 4 + 图标位 18 + gap 4。
 * 文件夹下的对话文字对齐到这里；没有父文件夹的对话贴左（ROOT_TEXT_X）。
 */
const FOLDER_TEXT_X = 46;
const ROOT_TEXT_X = 18;

/** 悬停提示：优先给最近一条用户消息的预览，没有就报消息条数。 */
export function sessionPreview(session: SessionMeta): string {
  if (session.preview?.trim()) return session.preview;
  const count = session.messageCount ?? 0;
  // 非组件代码没有 hook 语境，只能读 store 的当前语言；调用点（会话行）订阅了语言，切换后会重算。
  const locale = useSettings.getState().locale;
  return count > 0
    ? translate(locale, "agent.session.messageCount", { count })
    : translate(locale, "agent.session.empty");
}

/**
 * 会话行运行状态只来自真实 sessionRuns：运行中/终态都保留短标签；未读终态加重，
 * markViewed 后保留淡显。数据源是本地 sessionRuns store，不上云。
 */
export function SessionRunBadge({ run, id }: { run: SessionRunRecord | undefined; id?: string }) {
  const t = useT();
  if (!run) return null;
  // 「已完成」看过之后直接消失，不留淡色版本（通行规范：已读即清除）。
  if (run.phase === "done" && !run.unseen) return null;
  const labelKey = run.phase === "running"
    ? "runningShort"
    : run.phase === "done"
      ? "doneShort"
      : run.phase === "error"
        ? "errorShort"
        : "interruptedShort";
  const accessibleKey = run.phase === "done" && run.unseen ? "doneUnread" : run.phase;
  const isActive = run.phase === "running";
  const isError = run.phase === "error" || run.phase === "interrupted";
  const emphasized = isActive || run.unseen;
  const testId = run.phase === "running"
    ? "session-run-running"
    : run.phase === "done"
      ? "session-run-done"
      : run.phase === "error"
        ? "session-run-error"
        : "session-run-interrupted";
  return (
    <span
      id={id}
      className={clsx(
        "inline-flex h-[18px] min-w-0 max-w-[5.5rem] shrink-0 items-center gap-1 rounded-full text-[10px] font-medium leading-none",
        // 有底色的胶囊才有「状态位」的分量；读过的终态只留淡淡的点 + 字，不再抢标题的注意力。
        emphasized ? "px-1.5 opacity-100" : "px-0.5 opacity-50",
        isError
          ? emphasized ? "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]" : "text-[var(--md-sys-color-error)]"
          : emphasized ? "bg-[var(--accent-weak)] text-[var(--accent-ink)]" : "text-[var(--ink-faint)]",
      )}
      title={t(`agent.session.run.${accessibleKey}`)}
      aria-label={t(`agent.session.run.${accessibleKey}`)}
      data-run-phase={run.phase}
      data-run-unseen={run.unseen ? "true" : "false"}
      data-testid={testId}
    >
      {isActive ? (
        <Loader2 size={11} className="shrink-0 animate-spin" aria-hidden />
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      )}
      <span className="agent-session-run-label truncate">{t(`agent.session.run.${labelKey}`)}</span>
    </span>
  );
}

/** 会话行：正常状态走 FolderTreeRow（与文件树同款），重命名时就地换成输入框。 */
export default function AgentSessionRow({
  session,
  depth = 1,
  inFolder = false,
  selected = false,
  renaming,
  onSelect,
  onContextMenu,
  onRenameSubmit,
  onRenameCancel,
}: {
  session: SessionMeta;
  depth?: number;
  /** 这一行在某个项目文件夹下：文字左缘对齐父文件夹「名称文字」的起点。 */
  inFolder?: boolean;
  selected?: boolean;
  renaming: boolean;
  onSelect: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onRenameSubmit: (title: string) => void;
  onRenameCancel: () => void;
}) {
  // hook 必须在 renaming 的提前 return 之前调用：两条渲染路径的 hook 顺序要一致。
  const t = useT();
  const runStatusId = useId();
  const title = session.title || t("agent.session.untitled");
  const run = useSessionRuns((state) => state.byId[session.id]);
  const keepIcon = session.kind === "note" || session.kind === "floating";
  if (renaming) {
    return (
      <input
        autoFocus
        defaultValue={title}
        aria-label={t("agent.session.rename")}
        data-testid="session-rename-input"
        className="my-0.5 h-[28px] w-full rounded-lg border border-[var(--accent)] bg-[var(--bg-muted)] px-2.5 text-[12.5px] text-[var(--ink)] outline-none"
        onPointerDown={(event) => event.stopPropagation()}
        onFocus={(event) => event.currentTarget.select()}
        onContextMenu={(event) => event.stopPropagation()}
        onBlur={(event) => onRenameSubmit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onRenameSubmit(event.currentTarget.value);
          if (event.key === "Escape") onRenameCancel();
        }}
      />
    );
  }
  return (
    <div className="group/session relative flex items-center" onContextMenu={onContextMenu}>
      <div className="min-w-0 flex-1">
        <FolderTreeRow
          depth={depth}
          // 笔记记录 / 划词摘录的会话保留各自的特殊图标；其余对话只显示文字。
          textOnlyIndent={keepIcon ? undefined : inFolder ? FOLDER_TEXT_X : ROOT_TEXT_X}
          title={title}
          isSelected={selected}
          icon={sessionIcon(session)}
          titleAttr={sessionPreview(session)}
          ariaLabel={title}
          ariaDescribedBy={run ? runStatusId : undefined}
          fadeTitle
          inset
          endAdornment={run ? <SessionRunBadge run={run} id={runStatusId} /> : undefined}
          onClick={onSelect}
        />
      </div>
    </div>
  );
}
