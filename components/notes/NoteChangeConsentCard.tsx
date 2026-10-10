"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAgentApproval } from "@/lib/stores/agentApprovalMode";
import { AlertTriangle, Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";
import type { UpdateUserNoteOutput } from "@/lib/ai/agent/tools/updateUserNote/types";
import { isUsableOutput, proposalFromToolOutput, type NoteChangeStatus } from "@/lib/notes/noteChangeProposal";
import { sessionIdOfMessage, useNoteChangeProposals } from "@/lib/stores/assets/noteChangeProposals";
import { useUserNotes } from "@/lib/stores/learning/userNotes";
import { useT, type Translate } from "@/lib/i18n";

/**
 * 笔记变更确认卡。
 *
 * Agent 改了笔记不会直接落盘：这张卡是唯一的写入入口，用户点「同意修改 / 确认删除」才执行。
 * 卡本身不持有权限语义——每次同意只对应这一份候选稿，没有「以后都同意」。
 */
export default function NoteChangeConsentCard({ part, message }: ResultCardProps<"updateUserNote">) {
  if (part.state !== "output-available") return null;
  const output = part.output as UpdateUserNoteOutput;
  if (!isUsableOutput(output)) return null;
  return <ConsentCardBody output={output} messageId={message.id} />;
}

function statusSelector(id: string, s: ReturnType<typeof useNoteChangeProposals.getState>): NoteChangeStatus {
  const entry = s.byId[id] as { status?: NoteChangeStatus } | undefined;
  if (entry?.status) return entry.status;
  if (s.appliedIds.includes(id)) return "applied";
  if (s.dismissedIds.includes(id)) return "dismissed";
  return "pending";
}

function ConsentCardBody({ output, messageId }: { output: UpdateUserNoteOutput; messageId: string }) {
  const id = output.proposalId;
  const ingest = useNoteChangeProposals((s) => s.ingest);
  const approve = useNoteChangeProposals((s) => s.approve);
  const dismiss = useNoteChangeProposals((s) => s.dismiss);
  const status = useNoteChangeProposals((s) => statusSelector(id, s));
  const noteTitle = useUserNotes((s) => s.byId[output.noteId]?.title);
  const noteMarkdown = useUserNotes((s) => s.byId[output.noteId]?.markdown);
  const [expanded, setExpanded] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const t = useT();

  useEffect(() => {
    const proposal = proposalFromToolOutput(output, {
      sessionId: sessionIdOfMessage(messageId),
      ...(noteTitle ? { noteTitle } : {}),
    });
    if (proposal) ingest(proposal);
  }, [id, ingest, messageId, noteTitle, output]);

  const diff = useMemo(
    () => (output.action === "update" ? diffSlices(noteMarkdown ?? "", output.markdown) : null),
    [output.action, output.markdown, noteMarkdown],
  );

  const isDelete = output.action === "delete";
  const blocked = !output.sourceComplete;

  // 完全同意模式：非删除类的修改候选稿自动应用（删除仍需手动确认）。每份候选稿只尝试一次。
  const autoApprove = useAgentApproval((s) => s.mode === "auto");
  const autoTriedRef = useRef(false);
  useEffect(() => {
    if (!autoApprove || isDelete || blocked || status !== "pending" || autoTriedRef.current) return;
    autoTriedRef.current = true;
    // approve 的失败提示走 setState，排进微任务避免 effect 体内同步 setState 触发级联渲染。
    queueMicrotask(() => {
      const result = approve(id);
      if (!result.ok) setFailure(result.reason ?? t("window.note.consent.writeFailed"));
    });
  }, [autoApprove, isDelete, blocked, status, approve, id, t]);

  const onApprove = () => {
    const result = approve(id);
    setFailure(result.ok ? null : (result.reason ?? t("window.note.consent.writeFailed")));
  };
  const onDismiss = () => {
    setFailure(null);
    dismiss(id);
  };

  return (
    <section className="note-consent" data-note-consent={id} aria-label={t("window.note.consent.aria")}>
      <header className="note-consent-head">
        <span className="note-consent-icon" aria-hidden>
          {isDelete ? <Trash2 size={13} /> : <Pencil size={13} />}
        </span>
        <div className="note-consent-title">
          <span className="note-consent-eyebrow">{statusLabel(status, t)}</span>
          <span className="note-consent-summary">{output.summary}</span>
        </div>
      </header>

      {status === "pending" ? (
        <>
          {blocked ? (
            <p className="note-consent-warn">
              <AlertTriangle size={12} aria-hidden /> {t("window.note.consent.sourceIncomplete")}
            </p>
          ) : null}

          {diff ? (
            <>
              <button
                type="button"
                className="note-consent-toggle"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
              >
                <ChevronDown size={12} className={expanded ? "is-open" : undefined} aria-hidden />
                {expanded ? t("window.note.consent.collapseDiff") : t("window.note.consent.expandDiff")}
                <span className="note-consent-count">
                  {t("window.note.consent.diffCount", { added: diff.afterAdded.length, removed: diff.beforeRemoved.length })}
                </span>
              </button>
              {expanded ? (
                <div className="note-consent-diff" data-no-drag>
                  {diff.head > 0 ? <p className="note-consent-diff-note">{t("window.note.consent.headUnchanged", { count: diff.head })}</p> : null}
                  {diff.beforeRemoved.map((line, index) => (
                    <p key={`b${index}`} className="note-consent-line is-removed">
                      <span aria-hidden>−</span>
                      {line || " "}
                    </p>
                  ))}
                  {diff.afterAdded.map((line, index) => (
                    <p key={`a${index}`} className="note-consent-line is-added">
                      <span aria-hidden>+</span>
                      {line || " "}
                    </p>
                  ))}
                  {diff.tail > 0 ? <p className="note-consent-diff-note">{t("window.note.consent.tailUnchanged", { count: diff.tail })}</p> : null}
                </div>
              ) : null}
            </>
          ) : null}

          {failure ? <p className="note-consent-error">{failure}</p> : null}

          <div className="note-consent-actions">
            <button
              type="button"
              className="note-consent-btn is-primary"
              disabled={blocked}
              onClick={onApprove}
            >
              <Check size={13} aria-hidden />
              {isDelete ? t("window.note.consent.confirmDelete") : t("window.note.consent.confirmEdit")}
            </button>
            <button type="button" className="note-consent-btn" onClick={onDismiss}>
              <X size={13} aria-hidden />
              {t("common.cancel")}
            </button>
          </div>
        </>
      ) : (
        <p className="note-consent-result">
          {status === "applied"
            ? isDelete
              ? t("window.note.consent.appliedDelete")
              : t("window.note.consent.appliedEdit")
            : status === "dismissed"
              ? t("window.note.consent.dismissed")
              : t("window.note.consent.blocked")}
        </p>
      )}

      {status !== "pending" && failure ? <p className="note-consent-error">{failure}</p> : null}
      {status === "stale" || status === "blocked" ? (
        <p className="note-consent-warn">
          <AlertTriangle size={12} aria-hidden /> {t("window.note.consent.retryHint")}
        </p>
      ) : null}
    </section>
  );
}

/** 小标签只表达「进行到哪一步」；改的是哪一篇由 summary 说，避免两句同义话叠在一起。 */
function statusLabel(status: NoteChangeStatus, t: Translate): string {
  if (status === "applied") return t("window.note.consent.statusApplied");
  if (status === "dismissed") return t("window.note.consent.statusDismissed");
  if (status === "stale" || status === "blocked") return t("window.note.consent.statusNotApplied");
  return t("window.note.consent.statusPending");
}

/** 逐行前后对照：掐掉公共前后缀，中间就是改动区间。 */
function diffSlices(before: string, after: string) {
  const b = before.split("\n");
  const a = after.split("\n");
  let head = 0;
  while (head < b.length && head < a.length && b[head] === a[head]) head += 1;
  let endB = b.length;
  let endA = a.length;
  while (endB > head && endA > head && b[endB - 1] === a[endA - 1]) {
    endB -= 1;
    endA -= 1;
  }
  return {
    head,
    tail: b.length - endB,
    beforeRemoved: b.slice(head, endB),
    afterAdded: a.slice(head, endA),
  };
}
