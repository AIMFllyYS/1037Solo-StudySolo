import assert from "node:assert/strict";
import { test } from "node:test";
import { ACADEMIC_YEAR_LABELS } from "@/lib/constants/academic-year";
import { SUBJECT_REGISTRY, getSubjectMeta } from "@/lib/content-data/subjects.registry";
import {
  FLASHCARD_PICKER_TITLE,
  flashcardPickerTitle,
  listFlashcardSubjectGroups,
  retargetCardSourceLabel,
} from "@/lib/notes/library/flashcardSubjects";

test("flashcard picker title uses the management-page name", () => {
  assert.equal(flashcardPickerTitle(null), FLASHCARD_PICKER_TITLE);
  assert.match(flashcardPickerTitle("probability"), /复习闪卡页面/);
  assert.match(flashcardPickerTitle("probability"), /概率论/);
});

test("subject groups come from the academic-year registry, not a hardcoded table", () => {
  const groups = listFlashcardSubjectGroups();
  const listedIds = groups.flatMap((group) => group.subjects.map((subject) => subject.id));

  assert.ok(groups.length > 0);
  assert.deepEqual(
    listedIds.slice().sort(),
    SUBJECT_REGISTRY.map((subject) => subject.id).slice().sort(),
  );
  assert.ok(groups.every((group) => group.label === ACADEMIC_YEAR_LABELS[group.yearId]));
  assert.ok(groups.every((group) => group.subjects.length > 0));

  const probability = groups
    .find((group) => group.yearId === getSubjectMeta("probability")?.year)
    ?.subjects.find((subject) => subject.id === "probability");
  assert.equal(probability?.name, "概率论");
  assert.equal(probability?.fullName, "概率论与数理统计");
});

test("retargetCardSourceLabel only rewrites the subject segment", () => {
  assert.equal(retargetCardSourceLabel("概率论 / 详解 / 2.3", "physics"), "大学物理 / 详解 / 2.3");
  assert.equal(retargetCardSourceLabel("随手记", "anatomy"), "系统解剖学");
});
