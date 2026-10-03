import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyAccount: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  desktopBridgeEnabled: vi.fn(() => false),
  forwardDesktopRequest: vi.fn(),
  sandboxFailure: vi.fn(),
  query: {
    update: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  },
}));

vi.mock("@/lib/auth/authMode", () => ({
  accountBackendUrl: vi.fn(() => "http://127.0.0.1:3041"),
  authModeForRequest: vi.fn(() => "account-local"),
}));
vi.mock("@/lib/auth/sessionCookie", () => ({ extractAccessToken: vi.fn(() => "synthetic-access-token") }));
vi.mock("@/lib/auth/sign-in/account-verify", () => ({
  failureStatus: (result: { kind: string }) => result.kind === "signed-out" ? 401 : result.kind === "forbidden" ? 403 : 503,
  verifyAccount: mocks.verifyAccount,
}));
vi.mock("@/lib/auth/rateLimit", () => ({ consumeRateLimit: vi.fn(() => ({ ok: true, remaining: 29 })) }));
vi.mock("@/lib/auth/serviceClient", () => ({
  createServiceAuthClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/sandbox/desktop-bridge.server", () => ({
  desktopCloudBridgeEnabled: mocks.desktopBridgeEnabled,
  forwardDesktopAgentRequest: mocks.forwardDesktopRequest,
}));
vi.mock("@/lib/sandbox/config.server", () => ({ sandboxFailure: mocks.sandboxFailure }));

import { POST } from "./route";

const OWNER_UUID = "4a7524bd-101d-4419-a5e9-74f37f8e0001";
const FEEDBACK_UUID = "e6843916-e6b7-4db2-8b25-95d54a01d4b4";

function request(body: unknown, options: { url?: string; headers?: Record<string, string> } = {}) {
  const url = options.url ?? "http://localhost:35349/api/feedback/chat";
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:35349",
      host: "localhost:35349",
      "sec-fetch-site": "same-origin",
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
}

function authenticated() {
  mocks.verifyAccount.mockResolvedValue({
    kind: "ok",
    identity: {
      user_id: OWNER_UUID,
      email: "verified-user@example.invalid",
      active: true,
      mfa_required: false,
      email_verified: true,
      aal: "aal1",
    },
  });
}

describe("POST /api/feedback/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue(mocks.query);
    mocks.query.update.mockReturnValue(mocks.query);
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
    mocks.query.maybeSingle.mockResolvedValue({ data: { id: FEEDBACK_UUID, feedback_type: "like", revision: 2, status: "open" }, error: null });
    mocks.rpc.mockResolvedValue({ data: { id: FEEDBACK_UUID, feedback_type: "like", revision: 1, status: "open" }, error: null });
    mocks.desktopBridgeEnabled.mockReturnValue(false);
  });

  it("fails closed without an Account session", async () => {
    mocks.verifyAccount.mockResolvedValue({ kind: "signed-out", code: "SESSION_INVALID" });
    const response = await POST(request({ action: "vote", sessionId: "session-a", messageId: "message-a", vote: "like" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "SESSION_INVALID" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects caller identity fields and binds a vote to the Account UUID", async () => {
    authenticated();
    const bad = await POST(request({ action: "vote", sessionId: "session-a", messageId: "message-a", vote: "like", user_id: "attacker" }));
    expect(bad.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();

    const response = await POST(request({ action: "vote", sessionId: "session-a", messageId: "message-a", vote: "like" }));
    expect(response.status).toBe(200);
    expect(mocks.verifyAccount).toHaveBeenCalledWith("synthetic-access-token", { accountBackendUrl: "http://127.0.0.1:3041", live: true });
    expect(mocks.rpc).toHaveBeenCalledWith("ss_chat_feedback_vote", {
      p_user_uuid: OWNER_UUID,
      p_session_id: "session-a",
      p_message_id: "message-a",
      p_vote: "like",
    });
    expect(await response.json()).toEqual({
      id: FEEDBACK_UUID,
      feedbackType: "like",
      revision: 1,
      status: "open",
      reportReason: null,
      feedbackText: null,
      answerExcerpt: null,
    });
  });

  it("accepts Next's localhost URL normalization for an actual loopback Host and Origin", async () => {
    authenticated();
    const response = await POST(request({ action: "vote", sessionId: "session-a", messageId: "message-a", vote: "like" }, {
      headers: { host: "127.0.0.1:35349", origin: "http://127.0.0.1:35349" },
    }));
    expect(response.status).toBe(200);
  });

  it("rejects a cross-site Origin or Host mismatch before Account or storage access", async () => {
    authenticated();
    const body = { action: "vote", sessionId: "session-a", messageId: "message-a", vote: "like" };
    const crossSite = await POST(request(body, { headers: { origin: "https://attacker.invalid" } }));
    expect(crossSite.status).toBe(403);
    const hostMismatch = await POST(request(body, { headers: { host: "attacker.invalid" } }));
    expect(hostMismatch.status).toBe(403);
    expect(mocks.verifyAccount).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("forwards only through the enabled desktop feedback bridge", async () => {
    const forwarded = new Response("forwarded", { status: 202 });
    mocks.desktopBridgeEnabled.mockReturnValue(true);
    mocks.forwardDesktopRequest.mockResolvedValue(forwarded);
    const req = request({ action: "vote", sessionId: "session-a", messageId: "message-a", vote: "like" });
    expect(await POST(req)).toBe(forwarded);
    expect(mocks.forwardDesktopRequest).toHaveBeenCalledWith(req);
    expect(mocks.verifyAccount).not.toHaveBeenCalled();
  });

  it("maps desktop bridge failures through the sandbox error response", async () => {
    const error = new Error("bridge unavailable");
    const failure = new Response("bridge failed", { status: 503 });
    mocks.desktopBridgeEnabled.mockReturnValue(true);
    mocks.forwardDesktopRequest.mockRejectedValue(error);
    mocks.sandboxFailure.mockReturnValue(failure);
    const response = await POST(request({ action: "vote", sessionId: "session-a", messageId: "message-a", vote: "like" }));
    expect(response).toBe(failure);
    expect(mocks.sandboxFailure).toHaveBeenCalledWith(error);
  });

  it("routes a same-user vote switch through the unique message vote slot", async () => {
    authenticated();
    mocks.rpc
      .mockResolvedValueOnce({ data: { id: FEEDBACK_UUID, feedback_type: "like", revision: 1, status: "open" }, error: null })
      .mockResolvedValueOnce({ data: { id: FEEDBACK_UUID, feedback_type: "dislike", revision: 2, status: "open" }, error: null });
    await POST(request({ action: "vote", sessionId: "session-a", messageId: "message-a", vote: "like" }));
    const switched = await POST(request({ action: "vote", sessionId: "session-a", messageId: "message-a", vote: "dislike" }));
    expect(switched.status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "ss_chat_feedback_vote", {
      p_user_uuid: OWNER_UUID,
      p_session_id: "session-a",
      p_message_id: "message-a",
      p_vote: "dislike",
    });
  });

  it("stores only an opt-in redacted excerpt with a report reason", async () => {
    authenticated();
    mocks.rpc.mockResolvedValue({ data: { id: FEEDBACK_UUID, feedback_type: "report", revision: 1, status: "open" }, error: null });
    const response = await POST(request({
      action: "report",
      sessionId: "session-a",
      messageId: "message-a",
      reason: "privacy",
      feedbackText: "举报说明含 user@example.invalid 和 Bearer synthetic-secret-token",
      answerExcerpt: "Contact user@example.invalid with Bearer synthetic-secret-token",
    }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("ss_chat_feedback_report", {
      p_user_uuid: OWNER_UUID,
      p_session_id: "session-a",
      p_message_id: "message-a",
      p_reason: "privacy",
      p_feedback_text: "举报说明含 [邮箱已隐藏] 和 [凭证已隐藏]",
      p_answer_excerpt: "Contact [邮箱已隐藏] with [凭证已隐藏]",
    });
  });

  it("requires a matching server row revision before attaching a vote excerpt", async () => {
    authenticated();
    mocks.from.mockReturnValue(mocks.query);
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await POST(request({
      action: "update-details",
      feedbackId: FEEDBACK_UUID,
      vote: "like",
      revision: 1,
      feedbackText: "",
      answerExcerpt: "Short answer excerpt",
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "FEEDBACK_STALE" });
    expect(mocks.query.eq).toHaveBeenCalledWith("user_uuid", OWNER_UUID);
    expect(mocks.query.eq).toHaveBeenCalledWith("revision", 1);
  });

  it("saves a one-character vote explanation while retaining report minimum length", async () => {
    authenticated();
    const saved = await POST(request({
      action: "update-details",
      feedbackId: FEEDBACK_UUID,
      vote: "like",
      revision: 1,
      feedbackText: "好",
      answerExcerpt: null,
    }));
    expect(saved.status).toBe(200);
    expect(mocks.query.update).toHaveBeenCalledWith(expect.objectContaining({ feedback_text: "好", answer_excerpt: null }));

    const report = await POST(request({
      action: "report",
      sessionId: "session-a",
      messageId: "message-a",
      reason: "other",
      feedbackText: "好",
    }));
    expect(report.status).toBe(400);
    expect(await report.json()).toEqual({ code: "FEEDBACK_TEXT_REQUIRED" });
  });
});
