"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Layers, NotebookPen, Target } from "lucide-react";
import { useReviewCards } from "@/lib/stores/reviewCards";
import { useReviewSchedule } from "@/lib/review-mode/scheduleStore";
import { useUserNotes, selectLibraryNotes } from "@/lib/stores/userNotes";
import { getAllProgress } from "@/lib/quiz-progress";
import { useQuizProgressRevision } from "@/lib/hooks/useQuizProgressRevision";
import { summarizeWrongQuestions } from "@/lib/review-mode/wrongQuestions";
import { MASTERY_TIERS, pickNextAction, summarizeMastery, type MasteryTier } from "@/lib/review-mode/masteryModel";
import { subjectLabel } from "@/lib/notes/userNote";
import { useT } from "@/lib/i18n";
import ActionButton from "@/components/ui/ActionButton";
import { useAuthSession } from "@/lib/hooks/useAuthSession";
import { getLegacyImportState, getOwnerLegacyImportedProgress, hasLegacyLocalProgress } from "@/lib/quiz-progress";
import { importLegacyLocalHistory } from "@/lib/review-mode/progressSync";

/** 层级配色：全部取主题变量，深浅色/各主题下自动适配。 */
const TIER_COLOR: Record<MasteryTier, string> = {
  mastered: "var(--color-success, var(--md-sys-color-tertiary))",
  familiar: "var(--accent)",
  learning: "var(--md-sys-color-tertiary, var(--ink-soft))",
  weak: "var(--md-sys-color-error)",
};

/** 整体掌握度圆环（SVG，描边动画只用 stroke-dashoffset）。 */
function MasteryRing({ percent, tier, label }: { percent: number | null; tier: MasteryTier | null; label: string }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const filled = percent === null ? 0 : Math.max(0, Math.min(100, percent)) / 100;
  return (
    <div className="relative h-[116px] w-[116px] shrink-0" role="img" aria-label={`${label} ${percent === null ? "-" : `${Math.round(percent)}%`}`}>
      <svg viewBox="0 0 116 116" className="h-full w-full -rotate-90">
        <circle cx="58" cy="58" r={radius} fill="none" stroke="var(--bg-muted)" strokeWidth="10" />
        <circle
          cx="58"
          cy="58"
          r={radius}
          fill="none"
          stroke={tier ? TIER_COLOR[tier] : "var(--line)"}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled)}
          style={{ transition: "stroke-dashoffset 600ms var(--ease-out, ease-out)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-semibold leading-none tabular-nums text-[var(--ink)]">
          {percent === null ? "—" : Math.round(percent)}
          {percent === null ? null : <small className="ml-0.5 text-[12px] font-medium text-[var(--ink-soft)]">%</small>}
        </span>
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof Layers; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-[var(--bg-muted)] px-3 py-2.5">
      <Icon size={15} className="shrink-0 text-[var(--ink-faint)]" />
      <span className="min-w-0">
        <span className="block text-[16px] font-semibold leading-tight tabular-nums text-[var(--ink)]">{value}</span>
        <span className="block truncate text-[11.5px] text-[var(--ink-soft)]">{label}</span>
      </span>
    </div>
  );
}

/** 掌握度：整体圆环 + 下一步行动 + 章节分层分布 + 学科掌握 + 优先练习。 */
export default function ReviewMasteryOverview({ onNavigate }: { onNavigate?: (section: "flashcards" | "quiz") => void }) {
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

  const entries = useMemo(() => {
    void progressRevision;
    return getAllProgress();
  }, [progressRevision]);
  const overview = useMemo(() => summarizeWrongQuestions(entries), [entries]);
  const mastery = useMemo(() => summarizeMastery(entries), [entries]);
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

  const hasData = dueCount > 0 || mastery.chapters > 0 || notesCount > 0 || legacyHistory.length > 0;
  const next = pickNextAction({ dueCards: dueCount, weakChapters: overview.weakChapters, answeredChapters: mastery.chapters });
  const nextCopy = {
    flashcards: { title: t("review.overview.nextFlashcards", { count: next.kind === "flashcards" ? next.count : 0 }), hint: t("review.overview.nextFlashcardsHint") },
    "quiz-weak": { title: t("review.overview.nextQuizWeak", { chapters: next.kind === "quiz-weak" ? next.chapters : 0 }), hint: t("review.overview.nextQuizWeakHint") },
    "quiz-start": { title: t("review.overview.nextQuizStart"), hint: t("review.overview.nextQuizStartHint") },
    keep: { title: t("review.overview.nextKeep"), hint: t("review.overview.nextKeepHint") },
  }[next.kind];
  const nextTarget: "flashcards" | "quiz" | null = next.kind === "flashcards" ? "flashcards" : next.kind === "keep" ? null : "quiz";
  const totalChapters = Math.max(1, mastery.chapters);
  const subjectName = (id: string) => (id === "review" ? t("review.quiz.agentSource") : subjectLabel(id));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6" data-testid="review-overview">
      <h2 className="text-[17px] font-semibold text-[var(--ink)]">{t("review.overview.title")}</h2>
      {!hasData ? (
        <p className="rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-[13px] leading-relaxed text-[var(--ink-faint)]">
          {t("review.overview.empty")}
        </p>
      ) : (
        <>
          {/* 1. 整体掌握度 + 下一步 */}
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-panel)] p-5" data-testid="review-mastery-hero">
            <div className="flex flex-wrap items-center gap-5">
              <MasteryRing percent={mastery.overall} tier={mastery.overallTier} label={t("review.overview.overall")} />
              <div className="min-w-[200px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-[var(--ink-soft)]">{t("review.overview.overall")}</span>
                  {mastery.overallTier ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ color: TIER_COLOR[mastery.overallTier], background: `color-mix(in srgb, ${TIER_COLOR[mastery.overallTier]} 14%, transparent)` }}
                      data-testid="review-mastery-tier"
                    >
                      {t(`review.overview.tier.${mastery.overallTier}`)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-faint)]">
                  {mastery.chapters > 0
                    ? t("review.overview.overallBasis", { chapters: mastery.chapters, answered: mastery.answered })
                    : t("review.overview.none")}
                  {mastery.lowSample ? ` · ${t("review.overview.lowSample")}` : ""}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniStat icon={Layers} label={t("review.overview.dueCards")} value={dueCount} />
                  <MiniStat icon={Target} label={t("review.overview.recentAccuracy")} value={mastery.chapters > 0 ? `${overview.recentAccuracy}%` : t("review.overview.none")} />
                  <MiniStat icon={NotebookPen} label={t("review.overview.notesCount")} value={notesCount} />
                </div>
              </div>
            </div>
            <div
              className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--accent-weak)]/40 px-4 py-3"
              data-testid="review-next-action"
              data-next-kind={next.kind}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-faint)]">{t("review.overview.nextTitle")}</p>
                <p className="mt-0.5 text-[13.5px] font-semibold text-[var(--ink)]">{nextCopy.title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink-soft)]">{nextCopy.hint}</p>
              </div>
              {nextTarget && onNavigate ? (
                <button
                  type="button"
                  data-testid="review-next-action-cta"
                  onClick={() => onNavigate(nextTarget)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--md-sys-color-on-primary)] hover:brightness-95"
                >
                  {t("review.overview.practice")} <ArrowRight size={13} />
                </button>
              ) : next.kind === "keep" ? (
                <CheckCircle2 size={20} className="shrink-0" style={{ color: TIER_COLOR.mastered }} aria-hidden />
              ) : null}
            </div>
          </section>

          {/* 2. 章节分层分布 */}
          {mastery.chapters > 0 ? (
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-panel)] p-5" data-testid="review-tier-distribution">
              <h3 className="mb-3 text-[13px] font-semibold text-[var(--ink)]">{t("review.overview.distributionTitle")}</h3>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]" role="img" aria-label={t("review.overview.distributionTitle")}>
                {MASTERY_TIERS.map((tier) =>
                  mastery.distribution[tier] > 0 ? (
                    <span key={tier} style={{ width: `${(mastery.distribution[tier] / totalChapters) * 100}%`, background: TIER_COLOR[tier] }} />
                  ) : null,
                )}
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                {MASTERY_TIERS.map((tier) => (
                  <li key={tier} className="flex items-center gap-1.5 text-[12px] text-[var(--ink-soft)]" data-testid={`review-tier-${tier}`}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TIER_COLOR[tier] }} />
                    {t(`review.overview.tier.${tier}`)}
                    <b className="ml-auto font-semibold tabular-nums text-[var(--ink)]">{mastery.distribution[tier]}</b>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* 3. 各学科掌握度（最需要练的在前） */}
          {mastery.subjects.length > 0 ? (
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-panel)] p-5" data-testid="review-subject-mastery">
              <h3 className="mb-3 text-[13px] font-semibold text-[var(--ink)]">{t("review.overview.subjectsTitle")}</h3>
              <ul className="space-y-3">
                {mastery.subjects.map((subject) => (
                  <li key={subject.subjectId}>
                    <div className="mb-1 flex items-baseline gap-2 text-[12.5px]">
                      <span className="min-w-0 flex-1 truncate font-medium text-[var(--ink)]">{subjectName(subject.subjectId)}</span>
                      <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">{t("review.overview.subjectChapters", { count: subject.chapters })}</span>
                      <span className="w-12 shrink-0 text-right font-semibold tabular-nums" style={{ color: TIER_COLOR[subject.tier] }}>{Math.round(subject.percent)}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, subject.percent)}%`, background: TIER_COLOR[subject.tier], transition: "width 500ms var(--ease-out, ease-out)" }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* 4. 优先练习：最弱的章节 */}
          {overview.weakPoints.length > 0 ? (
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-panel)] p-5" data-testid="review-weak-points">
              <h3 className="mb-3 text-[13px] font-semibold text-[var(--ink)]">{t("review.overview.weakTitle")}</h3>
              <ul className="space-y-2.5">
                {overview.weakPoints.map((w) => (
                  <li key={`${w.subjectId}/${w.chapterId}`} className="flex items-center gap-3 rounded-xl bg-[var(--bg-muted)] px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-[var(--ink)]">{subjectName(w.subjectId)} · {w.chapterLabel}</p>
                      <p className="mt-0.5 text-[11.5px] text-[var(--ink-faint)]">
                        {w.answeredCount > 0 ? t("review.overview.weakWrong", { wrong: w.wrongCount, total: w.answeredCount }) : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[14px] font-semibold tabular-nums" style={{ color: "var(--md-sys-color-error)" }}>{w.lastPercent}%</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      {(legacyAvailable || legacyHistory.length > 0 || importError) && (
        <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4" aria-live="polite">
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
