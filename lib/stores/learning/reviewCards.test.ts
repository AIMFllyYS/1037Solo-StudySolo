import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";

beforeEach(() => {
  useReviewCards.setState({ byId: {}, order: [] });
});

test("setSubject writes the existing subjectId and retargets sourceLabel", () => {
  const id = useReviewCards.getState().addSaved("泊松分布原文", {
    subjectId: "probability",
    sourceLabel: "概率论 / 详解 / 2.3",
  });
  useReviewCards.getState().setSubject(id, "physics");
  const card = useReviewCards.getState().byId[id];
  assert.equal(card?.subjectId, "physics");
  assert.equal(card?.sourceLabel, "大学物理 / 详解 / 2.3");
  assert.equal(card?.originalText, "泊松分布原文");
});

test("setSubject is a no-op when the subject does not change", () => {
  const id = useReviewCards.getState().addSaved("原文", {
    subjectId: "physics",
    sourceLabel: "大学物理 / 复习板",
  });
  const before = useReviewCards.getState().byId[id];
  useReviewCards.getState().setSubject(id, "physics");
  assert.equal(useReviewCards.getState().byId[id], before);
});
