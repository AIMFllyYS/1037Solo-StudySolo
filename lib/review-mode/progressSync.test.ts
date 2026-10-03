import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { activateStorageOwner } from "@/lib/storage/ownerScope";
import { getLocalReviewAttempt, getLocalQuizSet } from "./attemptStorage.ts";
import { createAndCheckpointReviewAttempt, loadWrongAttemptIdsFromAccount, prepareReviewAttemptCheckpoint, savePreparedReviewAttempt } from "./progressSync.ts";
import type { ReviewQuizSet } from "./attemptTypes.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SET_ID = "22222222-2222-4222-8222-222222222222";
const QUIZ: ReviewQuizSet = {
  quizKey: `ss-review-v1|review-chapter|${"a".repeat(64)}`,
  contentHash: "a".repeat(64),
  sourceKind: "review-chapter",
  subjectId: "chemistry",
  categoryId: "detail",
  chapterId: "ch01",
  quizId: "quiz-1",
  title: "化学 · 第一章",
  quizData: {
    subjectId: "chemistry",
    chapterId: "ch01",
    generatedAt: "2026-10-04T00:00:00.000Z",
    examConfig: { source: "真实资料", totalPoints: 1 },
    questions: [{ id: "q1", type: "single_choice", difficulty: "basic", source: "current_chapter", points: 1, stem: "氧化数升高表示？", options: ["得到电子", "失去电子"], answer: 1 }],
  },
};

function setupBrowser() {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
    removeItem: (key: string) => { memory.delete(key); },
    key: (index: number) => [...memory.keys()][index] ?? null,
    get length() { return memory.size; },
  } as Storage;
  const globals = globalThis as unknown as { window?: Window; localStorage?: Storage; indexedDB?: IDBFactory; fetch?: typeof fetch };
  globals.window = new EventTarget() as Window;
  globals.localStorage = storage;
  globals.indexedDB = new IDBFactory();
  return globals;
}

test("Review attempt seeds one empty row, then syncs the same attempt by CAS with an owner binding", async () => {
  const globals = setupBrowser();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const previousFetch = globals.fetch;
  globals.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (init?.method !== "POST") return Response.json({ rows: [], nextCursor: null });
    const body = JSON.parse(String(init.body)) as { action: string; attempt: Record<string, unknown> };
    const revision = body.action === "seed-attempt" ? 1 : 2;
    return Response.json({ status: "saved", attemptId: body.attempt.attemptId, revision, quizSetId: SET_ID, operationId: body.attempt.operationId });
  }) as typeof fetch;
  activateStorageOwner(OWNER);
  try {
    const attempt = await createAndCheckpointReviewAttempt(QUIZ, OWNER);
    await new Promise((resolve) => setTimeout(resolve, 425));
    let local = await getLocalReviewAttempt(attempt.attemptId, OWNER);
    assert.ok(local);
    assert.equal(local!.quizSetId, SET_ID);
    assert.equal(local!.syncState, "synced");
    assert.ok(await getLocalQuizSet(QUIZ.contentHash, OWNER));

    const completed = prepareReviewAttemptCheckpoint({
      ...local!,
      phase: "summary",
      stage: "final",
      answers: { q1: 0 },
      revealedQuestionIds: ["q1"],
      completedAt: "2026-10-04T00:01:00.000Z",
      questionResults: [{ id: "q1", questionKey: `ssq-v1:${QUIZ.contentHash}:q1`, awarded: 0, max: 1, correct: false, objective: true, scored: true }],
      score: { earned: 0, max: 1, percent: 0, objectiveCount: 1, correctCount: 0, scoredCount: 1 },
    }, OWNER);
    await savePreparedReviewAttempt(completed, OWNER);
    await new Promise((resolve) => setTimeout(resolve, 425));
    local = await getLocalReviewAttempt(attempt.attemptId, OWNER);
    assert.ok(local);
    assert.equal(local!.attemptId, attempt.attemptId, "completion updates the seeded attempt rather than creating another count");
    assert.equal(local!.syncState, "synced");
    assert.equal(local!.serverRevision, 2);

    const postCalls = calls.filter((call) => call.init?.method === "POST");
    assert.deepEqual(postCalls.map((call) => (JSON.parse(String(call.init?.body)) as { action: string }).action), ["seed-attempt", "save-attempt"]);
    const seed = JSON.parse(String(postCalls[0].init?.body)) as { attempt: Record<string, unknown> };
    const save = JSON.parse(String(postCalls[1].init?.body)) as { attempt: Record<string, unknown> };
    assert.equal(seed.attempt.expectedRevision, 0);
    assert.equal(save.attempt.expectedRevision, 1);
    assert.equal(save.attempt.attemptId, seed.attempt.attemptId);
    assert.equal(save.attempt.answers && (save.attempt.answers as Record<string, unknown>).q1, 0);
    assert.equal("user_id" in seed.attempt, false);
    assert.equal(postCalls[0].init?.headers && (postCalls[0].init?.headers as Record<string, string>)["x-studysolo-owner-binding"],
      createHash("sha256").update(`studysolo-review-owner-binding-v1:${OWNER}`).digest("hex"));
  } finally {
    activateStorageOwner(null);
    globals.fetch = previousFetch;
    delete globals.window;
    delete globals.localStorage;
    delete globals.indexedDB;
  }
});

test("an attempt index request failure is reported as incomplete, never as full coverage", async () => {
  const globals = setupBrowser();
  const previousFetch = globals.fetch;
  globals.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
  activateStorageOwner(OWNER);
  try {
    const result = await loadWrongAttemptIdsFromAccount(OWNER);
    assert.deepEqual(result, { attemptIds: [], hasMoreAttemptRecords: true });
  } finally {
    activateStorageOwner(null);
    globals.fetch = previousFetch;
    delete globals.window;
    delete globals.localStorage;
    delete globals.indexedDB;
  }
});
