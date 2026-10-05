import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { activateStorageOwner } from "@/lib/storage/ownerScope";
import { getLocalReviewAttempt, getLocalQuizSet, saveLocalQuizSet, saveLocalReviewAttempt } from "./attemptStorage.ts";
import { createAndCheckpointReviewAttempt, createReviewAttempt, loadNewestReviewAttempt, loadRemoteResume, loadWrongAttemptIdsFromAccount, prepareReviewAttemptCheckpoint, retryReviewAttemptSync, savePreparedReviewAttempt } from "./progressSync.ts";
import type { ReviewQuizSet } from "./attemptTypes.ts";
import { openAgentQuizAttempt } from "./agentQuizProgress.ts";

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
    assert.deepEqual(result, { attemptIds: [], hasMoreAttemptRecords: true, wrongQuestionCount: 0 });
  } finally {
    activateStorageOwner(null);
    globals.fetch = previousFetch;
    delete globals.window;
    delete globals.localStorage;
    delete globals.indexedDB;
  }
});

test("remote summary restores scored count from authoritative per-question results", async () => {
  const globals = setupBrowser();
  const previousFetch = globals.fetch;
  globals.fetch = (async () => Response.json({ attempt: {
    ...QUIZ, quizData: QUIZ.quizData, attemptId: "44444444-4444-4444-8444-444444444444", revision: 3,
    phase: "summary", stage: "final", questionResults: [
      { id: "q1", questionKey: `ssq-v1:${QUIZ.contentHash}:q1`, awarded: 1, max: 1, correct: true, objective: true, scored: true },
      { id: "q2", questionKey: `ssq-v1:${QUIZ.contentHash}:q2`, awarded: 0, max: 1, correct: null, objective: false, scored: false },
    ], score: { earned: 1, max: 1, percent: 100, objectiveCount: 1, correctCount: 1 },
  } })) as typeof fetch;
  activateStorageOwner(OWNER);
  try {
    const restored = await loadRemoteResume(OWNER);
    assert.equal(restored?.attempt.score.scoredCount, 1);
    assert.equal(restored?.attempt.score.percent, 100);
  } finally {
    activateStorageOwner(null); globals.fetch = previousFetch;
    delete globals.window; delete globals.localStorage; delete globals.indexedDB;
  }
});

test("a delayed seed acknowledgement preserves newer answers and a captured draft cannot regress CAS metadata", async () => {
  const globals = setupBrowser();
  const previousFetch = globals.fetch;
  let serverRevision = 0;
  let releaseSeed: (() => void) | undefined;
  let markStarted: (() => void) | undefined;
  const seedStarted = new Promise<void>((resolve) => { markStarted = resolve; });
  const actions: Array<{ action: string; expectedRevision: number }> = [];
  globals.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method !== "POST") return Response.json({ rows: [], nextCursor: null });
    const body = JSON.parse(String(init.body)) as { action: string; attempt: Record<string, unknown> };
    actions.push({ action: body.action, expectedRevision: Number(body.attempt.expectedRevision) });
    if (body.action === "seed-attempt" && serverRevision === 0) {
      await new Promise<void>((resolve) => { releaseSeed = resolve; markStarted!(); });
    }
    if (body.attempt.expectedRevision !== serverRevision) return Response.json({ code: "REVIEW_ATTEMPT_STALE" }, { status: 409 });
    serverRevision += 1;
    return Response.json({ status: "saved", attemptId: body.attempt.attemptId, revision: serverRevision, quizSetId: SET_ID, operationId: body.attempt.operationId });
  }) as typeof fetch;
  activateStorageOwner(OWNER);
  try {
    const first = await createAndCheckpointReviewAttempt(QUIZ, OWNER);
    await seedStarted;
    const answer = prepareReviewAttemptCheckpoint({ ...first, answers: { q1: 0 }, revealedQuestionIds: ["q1"] }, OWNER);
    const capturedSummary = prepareReviewAttemptCheckpoint({ ...answer, phase: "summary", stage: "final", completedAt: new Date().toISOString() }, OWNER);
    await savePreparedReviewAttempt(answer, OWNER);
    releaseSeed!();
    await new Promise((resolve) => setTimeout(resolve, 800));
    let local = await getLocalReviewAttempt(first.attemptId, OWNER);
    assert.deepEqual(local?.answers, { q1: 0 }, "blank seed ACK cannot overwrite a newer answer");
    assert.equal(local?.quizSetId, SET_ID);
    assert.equal(local?.serverRevision, 2);
    await savePreparedReviewAttempt(capturedSummary, OWNER);
    await new Promise((resolve) => setTimeout(resolve, 425));
    local = await getLocalReviewAttempt(first.attemptId, OWNER);
    assert.equal(local?.syncState, "synced");
    assert.equal(local?.serverRevision, 3);
    assert.equal(local?.phase, "summary");
    assert.deepEqual(actions, [{ action: "seed-attempt", expectedRevision: 0 }, { action: "save-attempt", expectedRevision: 1 }, { action: "save-attempt", expectedRevision: 2 }]);
  } finally {
    activateStorageOwner(null); globals.fetch = previousFetch;
    delete globals.window; delete globals.localStorage; delete globals.indexedDB;
  }
});

test("duplicate sync does not repost an acknowledged operation; conflict readback only accepts matching state", async () => {
  const globals = setupBrowser();
  const previousFetch = globals.fetch;
  let posts = 0;
  let serverRow: Record<string, unknown> | null = null;
  globals.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts += 1;
      const body = JSON.parse(String(init.body)) as { attempt: Record<string, unknown> };
      serverRow = { ...body.attempt, completedAt: typeof body.attempt.completedAt === "string" ? body.attempt.completedAt.replace(/Z$/, "+00:00") : null, revision: posts, quizSetId: SET_ID, quizKey: QUIZ.quizKey, contentHash: QUIZ.contentHash, quizData: QUIZ.quizData };
      return Response.json({ status: "saved", attemptId: body.attempt.attemptId, revision: posts, quizSetId: SET_ID, operationId: body.attempt.operationId });
    }
    return String(input).includes("attemptId=") ? Response.json(serverRow) : Response.json({ rows: [], nextCursor: null });
  }) as typeof fetch;
  activateStorageOwner(OWNER);
  try {
    const initial = await createAndCheckpointReviewAttempt(QUIZ, OWNER);
    await new Promise((resolve) => setTimeout(resolve, 425));
    let local = (await getLocalReviewAttempt(initial.attemptId, OWNER))!;
    await savePreparedReviewAttempt(prepareReviewAttemptCheckpoint({ ...local, phase: "summary", stage: "final", answers: { q1: 0 }, revealedQuestionIds: ["q1"], completedAt: new Date().toISOString() }, OWNER), OWNER);
    await new Promise((resolve) => setTimeout(resolve, 425));
    local = (await getLocalReviewAttempt(initial.attemptId, OWNER))!;
    await retryReviewAttemptSync(local);
    assert.equal(posts, 2, "a duplicate timer cannot resend an acknowledged operation with a changed expected revision");
    await saveLocalReviewAttempt({ ...local, syncState: "conflict" }, OWNER);
    const resumed = await openAgentQuizAttempt(QUIZ, OWNER);
    assert.equal(resumed.attemptId, initial.attemptId, "a tool card loaded after owner hydration resumes its exact attempt");
    local = (await getLocalReviewAttempt(initial.attemptId, OWNER))!;
    assert.equal(local.syncState, "synced", "identical owned server state confirms the previous successful write");
    assert.equal(posts, 2);
    serverRow = { ...serverRow!, answers: { q1: 1 }, revision: 2 };
    await saveLocalReviewAttempt({ ...local, syncState: "conflict" }, OWNER);
    const different = await openAgentQuizAttempt(QUIZ, OWNER);
    assert.equal(different.syncState, "conflict");
    local = (await getLocalReviewAttempt(initial.attemptId, OWNER))!;
    assert.equal(local.syncState, "conflict", "a genuinely different remote answer must remain a conflict");
    assert.deepEqual(local.answers, { q1: 0 });
    assert.equal(posts, 2, "conflict reconciliation is read-only and never overwrites a newer remote answer");
  } finally {
    activateStorageOwner(null); globals.fetch = previousFetch;
    delete globals.window; delete globals.localStorage; delete globals.indexedDB;
  }
});

test("newest Review result is not masked by an older preserved conflict", async () => {
  const globals = setupBrowser();
  try {
    await saveLocalQuizSet(QUIZ, null);
    const older = { ...createReviewAttempt(QUIZ, null), phase: "summary" as const, syncState: "conflict" as const, updatedAt: "2030-01-01T01:00:00+01:00" };
    const newer = { ...createReviewAttempt(QUIZ, null), phase: "summary" as const, syncState: "synced" as const, updatedAt: "2030-01-01T00:30:00Z", score: { earned: 1, max: 1, percent: 100, objectiveCount: 1, correctCount: 1, scoredCount: 1 } };
    await saveLocalReviewAttempt(older, null);
    await saveLocalReviewAttempt(newer, null);
    const restored = await loadNewestReviewAttempt(null);
    assert.equal(restored?.attempt.attemptId, newer.attemptId);
    assert.equal(restored?.attempt.score.percent, 100);
    assert.equal((await getLocalReviewAttempt(older.attemptId, null))?.syncState, "conflict", "old conflict history is preserved");
  } finally {
    delete globals.window; delete globals.localStorage; delete globals.indexedDB;
  }
});

test("account wrong count uses latest question outcomes while retaining correct attempts for server grounding", async () => {
  const globals = setupBrowser();
  const previousFetch = globals.fetch;
  globals.fetch = (async () => Response.json({ rows: [
    { attemptId: "a", attemptKind: "quiz", completedAt: "2030-01-01T00:30:00Z", questionResults: [{ id: "q1", questionKey: "stable-q1", objective: true, correct: true }] },
    { attemptId: "b", attemptKind: "quiz", completedAt: "2030-01-01T01:00:00+01:00", questionResults: [{ id: "q1", questionKey: "stable-q1", objective: true, correct: false }] },
    { attemptId: "c", attemptKind: "quiz", completedAt: "2030-01-01T00:20:00Z", questionResults: [{ id: "q2", questionKey: "stable-q2", objective: true, correct: false }, { id: "essay", questionKey: "essay", objective: false, correct: null }] },
  ], nextCursor: null })) as typeof fetch;
  activateStorageOwner(OWNER);
  try {
    const index = await loadWrongAttemptIdsFromAccount(OWNER);
    assert.equal(index.wrongQuestionCount, 1);
    assert.deepEqual(index.attemptIds, ["a", "b", "c"]);
    assert.equal(index.hasMoreAttemptRecords, false);
  } finally {
    activateStorageOwner(null); globals.fetch = previousFetch;
    delete globals.window; delete globals.localStorage; delete globals.indexedDB;
  }
});
