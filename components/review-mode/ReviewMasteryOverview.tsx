"use client";

import { useMemo, useState } from "react";
import { Layers, Target, AlertTriangle, FileText } from "lucide-react";
import { useReviewCards } from "@/lib/stores/reviewCards";
import { useReviewSchedule } from "@/lib/review-mode/scheduleStore";
import { useUserNotes, selectLibraryNotes } from "@/lib/stores/userNotes";
import { getAllProgress } from "@/lib/quiz-progress";
import { useQuizProgressRevision } from "@/lib/hooks/useQuizProgressRevision";
import { summarizeWrongQuestions } from "@/lib/review-mode/wrongQuestions";
import { subjectLabel } from "@/lib/notes/userNote";
import { useT } from "@/lib/i18n";
import ActionButton from "@/components/ui/ActionButton";
import { useAuthSession } from "@/lib/hooks/useAuthSession";
import { getLegacyImportState, getOwnerLegacyImportedProgress, hasLegacyLocalProgress } from "@/lib/quiz-progress";
import { importLegacyLocalHistory } from "@/lib/review-mode/progressSync";

function StatCard({ icon: Icon, label, value }: { icon: typeof Layers; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-weak)] text-[var(--accent-ink)]">
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="min-w-0">
        <span className="block text-[20px] font-semibold leading-tight text-[var(--ink)]">{value}</span>
        <span className="block truncate text-[12px] text-[var(--ink-soft)]">{label}</span>
      </span>
    </div>
  );
}

/** 掌握度概览：待复习闪卡 / 近期正确率 / 薄弱点 / 笔记数。 */
export default function ReviewMasteryOverview() {
  const t = useT();
  const cardsById = useReviewCards((s) => s.byId);
  const cardOrder = useReviewCards((s) => s.order);
  const scheduleByCard = useReviewSchedule((s) => s.byCard);
  const notesById = useUserNotes((s) => s.byId);
  const notesOrder = useUserNotes((s) => s.order);
  const [now] = useState(() => Date.now());
  const progressRevision = useQuizProgressRevision();
  const { status: authStatus, userId } = useAuthSession();
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState(false);

  const dueCount = useMemo(() => {
    return cardOrder
      .map((id) => cardsById[id])
      .filter((c) => c && c.status === "ready")
      .filter((c) => {
        const s = scheduleByCard[c!.id];
        return !s || s.due <= now;
      }).length;
  }, [cardsById, cardOrder, scheduleByCard, now]);

  const overview = useMemo(() => {
    void progressRevision;
    return summarizeWrongQuestions(getAllProgress());
  }, [progressRevision]);
  const legacyHistory = useMemo(() => {
    void progressRevision;
    return getOwnerLegacyImportedProgress(userId);
  }, [progressRevision, userId]);
  const legacyAvailable = hasLegacyLocalProgress() && authStatus === "signedIn" && !!userId
    && getLegacyImportState(userId)?.status !== "complete";
  const notesCount = useMemo(
    () => selectLibraryNotes(notesById, notesOrder, null, { includeExample: false }).length,
    [notesById, notesOrder],
  );

  const hasData = dueCount > 0 || overview.chapters > 0 || notesCount > 0 || legacyHistory.length > 0;

  return (
    <div className="mx-auto max-w-3xl p-6" data-testid="review-overview">
      <h2 className="mb-4 text-[17px] font-semibold text-[var(--ink)]">{t("review.overview.title")}</h2>
      {!hasData ? (
        <p className="rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-[13px] leading-relaxed text-[var(--ink-faint)]">
          {t("review.overview.empty")}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard icon={Layers} label={t("review.overview.dueCards")} value={dueCount} />
            <StatCard
              icon={Target}
              label={t("review.overview.recentAccuracy")}
              value={overview.chapters > 0 ? `${overview.recentAccuracy}%` : t("review.overview.none")}
            />
            <StatCard icon={AlertTriangle} label={t("review.overview.weakPoints")} value={overview.weakChapters} />
            <StatCard icon={FileText} label={t("review.overview.notesCount")} value={notesCount} />
          </div>

          {overview.weakPoints.length > 0 && (
            <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
              <h3 className="mb-2 text-[13px] font-semibold text-[var(--ink)]">{t("review.overview.weakPoints")}</h3>
              <ul className="space-y-1.5">
                {overview.weakPoints.map((w) => (
                  <li
                    key={`${w.subjectId}/${w.chapterId}`}
                    className="flex items-center justify-between gap-2 text-[12.5px]"
                  >
                    <span className="min-w-0 truncate text-[var(--ink-soft)]">
                      {w.subjectId === "review" ? t("review.quiz.agentSource") : subjectLabel(w.subjectId)} · {w.chapterLabel}
                    </span>
                    <span className="shrink-0 font-medium" style={{ color: "var(--md-sys-color-error)" }}>
                      {w.lastPercent}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {(legacyAvailable || legacyHistory.length > 0 || importError) && (
        <section className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4" aria-live="polite">
          {legacyAvailable ? (
            <>
              <p className="text-[12.5px] leading-relaxed text-[var(--ink-soft)]">{t("review.overview.legacyLocal")}</p>
              <ActionButton
                variant="primary"
                disabled={importBusy}
                className="mt-3"
                onClick={() => {
                  if (!userId || importBusy) return;
                  setImportBusy(true);
                  setImportError(false);
                  void importLegacyLocalHistory(userId)
                    .catch(() => setImportError(true))
                    .finally(() => { setImportBusy(false); });
                }}
              >
                {importBusy ? t("review.overview.legacyImporting") : t("review.overview.legacyImport")}
              </ActionButton>
            </>
          ) : null}
          {legacyHistory.length > 0 ? (
            <p className="text-[12.5px] leading-relaxed text-[var(--ink-soft)]">{t("review.overview.legacyImported", { count: legacyHistory.length })}</p>
          ) : null}
          {importError ? <p className="mt-2 text-[12.5px] text-[var(--md-sys-color-error)]">{t("review.overview.legacyImportFailed")}</p> : null}
        </section>
      )}
    </div>
  );
}
