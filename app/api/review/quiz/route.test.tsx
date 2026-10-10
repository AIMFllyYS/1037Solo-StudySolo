import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const OWNER = "4a7524bd-101d-4419-a5e9-74f37f8e0001";
const ATTEMPT = "e6843916-e6b7-4db2-8b25-95d54a01d4b4";
const SET = "c1162871-5824-455a-b7d2-e2c5bf98b120";
const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  verifyAccount: vi.fn(),
  quota: vi.fn(),
  settle: vi.fn(),
  resolveQuota: vi.fn(),
  from: vi.fn(),
  tableData: {} as Record<string, Array<Record<string, unknown>>>,
  readMaterial: vi.fn(),
  resolveModel: vi.fn(),
}));

vi.mock("@/lib/billing/settlement/paidRequest", () => ({ withPaidRequest: (handler: (request: NextRequest) => unknown) => handler }));
vi.mock("@/lib/billing/quota/quotaGate", () => ({ assertQuotaAvailable: mocks.quota, resolveQuotaUserId: mocks.resolveQuota }));
vi.mock("@/lib/billing/ledger/usageLedger", () => ({ settleUsage: mocks.settle, resolveActualBillingModelId: () => "fixture-model" }));
vi.mock("@/lib/billing/usagePool", () => ({ resolveMainModelPool: () => null, usedPlatformCredentialsForProvider: () => false }));
vi.mock("@/lib/ai/provider", () => ({ ENV_MODEL_PRO: "fixture-model" }));
vi.mock("@/lib/ai/models", () => ({ getModelInfo: () => ({ contextK: 64 }) }));
vi.mock("@/lib/ai/sdk/languageModel", () => ({ resolveLanguageModel: mocks.resolveModel }));
vi.mock("@/lib/ai/agent/tools/createQuiz/tool", () => ({ createCreateQuizTool: () => ({ description: "Create a structured quiz" }) }));
vi.mock("@/lib/ai/observability/agentLog", () => ({ logSatelliteError: vi.fn() }));
vi.mock("ai", () => ({ generateText: mocks.generateText, stepCountIs: () => () => true }));
vi.mock("@/lib/content/loader", () => ({ readContentSearchText: mocks.readMaterial }));
vi.mock("@/lib/auth/authMode", () => ({ accountBackendUrl: () => "http://127.0.0.1:3041", authModeForRequest: () => "account-local" }));
vi.mock("@/lib/auth/sessions/sessionCookie", () => ({ extractAccessToken: () => "synthetic-access-token" }));
vi.mock("@/lib/auth/sign-in/account-verify", () => ({
  failureStatus: () => 401,
  verifyAccount: mocks.verifyAccount,
}));
vi.mock("@/lib/auth/server/serviceClient", () => ({ createServiceAuthClient: () => ({ from: mocks.from }) }));

import { POST } from "./route";

const question = {
  id: "q1",
  type: "single_choice",
  difficulty: "basic",
  source: "current_chapter",
  points: 1,
  stem: "氧化数上升代表什么？",
  options: ["得到电子", "失去电子"],
  answer: 1,
  explanation: "失电子，氧化数上升。",
  sourceRef: { path: "content/chemistry/detail/ch01.md", label: "氧化还原" },
};

function mockDb() {
  mocks.from.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "order", "limit", "range"]) chain[method] = vi.fn(() => chain);
    chain.eq = vi.fn((key: string, value: unknown) => { filters[key] = value; return chain; });
    chain.is = vi.fn((key: string, value: unknown) => { filters[key] = value; return chain; });
    chain.in = vi.fn((key: string, value: unknown[]) => { filters[`${key}:in`] = value; return chain; });
    const matches = (row: Record<string, unknown>) => Object.entries(filters).every(([key, value]) => {
      if (key.endsWith(":in")) return (value as unknown[]).includes(row[key.slice(0, -3)]);
      return row[key] === value;
    });
    chain.maybeSingle = vi.fn(async () => ({ data: (mocks.tableData[table] ?? []).find(matches) ?? null, error: null }));
    chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const rows = (mocks.tableData[table] ?? []).filter(matches);
      return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve, reject);
    };
    return chain;
  });
}

function request(source: unknown) {
  return new NextRequest("http://localhost:35349/api/review/quiz", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:35349", origin: "http://localhost:35349" },
    body: JSON.stringify({ source }),
  });
}

const generated = {
  quizId: "quiz_fixture",
  title: "基于资料的练习",
  intent: "practice",
  questions: [question],
  droppedCount: 0,
};

describe("/api/review/quiz grounded generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tableData = {};
    mocks.resolveQuota.mockResolvedValue(OWNER);
    mocks.quota.mockResolvedValue({ ok: true });
    mocks.settle.mockResolvedValue(undefined);
    mocks.verifyAccount.mockResolvedValue({ kind: "ok", identity: { user_id: OWNER, mfa_required: false } });
    mocks.resolveModel.mockReturnValue({ model: { id: "model" }, provider: { configured: true } });
    mocks.readMaterial.mockReturnValue({ text: "真实资料：氧化数升高对应失电子，降低对应得电子。", format: "markdown" });
    mocks.generateText.mockResolvedValue({
      totalUsage: { inputTokens: 10, outputTokens: 10 },
      toolResults: [{ toolName: "createQuiz", output: generated }],
    });
    mockDb();
  });

  it("loads the selected chapter's real material and reports conservative coverage", async () => {
    const response = await POST(request({ kind: "chapter", subjectId: "chemistry", categoryId: "detail", chapterId: "ch01" }) as never);
    expect(response.status).toBe(200);
    expect(mocks.readMaterial).toHaveBeenCalledWith("chemistry", "detail", "ch01");
    const call = mocks.generateText.mock.calls[0][0];
    expect(call.prompt).toContain("真实资料：氧化数升高对应失电子");
    expect(call.prompt).toContain("真实学习资料");
    expect(call.prompt).not.toContain("仅根据章节名称");
    expect(mocks.quota).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect((await response.json()).contextCoverage.estimate).toContain("cjk");
  });

  it("refuses to generate by a chapter label when actual material is missing", async () => {
    mocks.readMaterial.mockReturnValue(null);
    const response = await POST(request({ kind: "chapter", subjectId: "chemistry", categoryId: "detail", chapterId: "ch404" }) as never);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "REVIEW_SOURCE_MATERIAL_UNAVAILABLE" });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("loads classroom transcripts and outline by the live Account UUID and session ID", async () => {
    const sessionId = "79c0dbca-18de-4e74-a942-0f765d56b903";
    mocks.tableData.ss_class_sessions = [{ id: sessionId, user_id: OWNER, title: "导数课堂", archived_at: null, payload: {} }];
    mocks.tableData.ss_class_transcripts = [{ user_id: OWNER, session_id: sessionId, seq: 1, payload: { text: "老师讲到：可导一定连续。" } }];
    mocks.tableData.ss_class_outlines = [{ user_id: OWNER, session_id: sessionId, payload: { nodes: [{ title: "可导与连续" }] } }];
    const response = await POST(request({ kind: "classroom", sessionId }) as never);
    expect(response.status).toBe(200);
    const prompt = String(mocks.generateText.mock.calls[0][0].prompt);
    expect(prompt).toContain("可导一定连续");
    expect(prompt).toContain("可导与连续");
    expect(mocks.from.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([
      "ss_class_sessions", "ss_class_transcripts", "ss_class_outlines",
    ]));
    expect(mocks.verifyAccount).toHaveBeenCalled();
  });

  it("does not pretend a weak chapter summary is an original wrong-question context", async () => {
    const response = await POST(request({
      kind: "wrong", attemptIds: [], localQuestions: [], hasMoreAttemptRecords: false, omittedLocalQuestionCount: 0,
      weakPoints: [{ subjectId: "chemistry", categoryId: "detail", chapterId: "ch01", accuracy: 35, wrongCount: 2, answeredCount: 3 }],
      omittedWeakPointCount: 0,
    }) as never);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "REVIEW_NO_WRONG_CONTEXT" });
    expect(mocks.readMaterial).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("loads the original owner-scoped snapshot, answer, source reference and historical miss count", async () => {
    mocks.tableData.ss_review_quiz_attempts = [{
      user_id: OWNER,
      attempt_id: ATTEMPT,
      attempt_kind: "quiz",
      quiz_set_id: SET,
      quiz_id: "quiz-1",
      title: "化学小测",
      answers: { q1: 0 },
      updated_at: "2026-10-04T00:00:00.000Z",
      completed_at: "2026-10-04T00:00:00.000Z",
      question_results: [{ id: "q1", questionKey: "stable:q1", objective: true, correct: false }],
    }];
    mocks.tableData.ss_review_quiz_sets = [{
      user_id: OWNER, id: SET, content_hash: "a".repeat(64),
      quiz_data: { questions: [question] },
    }];
    const response = await POST(request({
      kind: "wrong", attemptIds: [ATTEMPT], localQuestions: [], hasMoreAttemptRecords: false, omittedLocalQuestionCount: 0,
      weakPoints: [], omittedWeakPointCount: 0,
    }) as never);
    const responseBody = await response.json();
    expect(response.status, JSON.stringify(responseBody)).toBe(200);
    const prompt = String(mocks.generateText.mock.calls[0][0].prompt);
    expect(prompt).toContain(question.stem);
    expect(prompt).toContain(question.sourceRef.path);
    expect(prompt).toContain('"latestWrongAnswer":0');
    expect(prompt).toContain("historicalWrongAttempts");
    expect(mocks.verifyAccount).toHaveBeenCalled();
  });

  it("does not send a historical miss when a newer objective attempt got the same stable question right", async () => {
    const olderAttempt = "e6843916-e6b7-4db2-8b25-95d54a01d4b4";
    const latestAttempt = "9096ec3d-6524-4f48-ae8f-3b5a6c7d8e90";
    mocks.tableData.ss_review_quiz_attempts = [
      {
        user_id: OWNER, attempt_id: olderAttempt, attempt_kind: "quiz", quiz_set_id: SET, quiz_id: "quiz-1", title: "第一次",
        answers: { q1: 0 }, updated_at: "2026-10-03T00:00:00.000Z", completed_at: "2026-10-03T00:00:00.000Z",
        question_results: [{ id: "q1", questionKey: "stable:q1", objective: true, correct: false }],
      },
      {
        user_id: OWNER, attempt_id: latestAttempt, attempt_kind: "quiz", quiz_set_id: SET, quiz_id: "quiz-1", title: "复习后答对",
        answers: { q1: 1 }, updated_at: "2026-10-04T00:00:00.000Z", completed_at: "2026-10-04T00:00:00.000Z",
        question_results: [{ id: "q1", questionKey: "stable:q1", objective: true, correct: true }],
      },
    ];
    mocks.tableData.ss_review_quiz_sets = [{ user_id: OWNER, id: SET, content_hash: "a".repeat(64), quiz_data: { questions: [question] } }];
    const response = await POST(request({
      kind: "wrong", attemptIds: [olderAttempt, latestAttempt], localQuestions: [], hasMoreAttemptRecords: false,
      omittedLocalQuestionCount: 0, weakPoints: [], omittedWeakPointCount: 0,
    }) as never);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "REVIEW_NO_WRONG_CONTEXT" });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
