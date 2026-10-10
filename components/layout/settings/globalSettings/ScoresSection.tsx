import { Trophy, BarChart3, Layers, Repeat, Trash2 } from "lucide-react";

import SubjectIcon from "@/components/shared/SubjectIcon";

import { getGlobalSummary, chapterLabel, scoreGrade, objectiveAccuracyOf, objectiveAttemptsOf, objectiveBestOf, type ProgressEntry } from "@/lib/quiz-progress";

import SettingsSection from "../SettingsSection";

import { useT } from "@/lib/i18n/index";

import { StatCard, ScoreBadge } from "./GradeCards";
import { findChapterRoute } from "@/lib/review/gradeGroups";
import type { SubjectGroup } from '@/lib/review/gradeGroups';
export interface ScoresSectionProps {
  page: boolean;
  open: boolean;
  onToggle: () => void;
  summary: ReturnType<typeof getGlobalSummary>;
  groups: SubjectGroup[];
  confirmClear: boolean;
  onClear: () => void;
  onOpenChapter: (entry: ProgressEntry, route: NonNullable<ReturnType<typeof findChapterRoute>>) => void;
}
export function ScoresSection({ page, open, onToggle, summary, groups, confirmClear, onClear, onOpenChapter }: ScoresSectionProps) {
  const t = useT();
  return (<SettingsSection
            variant={page ? "card" : "menu"}
            title={t("settings.global.scores")}
            icon={<Trophy size={16} />}
            open={open}
            onToggle={onToggle}
            summary={
              summary.chapters
                ? t("settings.scores.summary", {
                    chapters: summary.chapters,
                    avg: summary.avgBest,
                    attempts: summary.totalAttempts,
                  })
                : t("settings.scores.empty")
            }
          >
            <div className="flex flex-col gap-3">
              <div className="flex gap-2.5">
                <StatCard icon={<Layers size={15} />} value={summary.chapters} label={t("settings.scores.chapters")} flat={!page} />
                <StatCard
                  icon={<BarChart3 size={15} />}
                  value={summary.chapters ? summary.avgBest : "—"}
                  label={t("settings.scores.avgBest")}
                  accent={summary.chapters ? scoreGrade(summary.avgBest).color : undefined}
                  flat={!page}
                />
                <StatCard icon={<Repeat size={15} />} value={summary.totalAttempts} label={t("settings.scores.attempts")} flat={!page} />
              </div>

              {groups.length === 0 ? (
                <div
                  className={page
                    ? "rounded-[var(--md-sys-shape-corner-large,16px)] px-4 py-6 text-center text-[12.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]"
                    : "px-0.5 py-1.5 text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]"}
                  style={page ? { background: "var(--md-sys-color-surface-container-lowest)" } : undefined}
                >
                  {t("settings.scores.emptyTitle")}
                  <br />
                  {t("settings.scores.emptyHint")}
                </div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {groups.map((g) => {
                    return (
                      <div key={g.id} className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 px-0.5">
                          <SubjectIcon subjectId={g.id} size={15} style={{ color: "var(--md-sys-color-primary)" }} />
                          <span className="text-[13px] font-bold text-[var(--md-sys-color-on-surface)]">
                            {g.name}
                          </span>
                          <span className="text-[11.5px] text-[var(--md-sys-color-on-surface-variant)]">
                            {t("settings.scores.chapterCount", { count: g.items.length })}
                          </span>
                          <span className="ml-auto text-[11.5px] text-[var(--md-sys-color-on-surface-variant)]">
                            {t("settings.scores.avgBestShort")}
                          </span>
                          <ScoreBadge percent={g.avgBest} />
                        </div>
                        <div
                          className="flex flex-col overflow-hidden rounded-[var(--md-sys-shape-corner-large,16px)]"
                          style={{ border: "1px solid var(--md-sys-color-outline-variant)" }}
                        >
                          {g.items.map((e, i) => {
                            const route = findChapterRoute(e.subjectId, e.chapterId);
                            const objectiveAccuracy = objectiveAccuracyOf(e.progress);
                            const objectiveAttempts = objectiveAttemptsOf(e.progress);
                            const objectiveBest = objectiveBestOf(e.progress) ?? objectiveAccuracy;
                            return (
                              <div
                                key={e.chapterId}
                                onClick={() => {
                                  if (!route) return;
                                  onOpenChapter(e, route);
                                }}
                                className="flex items-center gap-3 px-3 py-2 transition-colors"
                                style={{
                                  background:
                                    i % 2 === 0
                                      ? "var(--md-sys-color-surface-container-lowest)"
                                      : "var(--md-sys-color-surface-container)",
                                  cursor: route ? "pointer" : "default",
                                }}
                              >
                                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--md-sys-color-on-surface)]">
                                  {chapterLabel(e.chapterId)}
                                </span>
                                <span className="shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                                  {objectiveAccuracy == null
                                    ? t("settings.scores.lastUnscored")
                                    : t("settings.scores.lastAttempt", { percent: objectiveAccuracy, attempts: objectiveAttempts })}
                                </span>
                                {objectiveAttempts === 0
                                  ? <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">{t("settings.scores.lastUnscored")}</span>
                                  : <ScoreBadge percent={objectiveBest ?? 0} />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={page
                ? "flex items-center justify-between gap-3 rounded-[var(--md-sys-shape-corner-large,16px)] bg-[var(--md-sys-color-surface-container-lowest)] px-3.5 py-2.5"
                : "flex items-center justify-between gap-3 py-1"}>
                <div className="min-w-0">
                  <div className={page
                    ? "text-[13px] font-medium text-[var(--md-sys-color-on-surface)]"
                    : "text-[11.5px] font-medium text-[var(--md-sys-color-on-surface)]"}>
                    {t("settings.scores.clear")}
                  </div>
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    {t("settings.scores.clearDesc")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClear}
                  disabled={summary.chapters === 0 && !confirmClear}
                  className="press flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-40"
                  style={{
                    background: confirmClear
                      ? "var(--md-sys-color-error)"
                      : "var(--md-sys-color-surface-container-highest)",
                    color: confirmClear
                      ? "var(--md-sys-color-on-error)"
                      : "var(--md-sys-color-error)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={14} />
                  {t(confirmClear ? "settings.scores.clearConfirm" : "settings.scores.clearAction")}
                </button>
              </div>
            </div>
          </SettingsSection>);
}
