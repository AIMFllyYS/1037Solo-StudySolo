import assert from "node:assert/strict";
import { test } from "node:test";
import { recordingItems, summaryItems, recordingIds, type LectureMeta } from "@/lib/content-data/recordings";
import { chemistryLectures } from "@/lib/content-data/subjects/chemistry/chemistry-lectures";
import { maogaiLectures } from "@/lib/content-data/subjects/maogai/maogai-lectures";
import { modernHistoryLectures } from "@/lib/content-data/subjects/modern-history/modern-history-lectures";
import { physicsLectures } from "@/lib/content-data/subjects/physics/physics-lectures";
import { probabilityLectures } from "@/lib/content-data/subjects/probability/probability-lectures";
import { getCategory } from "@/lib/content-data";

const lectures: LectureMeta[] = [
  { id: "1", title: "第一讲·A" },
  { id: "07", title: "第七讲·B", summaryTitle: "第七讲纪要·B" },
  { id: "15", title: "第十五讲·C", hasSummary: false },
  { id: "100", title: "第一百讲·D", status: "draft" },
];

test("recordingItems / summaryItems：补零、纪要标题覆盖、无纪要跳过、三位数 id", () => {
  assert.deepEqual(recordingIds(lectures), ["rec-01", "rec-07", "rec-15", "rec-100"]);
  const recs = recordingItems(lectures);
  assert.equal(recs[0].title, "第一讲·A");
  assert.equal(recs[3].status, "draft");
  const sums = summaryItems(lectures);
  assert.deepEqual(sums.map((s) => s.id), ["sum-01", "sum-07", "sum-100"]);
  assert.equal(sums[1].title, "第七讲纪要·B");
  assert.equal(sums[0].title, "第一讲·A", "缺省纪要标题 = 录音标题");
});

test("physics：manifest 中 recording / summary 板块由 physicsLectures 派生且一一配对", () => {
  const rec = getCategory("physics", "recording")!.items;
  const sum = getCategory("physics", "summary")!.items;
  assert.deepEqual(rec.map((i) => i.id), recordingIds(physicsLectures));
  assert.deepEqual(
    sum.map((i) => i.id),
    physicsLectures.filter((l) => l.hasSummary !== false).map((l) => `sum-${l.id}`),
  );
  for (const l of physicsLectures) assert.ok(/^\d{2,}$/.test(l.id), `讲次 id 应为纯数字: ${l.id}`);
});

test("probability：manifest 中 recording / summary 板块由 probabilityLectures 派生", () => {
  assert.deepEqual(getCategory("probability", "recording")!.items, recordingItems(probabilityLectures));
  assert.deepEqual(getCategory("probability", "summary")!.items, summaryItems(probabilityLectures));
});

test("chemistry：manifest 中 recording / summary 板块由 chemistryLectures 派生", () => {
  assert.deepEqual(getCategory("chemistry", "recording")!.items, recordingItems(chemistryLectures));
  assert.deepEqual(getCategory("chemistry", "summary")!.items, summaryItems(chemistryLectures));
});

test("modern-history：manifest 中 recording / summary 板块由 modernHistoryLectures 派生", () => {
  assert.deepEqual(getCategory("modern-history", "recording")!.items, recordingItems(modernHistoryLectures));
  assert.deepEqual(getCategory("modern-history", "summary")!.items, summaryItems(modernHistoryLectures));
});

test("maogai：manifest 中 recording / summary 板块由 maogaiLectures 派生", () => {
  assert.deepEqual(getCategory("maogai", "recording")!.items, recordingItems(maogaiLectures));
  assert.deepEqual(getCategory("maogai", "summary")!.items, summaryItems(maogaiLectures));
});
