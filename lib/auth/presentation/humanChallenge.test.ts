import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHALLENGE_TRACKS,
  HUMANITIES_PICK_COUNT,
  HUMAN_CHALLENGE_COOLDOWN_MS,
  MEDICINE_CANONICAL_ORDER,
  OTHER_PASS_COUNT,
  getChallengePublic,
  gradeChallenge,
  isMedicineOrderCorrect,
  remainingCooldownMs,
  shuffleMedicineOrder,
} from "./humanChallenge.ts";

test("四科标签固定，冷却 10 秒", () => {
  assert.deepEqual(
    CHALLENGE_TRACKS.map((item) => item.label),
    ["理科", "文科", "医科", "其他"],
  );
  assert.equal(HUMAN_CHALLENGE_COOLDOWN_MS, 10_000);
  assert.equal(remainingCooldownMs(1_000, 1_000 + 9_999), 1);
  assert.equal(remainingCooldownMs(1_000, 1_000 + 10_000), 0);
});

test("理科：只有 x² + 1 通过，提交后才给出答案", () => {
  const pub = getChallengePublic("science");
  assert.equal(pub.track, "science");
  if (pub.track !== "science") return;
  assert.match(pub.equation, /dy\/dx = 2x/);
  assert.equal("answer" in pub, false);

  const wrong = gradeChallenge({ track: "science", choiceId: "ode-2x-plus-1" });
  assert.equal(wrong.passed, false);
  assert.match(wrong.reveal[0]!.expected, /x² \+ 1/);

  const ok = gradeChallenge({ track: "science", choiceId: "ode-x2-plus-1" });
  assert.equal(ok.passed, true);
});

test("文科：必须 10 选 3 且全对", () => {
  const pub = getChallengePublic("humanities");
  assert.equal(pub.track, "humanities");
  if (pub.track !== "humanities") return;
  assert.equal(pub.questions.length, 10);
  assert.equal(pub.pick, HUMANITIES_PICK_COUNT);
  assert.ok(pub.questions.every((q) => !("answer" in q)));

  const tooFew = gradeChallenge({
    track: "humanities",
    selectedIds: ["h1"],
    answers: { h1: "b" },
  });
  assert.equal(tooFew.passed, false);

  const mixed = gradeChallenge({
    track: "humanities",
    selectedIds: ["h1", "h2", "h3"],
    answers: { h1: "b", h2: "a", h3: "c" },
  });
  assert.equal(mixed.passed, false);

  const ok = gradeChallenge({
    track: "humanities",
    selectedIds: ["h1", "h2", "h10"],
    answers: { h1: "b", h2: "c", h10: "d" },
  });
  assert.equal(ok.passed, true);
});

test("医科：中心法则顺序复制→转录→加工→翻译", () => {
  assert.deepEqual([...MEDICINE_CANONICAL_ORDER], [
    "replication",
    "transcription",
    "processing",
    "translation",
  ]);
  assert.equal(isMedicineOrderCorrect([...MEDICINE_CANONICAL_ORDER]), true);
  assert.equal(isMedicineOrderCorrect(["translation", "replication", "transcription", "processing"]), false);

  const shuffled = shuffleMedicineOrder(() => 0);
  assert.equal(isMedicineOrderCorrect(shuffled), false);

  const pub = getChallengePublic("medicine");
  assert.equal(pub.track, "medicine");
  if (pub.track !== "medicine") return;
  assert.equal(pub.steps.length, 4);

  const ok = gradeChallenge({ track: "medicine", order: [...MEDICINE_CANONICAL_ORDER] });
  assert.equal(ok.passed, true);
  const bad = gradeChallenge({
    track: "medicine",
    order: ["translation", "processing", "transcription", "replication"],
  });
  assert.equal(bad.passed, false);
  assert.equal(bad.reveal.length, 4);
});

test("其他：10 题对 3 即过", () => {
  const pub = getChallengePublic("other");
  assert.equal(pub.track, "other");
  if (pub.track !== "other") return;
  assert.equal(pub.questions.length, 10);
  assert.equal(pub.passCount, OTHER_PASS_COUNT);

  const two = gradeChallenge({
    track: "other",
    answers: { o1: "a", o2: "b", o3: "a" },
  });
  assert.equal(two.passed, false);

  const three = gradeChallenge({
    track: "other",
    answers: { o1: "a", o2: "b", o3: "c" },
  });
  assert.equal(three.passed, true);
});
