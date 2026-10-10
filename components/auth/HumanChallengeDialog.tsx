"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import {
  CHALLENGE_TRACKS,
  HUMAN_CHALLENGE_COOLDOWN_MS,
  getChallengePublic,
  gradeChallenge,
  remainingCooldownMs,
  shuffleMedicineOrder,
  type ChallengeAnswer,
  type ChallengeGrade,
  type ChallengeTrack,
} from "@/lib/auth/presentation/humanChallenge";
import { MEDICINE_SVGS } from "./CentralDogmaSvgs";

/** 各学科强调色：来自 studysolo-glass 快照的 --subj-* 令牌（globals.css 已移植）。 */
const TRACK_ACCENT: Record<ChallengeTrack, string> = {
  science: "var(--subj-prob)",
  humanities: "var(--subj-hist)",
  medicine: "var(--subj-chem)",
  other: "var(--subj-phy)",
};

function moveItem(order: string[], index: number, delta: number): string[] {
  const next = order.slice();
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  const tmp = next[index]!;
  next[index] = next[target]!;
  next[target] = tmp;
  return next;
}

/** macOS 分段控件（滑动 thumb，学科色）：四科切换。契约：role=tablist/tab + aria-selected。 */
function TrackSegment({
  track,
  onSelect,
}: {
  track: ChallengeTrack;
  onSelect: (next: ChallengeTrack) => void;
}) {
  const activeIndex = CHALLENGE_TRACKS.findIndex((item) => item.id === track);
  const width = `calc((100% - 6px) / ${CHALLENGE_TRACKS.length})`;
  return (
    <div
      className="auth-seg"
      role="tablist"
      aria-label="验证科目"
    >
      <span
        className="auth-seg-thumb"
        style={{ width, left: `calc(3px + ${Math.max(0, activeIndex)} * ((100% - 6px) / ${CHALLENGE_TRACKS.length}))` }}
        aria-hidden="true"
      />
      {CHALLENGE_TRACKS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={track === item.id}
          className="auth-seg-item"
          style={{ width }}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** 选项卡行：整行可点，替换原生 radio。契约：getByLabelText(label) 直达内层 input。 */
function OptionRow({
  label,
  checked,
  onToggle,
  groupName,
  mono = false,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  groupName: string;
  mono?: boolean;
}) {
  return (
    <label className="quiz-option">
      <input
        type="radio"
        name={groupName}
        className="sr-only"
        checked={checked}
        onChange={onToggle}
      />
      <span className="quiz-option-mark" aria-hidden="true">
        <Check size={11} strokeWidth={3.5} />
      </span>
      <span className={mono ? "quiz-option-mono" : undefined}>{label}</span>
    </label>
  );
}

/** 冷却环形倒计时：SVG 圆环扫描。 */
function CooldownRing({ remaining }: { remaining: number }) {
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, remaining / HUMAN_CHALLENGE_COOLDOWN_MS));
  return (
    <span className="cooldown-ring" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 22 22">
        <circle className="cooldown-ring-track" cx="11" cy="11" r={radius} fill="none" strokeWidth="2.5" />
        <circle
          className="cooldown-ring-bar"
          cx="11"
          cy="11"
          r={radius}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
    </span>
  );
}

export default function HumanChallengeDialog({
  open,
  onClose,
  onPassed,
}: {
  open: boolean;
  onClose: () => void;
  onPassed: () => void;
}) {
  const [track, setTrack] = useState<ChallengeTrack>("science");
  const [scienceChoice, setScienceChoice] = useState("");
  const [humanitiesSelected, setHumanitiesSelected] = useState<string[]>([]);
  const [humanitiesAnswers, setHumanitiesAnswers] = useState<Record<string, string>>({});
  const [otherAnswers, setOtherAnswers] = useState<Record<string, string>>({});
  const [medicineOrder, setMedicineOrder] = useState(() => shuffleMedicineOrder());
  const [grade, setGrade] = useState<ChallengeGrade | null>(null);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const challenge = useMemo(() => getChallengePublic(track), [track]);
  const cooldown = remainingCooldownMs(failedAt, now);
  const cooling = cooldown > 0;
  const accent = TRACK_ACCENT[track];

  useEffect(() => {
    if (!cooling) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [cooling]);

  if (!open || typeof document === "undefined") return null;

  function resetReveal() {
    setGrade(null);
  }

  function toggleHumanities(id: string) {
    setHumanitiesSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  }

  function submit() {
    if (cooling) return;
    let answer: ChallengeAnswer;
    if (track === "science") answer = { track, choiceId: scienceChoice };
    else if (track === "humanities") {
      answer = { track, selectedIds: humanitiesSelected, answers: humanitiesAnswers };
    } else if (track === "medicine") answer = { track, order: medicineOrder };
    else answer = { track, answers: otherAnswers };
    const next = gradeChallenge(answer);
    setGrade(next);
    if (next.passed) {
      setFailedAt(null);
      onPassed();
      return;
    }
    setFailedAt(Date.now());
    setNow(Date.now());
  }

  const quizStyle = { ["--quiz-accent" as string]: accent };

  return createPortal(
    <div
      className="auth-overlay human-challenge-overlay"
      data-testid="human-challenge-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="auth-window human-challenge-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="人机验证"
      >
        <div className="auth-titlebar">
          <div className="auth-titlebar-lights">
            <button
              type="button"
              className="auth-light"
              data-tone="close"
              aria-label="关闭"
              title="关闭"
              onClick={onClose}
            >
              <X size={9} strokeWidth={3} />
            </button>
            <span className="auth-light" data-tone="min" aria-hidden="true" />
            <span className="auth-light" data-tone="zoom" aria-hidden="true" />
          </div>
          <div className="auth-titlebar-title">人机验证</div>
        </div>

        <div className="challenge-head">
          <h2 className="challenge-head-title">先证明你是人</h2>
          <p className="challenge-head-sub">任选一科答对即可发邮件。提交后才看答案；失败冷却 10 秒。</p>
        </div>

        <div className="challenge-seg-row">
          <TrackSegment
            track={track}
            onSelect={(next) => {
              setTrack(next);
              resetReveal();
            }}
          />
        </div>

        <div className="challenge-body" style={quizStyle}>
          {challenge.track === "science" && (
            <div className="flex flex-col gap-3">
              <div className="quiz-card">
                <p className="quiz-card-title">{challenge.title}</p>
                <p className="quiz-card-equation">{challenge.equation}</p>
                <p className="quiz-card-condition">{challenge.condition}</p>
                <p className="quiz-card-hint">{challenge.prompt}</p>
              </div>
              <div role="radiogroup" aria-label="微分方程答案" className="flex flex-col gap-2">
                {challenge.choices.map((choice) => (
                  <OptionRow
                    key={choice.id}
                    label={choice.label}
                    groupName="science-ode"
                    mono
                    checked={scienceChoice === choice.id}
                    onToggle={() => setScienceChoice(choice.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {challenge.track === "humanities" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="quiz-card-title">{challenge.title}</p>
                <span className="text-[11px] font-semibold" style={{ color: accent }}>
                  已选 {humanitiesSelected.length}/3
                </span>
              </div>
              <p className="quiz-card-hint">{challenge.hint}</p>
              {challenge.questions.map((question, index) => {
                const selected = humanitiesSelected.includes(question.id);
                return (
                  <fieldset
                    key={question.id}
                    className="quiz-card m-0"
                    style={{ ...quizStyle, ["--quiz-accent" as string]: selected ? accent : "var(--md-sys-color-outline)" }}
                  >
                    <legend className="sr-only">
                      {index + 1}. {question.prompt}
                    </legend>
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <span
                        className="quiz-option-mark"
                        data-shape="square"
                        aria-hidden="true"
                        style={selected ? { borderColor: accent, background: accent, color: "var(--subj-on-accent, #fff)" } : undefined}
                      >
                        <Check size={11} strokeWidth={3.5} />
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selected}
                        onChange={() => toggleHumanities(question.id)}
                      />
                      <span className="quiz-card-title" style={{ fontWeight: 600 }}>
                        {index + 1}. {question.prompt}
                      </span>
                    </label>
                    {selected && (
                      <div className="mt-3 flex flex-col gap-2">
                        {question.choices.map((choice) => (
                          <OptionRow
                            key={choice.id}
                            label={choice.label}
                            groupName={`hum-${question.id}`}
                            checked={humanitiesAnswers[question.id] === choice.id}
                            onToggle={() =>
                              setHumanitiesAnswers((current) => ({ ...current, [question.id]: choice.id }))
                            }
                          />
                        ))}
                      </div>
                    )}
                  </fieldset>
                );
              })}
            </div>
          )}

          {challenge.track === "medicine" && (
            <div className="flex flex-col gap-3">
              <p className="quiz-card-title">{challenge.title}</p>
              <p className="quiz-card-hint">{challenge.hint}</p>
              <ol className="pizza-list">
                {medicineOrder.map((id, index) => {
                  const step = challenge.steps.find((item) => item.id === id);
                  const Svg = MEDICINE_SVGS[id];
                  return (
                    <li key={id} className="sort-row">
                      <span className="sort-row-index">{index + 1}</span>
                      {Svg ? (
                        <span className="sort-svg-shell">
                          <Svg />
                        </span>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[13px] font-semibold">{step?.title}</p>
                        <p className="m-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{step?.caption}</p>
                      </div>
                      <div className="sort-row-btns">
                        <button
                          type="button"
                          className="sort-btn"
                          aria-label={`上移 ${step?.title ?? id}`}
                          disabled={index === 0}
                          onClick={() => setMedicineOrder((current) => moveItem(current, index, -1))}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          className="sort-btn"
                          aria-label={`下移 ${step?.title ?? id}`}
                          disabled={index === medicineOrder.length - 1}
                          onClick={() => setMedicineOrder((current) => moveItem(current, index, 1))}
                        >
                          <ArrowDown size={12} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {challenge.track === "other" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="quiz-card-title">{challenge.title}</p>
                <span className="pass-dots" aria-label={`已答 ${Object.keys(otherAnswers).length} 题`}>
                  {[0, 1, 2].map((dot) => (
                    <span key={dot} className="pass-dot" data-on={Object.keys(otherAnswers).length > dot} />
                  ))}
                </span>
              </div>
              <p className="quiz-card-hint">{challenge.hint}</p>
              {challenge.questions.map((question, index) => (
                <fieldset key={question.id} className="quiz-card m-0">
                  <legend className="sr-only">{index + 1}. {question.prompt}</legend>
                  <p className="quiz-card-title">{index + 1}. {question.prompt}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {question.choices.map((choice) => (
                      <OptionRow
                        key={choice.id}
                        label={choice.label}
                        groupName={`other-${question.id}`}
                        checked={otherAnswers[question.id] === choice.id}
                        onToggle={() => setOtherAnswers((current) => ({ ...current, [question.id]: choice.id }))}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}

          {grade && (
            <div
              className="challenge-reveal"
              data-testid="human-challenge-reveal"
              data-state={grade.passed ? "passed" : "failed"}
            >
              <p className="challenge-reveal-title">{grade.message}</p>
              <ul>
                {grade.reveal.map((item) => (
                  <li key={item.id}>
                    {item.correct ? "对" : "错"}：你的答案 {item.given}；正确 {item.expected}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="challenge-foot">
          <p className="challenge-foot-status m-0">
            {cooling ? `冷却中 ${Math.ceil(cooldown / 1000)} 秒` : "提交后显示对错"}
          </p>
          <button type="button" disabled={cooling} onClick={submit} className="challenge-submit">
            {cooling && <CooldownRing remaining={cooldown} />}
            提交
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
