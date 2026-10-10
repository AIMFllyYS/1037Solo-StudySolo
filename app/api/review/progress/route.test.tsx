import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  verifyAccount: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  query: {} as Record<string, ReturnType<typeof vi.fn>>,
  rows: [] as Array<Record<string, unknown>>,
  attemptRow: null as Record<string, unknown> | null,
  quizSetRow: null as Record<string, unknown> | null,
  bridgeEnabled: vi.fn(() => false),
  forwardBridge: vi.fn(),
  sandboxFailure: vi.fn(),
  readQuiz: vi.fn(),
}));

vi.mock("@/lib/auth/authMode", () => ({
  accountBackendUrl: vi.fn(() => "http://127.0.0.1:3041"),
  authModeForRequest: vi.fn(() => "account-local"),
  CANONICAL_SITE_ORIGIN: "https://studysolo.1037solo.com",
}));
vi.mock("@/lib/auth/sessions/sessionCookie", () => ({ extractAccessToken: vi.fn(() => "synthetic-access-token") }));
vi.mock("@/lib/auth/sign-in/account-verify", () => ({
  failureStatus: (result: { kind: string }) => result.kind === "signed-out" ? 401 : result.kind === "forbidden" ? 403 : 503,
  verifyAccount: mocks.verifyAccount,
}));
vi.mock("@/lib/auth/server/rateLimit", () => ({ consumeRateLimit: vi.fn(() => ({ ok: true, remaining: 119 })) }));
vi.mock("@/lib/auth/server/serviceClient", () => ({
  createServiceAuthClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/content/loader", () => ({ readQuiz: mocks.readQuiz }));
vi.mock("@/lib/sandbox/desktop-bridge.server", () => ({
  desktopCloudBridgeEnabled: mocks.bridgeEnabled,
  forwardDesktopAgentRequest: mocks.forwardBridge,
}));
vi.mock("@/lib/sandbox/config.server", () => ({ sandboxFailure: mocks.sandboxFailure }));

import { GET, POST } from "./route";

const OWNER_UUID = "4a7524bd-101d-4419-a5e9-74f37f8e0001";
const ATTEMPT_ID = "e6843916-e6b7-4db2-8b25-95d54a01d4b4";
const OPERATION_ID = "9ef2c3b5-c104-4722-b334-4be6bc2e74c1";
const SET_ID = "c1162871-5824-455a-b7d2-e2c5bf98b120";
const QUIZ = {
  subjectId: "physics",
  chapterId: "ch01",
  generatedAt: "2026-10-04",
  examConfig: { source: "fixture", totalPoints: 1 },
  questions: [{
    id: "q1",
    type: "single_choice",
    difficulty: "basic",
    source: "current_chapter",
    points: 1,
    stem: "2+2=?",
    options: ["3", "4"],
    answer: 1,
    explanation: "2+2=4。",
    sourceRef: { path: "content/physics/detail/ch01.md", label: "加法" },
  }],
};
const OWNER_BINDING = createHash("sha256").update(`studysolo-review-owner-binding-v1:${OWNER_UUID}`).digest("hex");
function deterministicUuid(value: string) {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    action: "seed-attempt",
    attempt: {
      attemptId: ATTEMPT_ID,
      expectedRevision: 0,
      operationId: OPERATION_ID,
      sourceKind: "static",
      subjectId: "physics",
      categoryId: "detail",
      chapterId: "ch01",
      quizId: "bank:physics/detail/ch01:2026-10-04",
      title: "物理 · 第 1 章",
      quizSetId: null,
      quizData: QUIZ,
      phase: "answering",
      stage: null,
      answers: {},
      currentIndex: 0,
      revealedQuestionIds: [],
      hintsUsed: [],
      selfScores: {},
      completedAt: null,
    },
    ...overrides,
  };
}

function request(method: "GET" | "POST", options: { url?: string; headers?: Record<string, string>; data?: unknown } = {}) {
  return new NextRequest(options.url ?? "http://localhost:35349/api/review/progress", {
    method,
    headers: {
      host: "localhost:35349",
      origin: "http://localhost:35349",
      "sec-fetch-site": "same-origin",
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
      ...(method === "POST" ? { "x-studysolo-owner-binding": OWNER_BINDING } : {}),
      ...options.headers,
    },
    ...(method === "POST" && options.data !== undefined ? { body: JSON.stringify(options.data) } : {}),
  });
}

function authenticate() {
  mocks.verifyAccount.mockResolvedValue({
    kind: "ok",
    identity: {
      user_id: OWNER_UUID,
      email: "private-user@example.invalid",
      active: true,
      mfa_required: false,
      email_verified: true,
      aal: "aal1",
    },
  });
}

function setupQuery() {
  const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown> } = {};
  for (const method of ["select", "eq", "is", "neq", "order", "gt", "or", "limit", "range"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data: mocks.quizSetRow ?? mocks.attemptRow, error: null }));
  chain.then = (resolve, reject) => Promise.resolve({ data: mocks.rows, error: null }).then(resolve, reject);
  mocks.query = chain;
  mocks.from.mockImplementation(() => chain);
}

describe("/api/review/progress", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_URL", "http://localhost:35349");
    vi.clearAllMocks();
    authenticate();
    mocks.bridgeEnabled.mockReturnValue(false);
    mocks.readQuiz.mockReturnValue(QUIZ);
    mocks.rows = [];
    mocks.attemptRow = null;
    mocks.quizSetRow = null;
    mocks.rpc.mockResolvedValue({ data: { status: "saved", attemptId: ATTEMPT_ID, revision: 1, operationId: OPERATION_ID, quizSetId: SET_ID, updatedAt: "2026-10-04T00:00:00.000Z" }, error: null });
    setupQuery();
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it("requires live Account introspection and never accepts request user identity", async () => {
    mocks.verifyAccount.mockResolvedValue({ kind: "signed-out", code: "SESSION_INVALID" });
    const signedOut = await POST(request("POST", { data: body() }));
    expect(signedOut.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();

    authenticate();
    const withIdentity = body({ user_id: "attacker" });
    const rejected = await POST(request("POST", { data: withIdentity }));
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ code: "INVALID_REVIEW_PROGRESS" });
    expect(mocks.verifyAccount).toHaveBeenCalledWith("synthetic-access-token", { accountBackendUrl: "http://127.0.0.1:3041", live: true });
  });

  it("accepts the seed-then-CAS attempt contract and binds the RPC to the live Account UUID", async () => {
    mocks.readQuiz.mockReturnValue(QUIZ);
    const response = await POST(request("POST", { data: body() }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ revision: 1, quizSetId: SET_ID });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("ss_review_quiz_save_attempt", expect.objectContaining({
      p_user_id: OWNER_UUID,
      p_request: expect.objectContaining({
        attemptKind: "quiz",
        attemptId: ATTEMPT_ID,
        expectedRevision: 0,
        operationId: OPERATION_ID,
        phase: "answering",
        quizData: QUIZ,
      }),
    }));
    expect(mocks.rpc.mock.calls[0][1].p_request.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an old-owner candidate when auth fetch now carries a different live Account token", async () => {
    mocks.verifyAccount.mockResolvedValue({
      kind: "ok",
      identity: { user_id: "2bf2f7c5-1316-493a-9df8-92aa57c19970", email: "private-user@example.invalid", active: true, mfa_required: false, email_verified: true, aal: "aal1" },
    });
    const response = await POST(request("POST", { data: body() }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "REVIEW_OWNER_CHANGED" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("replays an explicit legacy import with the same operation hash and keeps it summary-only", async () => {
    const importId = "b6bdb72f-f7c7-4a54-87c1-82ec78b682db";
    const entry = {
      subjectId: "physics", categoryId: "detail", chapterId: "ch01", title: "Physics · ch01",
      progress: { best: 80, attempts: 2, last: { earned: 8, max: 10, percent: 80, completedAt: "2026-10-04T00:00:00.000Z", stage: "final" } },
    };
    const data = { action: "import-legacy", importId, entry };
    const first = await POST(request("POST", { data }));
    expect(first.status).toBe(200);
    const operationId = deterministicUuid(`${OWNER_UUID}|legacy-import|${importId}|physics|detail|ch01`);
    expect(mocks.rpc.mock.calls[0][1].p_request).toMatchObject({
      expectedRevision: 0,
      operationId,
      attemptKind: "legacy-summary",
      sourceKind: "legacy-import",
      phase: "summary",
    });

    mocks.attemptRow = { revision: 1, operation_id: operationId };
    const retry = await POST(request("POST", { data }));
    expect(retry.status).toBe(200);
    expect(mocks.rpc.mock.calls[1][1].p_request.expectedRevision).toBe(0);
    expect(mocks.rpc.mock.calls[1][1].p_request).toEqual(mocks.rpc.mock.calls[0][1].p_request);
  });

  it("recomputes objective correctness server-side and keeps subjective scores unscored", async () => {
    const saveAttempt: Record<string, unknown> = { ...body().attempt };
    delete saveAttempt.quizData;
    saveAttempt.quizSetId = SET_ID;
    const wrongBody = body({
      action: "save-attempt",
      attempt: {
        ...saveAttempt,
        expectedRevision: 1,
        phase: "summary",
        stage: "final",
        answers: { q1: 0 },
        revealedQuestionIds: ["q1"],
      },
    });
    mocks.quizSetRow = {
      id: SET_ID,
      quiz_key: "set-key",
      content_hash: "a".repeat(64),
      source_kind: "static",
      subject_id: "physics",
      category_id: "detail",
      chapter_id: "ch01",
      quiz_id: "bank:physics/detail/ch01:2026-10-04",
      title: "物理 · 第 1 章",
      quiz_data: QUIZ,
    };
    const response = await POST(request("POST", { data: wrongBody }));
    expect(response.status).toBe(200);
    const rpcInput = mocks.rpc.mock.calls[0][1].p_request;
    expect(rpcInput.score).toMatchObject({ earned: 0, max: 1, percent: 0, objectiveCount: 1, correctCount: 0 });
    expect(rpcInput.questionResults[0]).toMatchObject({ id: "q1", correct: false, objective: true });

    const subjective = { ...QUIZ, questions: [{ ...QUIZ.questions[0], id: "essay", type: "essay", answer: "参考答案" }] };
    const essayAttemptId = "759c9b15-06ec-4d78-9e8b-271a9bb34c32";
    const essaySeed = body({
      action: "seed-attempt",
      attempt: { ...body().attempt, attemptId: essayAttemptId, operationId: "529b1e3d-b014-4866-908b-6a3d5c4f88a0", quizId: "essay-set", title: "主观题", quizData: subjective },
    });
    mocks.readQuiz.mockReturnValue(subjective);
    const seeded = await POST(request("POST", { data: essaySeed }));
    expect(seeded.status).toBe(200);
    mocks.quizSetRow = {
      id: SET_ID,
      quiz_key: "essay-set-key",
      content_hash: "b".repeat(64),
      source_kind: "static",
      subject_id: "physics",
      category_id: "detail",
      chapter_id: "ch01",
      quiz_id: "essay-set",
      title: "主观题",
      quiz_data: subjective,
    };
    const essaySave = body({
      action: "save-attempt",
      attempt: {
        ...essaySeed.attempt,
        expectedRevision: 1,
        operationId: "93ef234f-a784-4660-b2ad-cf9270f52a7f",
        quizSetId: SET_ID,
        phase: "summary",
        stage: "final",
        revealedQuestionIds: ["essay"],
      },
    });
    const subjectiveResponse = await POST(request("POST", { data: essaySave }));
    expect(subjectiveResponse.status).toBe(200);
    const subjectiveResult = mocks.rpc.mock.calls.at(-1)![1].p_request;
    expect(subjectiveResult.score).toMatchObject({ percent: null, objectiveCount: 0, correctCount: 0 });
    expect(subjectiveResult.questionResults[0]).toMatchObject({ correct: null, objective: false, scored: false });
  });

  it("rejects cross-origin requests before live identity or database access", async () => {
    const response = await POST(request("POST", { data: body(), headers: { origin: "https://attacker.invalid" } }));
    expect(response.status).toBe(403);
    expect(mocks.verifyAccount).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("accepts a fixed public origin behind an internal Next URL but ignores forwarded-host claims", async () => {
    vi.stubEnv("APP_URL", "https://studysolo.1037solo.com");
    const response = await POST(request("POST", {
      url: "http://127.0.0.1:35349/api/review/progress/",
      headers: { host: "studysolo.1037solo.com", origin: "https://studysolo.1037solo.com", "x-forwarded-host": "attacker.invalid" },
      data: body(),
    }));
    expect(response.status).toBe(200);
  });

  it("returns owner-filtered resume content with its stored quiz snapshot", async () => {
    mocks.attemptRow = {
      id: SET_ID,
      attempt_id: ATTEMPT_ID,
      attempt_kind: "quiz",
      quiz_set_id: SET_ID,
      source_kind: "static",
      subject_id: "physics",
      category_id: "detail",
      chapter_id: "ch01",
      quiz_id: "bank:physics/detail/ch01:2026-10-04",
      title: "物理 · 第 1 章",
      phase: "answering",
      stage: null,
      answers: {},
      current_index: 0,
      revealed_question_ids: [],
      hints_used: [],
      self_scores: {},
      question_results: [],
      earned: 0,
      max_score: 0,
      percent: null,
      objective_count: 0,
      correct_count: 0,
      legacy_data: null,
      revision: 1,
      operation_id: OPERATION_ID,
      completed_at: null,
      created_at: "2026-10-04T00:00:00.000Z",
      updated_at: "2026-10-04T00:00:00.000Z",
    };
    mocks.rows = [mocks.attemptRow];
    mocks.quizSetRow = {
      id: SET_ID,
      quiz_key: "set-key",
      content_hash: "a".repeat(64),
      source_kind: "static",
      subject_id: "physics",
      category_id: "detail",
      chapter_id: "ch01",
      quiz_id: "bank:physics/detail/ch01:2026-10-04",
      title: "物理 · 第 1 章",
      quiz_data: QUIZ,
    };
    const response = await GET(request("GET", { url: "http://localhost:35349/api/review/progress?view=resume&sourceKind=static&subjectId=physics&categoryId=detail&chapterId=ch01" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ attemptId: ATTEMPT_ID, quizData: QUIZ, sourceKind: "static" });
    expect(mocks.query.eq).toHaveBeenCalledWith("user_id", OWNER_UUID);
  });

  it("rejects identity query fields and paginates only bounded metadata", async () => {
    const bad = await GET(request("GET", { url: "http://localhost:35349/api/review/progress?view=summary&user_id=other" }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ code: "UNKNOWN_QUERY_FIELD" });

    mocks.rows = Array.from({ length: 3 }, (_, i) => ({ id: `00000000-0000-4000-8000-00000000000${i + 1}`, attempt_id: ATTEMPT_ID, user_id: "must-not-leak", attempt_kind: "quiz", source_kind: "static", subject_id: "physics", chapter_id: "ch01", category_id: "detail", quiz_id: "q", title: "Quiz", phase: "summary", stage: "final", earned: 1, max_score: 1, percent: 100, objective_count: 1, correct_count: 1, revision: 1, operation_id: OPERATION_ID, completed_at: "2026-10-04T00:00:00.000Z", created_at: "2026-10-04T00:00:00.000Z", updated_at: "2026-10-04T00:00:00.000Z" }));
    const page = await GET(request("GET", { url: "http://localhost:35349/api/review/progress?view=summary&limit=2" }));
    expect(page.status).toBe(200);
    const value = await page.json();
    expect(value.rows).toHaveLength(2);
    expect(value.nextCursor).toBe(mocks.rows[1].id);
    expect(JSON.stringify(value)).not.toContain("must-not-leak");
    mocks.attemptRow = { created_at: "2026-10-03T12:00:00.000Z" };
    const next = await GET(request("GET", { url: `http://localhost:35349/api/review/progress?view=attempts&limit=2&cursor=${value.nextCursor}` }));
    expect(next.status).toBe(200);
    expect(mocks.query.or).toHaveBeenCalledWith(`created_at.lt.2026-10-03T12:00:00.000Z,and(created_at.eq.2026-10-03T12:00:00.000Z,id.lt.${value.nextCursor})`);
  });

  it("returns objective outcome IDs for cross-device wrong-attempt discovery without returning user answers", async () => {
    mocks.rows = [{
      id: "00000000-0000-4000-8000-000000000091",
      attempt_id: ATTEMPT_ID,
      attempt_kind: "quiz",
      source_kind: "review-chapter",
      subject_id: "physics",
      chapter_id: "ch01",
      category_id: "detail",
      quiz_id: "q1",
      title: "Quiz",
      phase: "summary",
      stage: "final",
      question_results: [{ id: "q1", questionKey: "stable-q1", objective: true, correct: false }],
      answers: { q1: 0 },
      earned: 0, max_score: 1, percent: 0, objective_count: 1, correct_count: 0,
      revision: 2, operation_id: OPERATION_ID, completed_at: "2026-10-04T00:00:00.000Z",
      created_at: "2026-10-04T00:00:00.000Z", updated_at: "2026-10-04T00:00:00.000Z",
    }];
    const response = await GET(request("GET", { url: "http://localhost:35349/api/review/progress?view=attempts&limit=1" }));
    expect(response.status).toBe(200);
    const value = await response.json();
    expect(value.rows[0].questionResults).toEqual([{ id: "q1", questionKey: "stable-q1", objective: true, correct: false }]);
    expect(JSON.stringify(value)).not.toContain('"answers"');
    expect(JSON.stringify(value)).not.toContain("q1\":0");
  });

  it("forwards GET and POST only through the fixed desktop bridge and maps bridge errors", async () => {
    const forwarded = new Response("forwarded", { status: 202 });
    mocks.bridgeEnabled.mockReturnValue(true);
    mocks.forwardBridge.mockResolvedValue(forwarded);
    const getRequest = request("GET", { url: "http://localhost:35349/api/review/progress?view=summary" });
    expect(await GET(getRequest)).toBe(forwarded);
    expect(mocks.forwardBridge).toHaveBeenCalledWith(getRequest);
    expect(mocks.verifyAccount).not.toHaveBeenCalled();

    const error = new Error("bridge unavailable");
    const failure = new Response("bridge failed", { status: 503 });
    mocks.forwardBridge.mockRejectedValue(error);
    mocks.sandboxFailure.mockReturnValue(failure);
    expect(await POST(request("POST", { data: body() }))).toBe(failure);
    expect(mocks.sandboxFailure).toHaveBeenCalledWith(error);
  });
});
