import assert from "node:assert/strict";
import { test } from "node:test";

test("offline subject scope hides unbundled courses while the empty Web scope keeps all", async () => {
  const prior = process.env.NEXT_PUBLIC_OFFLINE_SUBJECTS;
  try {
    process.env.NEXT_PUBLIC_OFFLINE_SUBJECTS = "probability";
    const scope = await import("./offlineSubjects.ts");
    assert.equal(scope.isSubjectInRuntime("probability"), true);
    assert.equal(scope.isSubjectInRuntime("anatomy"), false);
    assert.deepEqual(scope.filterRuntimeSubjects([{ id: "anatomy" }, { id: "probability" }]).map((row) => row.id), ["probability"]);
    assert.deepEqual(scope.offlineSubjectIds(), ["probability"]);
  } finally {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_OFFLINE_SUBJECTS;
    else process.env.NEXT_PUBLIC_OFFLINE_SUBJECTS = prior;
  }
});
