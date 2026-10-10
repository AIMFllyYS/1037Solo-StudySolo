"use client";

import { Sparkles } from "lucide-react";
import ManagedWindow from "@/components/window/ManagedWindow";
import { AgentTrace } from "@/components/chat/trace/AgentTrace";
import { useMemoryInbox, type MemoryProposal } from "@/lib/stores/memoryInbox";
import { useUserNotes } from "@/lib/stores/userNotes";
import { useFlashcardCitations } from "@/lib/stores/flashcardCitations";
import { memoryProposalWindowId } from "@/lib/notes/userNote";
import { buildTrace } from "@/lib/chat/buildTrace";
import type { RecordMode } from "@/lib/review/types";
import { useT } from "@/lib/i18n";

const MODES: { id: RecordMode; labelKey: string }[] = [
  { id: "excerpt", labelKey: "window.memory.modeExcerpt" },
  { id: "cloze", labelKey: "window.memory.modeCloze" },
  { id: "quiz", labelKey: "window.memory.modeQuiz" },
  { id: "custom", labelKey: "window.memory.modeCustom" },
];

export default function MemoryProposalCloud({ proposal }: { proposal: MemoryProposal }) {
  const confirm = useMemoryInbox((s) => s.confirm);
  const dismiss = useMemoryInbox((s) => s.dismiss);
  const setDraft = useMemoryInbox((s) => s.setDraft);
  const t = useT();

  const question = proposal.kind === "note" ? t("window.memory.askNote") : t("window.memory.askFlashcard");
  const streaming = proposal.status === "committing";
  const trace = streaming || proposal.commitMessage
    ? buildTrace(proposal.commitMessage ?? { parts: [] }, streaming)
    : null;
  const committingLabel = proposal.kind === "note" ? t("window.memory.committingNote") : t("window.memory.committingFlashcard");

  return (
    <ManagedWindow
      windowId={memoryProposalWindowId(proposal.id)}
      title={proposal.kind === "note" ? t("window.memory.titleNote") : t("window.memory.titleFlashcard")}
      icon={<Sparkles size={15} />}
      onClose={() => dismiss(proposal.id)}
      fullscreenTarget="notes"
      minSize={{ minW: 300, minH: 180 }}
      overlayId={`memory-proposal-${proposal.id}`}
      bodyClassName="flex min-h-0 min-w-0 flex-1 overflow-hidden"
    >
      <div className="memory-cloud" data-no-drag>
        {proposal.status === "proposed" ? (
          <>
            <p className="memory-cloud-question">{question}</p>
            <p className="memory-cloud-reason">{proposal.reason}</p>
          </>
        ) : null}

        {proposal.status === "proposed" && proposal.kind === "note" ? (
          <label className="memory-cloud-field">
            <span>{t("window.memory.fieldTitle")}</span>
            <input
              value={proposal.titleDraft}
              placeholder={t("window.memory.titlePlaceholder")}
              aria-label={t("window.memory.titleAria")}
              onChange={(event) => setDraft(proposal.id, { titleDraft: event.target.value })}
            />
          </label>
        ) : null}

        {proposal.status === "proposed" && proposal.kind === "flashcard" ? (
          <div className="user-note-modes" role="group" aria-label={t("window.memory.modeGroupAria")}>
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`user-note-mode${proposal.modeDraft === item.id ? " is-active" : ""}`}
                aria-pressed={proposal.modeDraft === item.id}
                onClick={() => setDraft(proposal.id, { modeDraft: item.id })}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
        ) : null}

        {proposal.status === "committing" && trace ? (
          <div className="memory-cloud-trace">
            <AgentTrace trace={trace} isStreaming summaryMode="process" />
          </div>
        ) : null}

        {proposal.status === "done" ? (
          <p className="memory-cloud-reason">
            {proposal.kind === "note" ? t("window.memory.doneNote") : t("window.memory.doneFlashcard")}
          </p>
        ) : null}

        {proposal.error ? <p className="memory-cloud-error">{proposal.error}</p> : null}

        <div className="memory-cloud-actions">
          {proposal.status === "proposed" ? (
            <>
              <button type="button" className="user-note-toolbar-link" onClick={() => dismiss(proposal.id)}>
                {t("window.memory.dismiss")}
              </button>
              <button type="button" className="user-note-toolbar-primary" onClick={() => confirm(proposal.id)}>
                {t("window.memory.organize")}
              </button>
            </>
          ) : null}
          {proposal.status === "committing" ? (
            <span className="memory-cloud-reason">{committingLabel}</span>
          ) : null}
          {proposal.status === "done" && proposal.kind === "note" && proposal.createdNoteId ? (
            <button
              type="button"
              className="user-note-toolbar-primary"
              onClick={() => useUserNotes.getState().openEditor(proposal.createdNoteId!)}
            >
              {t("window.memory.openNote")}
            </button>
          ) : null}
          {proposal.status === "done" && proposal.kind === "flashcard" ? (
            <button
              type="button"
              className="user-note-toolbar-primary"
              onClick={() => useFlashcardCitations.getState().openPicker()}
            >
              {t("window.memory.viewFlashcards")}
            </button>
          ) : null}
        </div>
      </div>
    </ManagedWindow>
  );
}
