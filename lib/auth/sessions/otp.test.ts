import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMAIL_OTP_EXPIRY_SECONDS,
  EMAIL_OTP_RESEND_INTERVAL_SECONDS,
  EMAIL_OTP_TYPE,
  canResendEmailOtp,
  isEmailOtpExpired,
  isValidEmail,
  normalizeEmail,
  otpExpiresAtMs,
  requestEmailOtp,
  verifyEmailOtp,
  type AuthOtpClient,
} from "./otp.ts";

function mockClient(opts: {
  signError?: string | null;
  verifyError?: string | null;
  user?: unknown;
  session?: unknown;
}): AuthOtpClient & { signCalls: unknown[]; verifyCalls: unknown[] } {
  const signCalls: unknown[] = [];
  const verifyCalls: unknown[] = [];
  return {
    signCalls,
    verifyCalls,
    auth: {
      async signInWithOtp(args) {
        signCalls.push(args);
        return { error: opts.signError ? { message: opts.signError } : null };
      },
      async verifyOtp(args) {
        verifyCalls.push(args);
        return {
          data: { user: opts.user ?? { id: "u1" }, session: opts.session ?? { access_token: "t" } },
          error: opts.verifyError ? { message: opts.verifyError } : null,
        };
      },
    },
  };
}

test("email OTP expiry is 10 minutes and resend throttle is 60 seconds", () => {
  assert.equal(EMAIL_OTP_EXPIRY_SECONDS, 600);
  assert.equal(EMAIL_OTP_RESEND_INTERVAL_SECONDS, 60);
  assert.equal(EMAIL_OTP_TYPE, "email");

  const sentAt = 1_000_000;
  assert.equal(otpExpiresAtMs(sentAt), sentAt + 600_000);
  assert.equal(isEmailOtpExpired(sentAt, sentAt + 599_999), false);
  assert.equal(isEmailOtpExpired(sentAt, sentAt + 600_000), true);

  assert.equal(canResendEmailOtp(sentAt, sentAt + 59_999), false);
  assert.equal(canResendEmailOtp(sentAt, sentAt + 60_000), true);
});

test("requestEmailOtp normalizes email, creates the user, and maps failures", async () => {
  const client = mockClient({});
  const ok = await requestEmailOtp(client, "  Ada@Example.COM ");
  assert.deepEqual(ok, { ok: true, email: "ada@example.com" });
  assert.deepEqual(client.signCalls[0], {
    email: "ada@example.com",
    options: { shouldCreateUser: true },
  });

  const loginOnly = mockClient({});
  await requestEmailOtp(loginOnly, "ada@example.com", { shouldCreateUser: false });
  assert.deepEqual(loginOnly.signCalls[0], {
    email: "ada@example.com",
    options: { shouldCreateUser: false },
  });

  const bad = await requestEmailOtp(client, "not-an-email");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.code, "invalid_email");

  const failing = mockClient({ signError: "rate limit" });
  const err = await requestEmailOtp(failing, "ada@example.com");
  assert.deepEqual(err, { ok: false, code: "auth_error", message: "rate limit" });
});

test("verifyEmailOtp checks token and uses type=email", async () => {
  const client = mockClient({ user: { id: "u1" }, session: { access_token: "t" } });
  const ok = await verifyEmailOtp(client, "Ada@Example.com", " 123456 ");
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.email, "ada@example.com");
    assert.deepEqual(ok.user, { id: "u1" });
  }
  assert.deepEqual(client.verifyCalls[0], {
    email: "ada@example.com",
    token: "123456",
    type: "email",
  });

  const empty = await verifyEmailOtp(client, "ada@example.com", "   ");
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.code, "invalid_token");

  const failing = mockClient({ verifyError: "Token has expired or is invalid" });
  const err = await verifyEmailOtp(failing, "ada@example.com", "000000");
  assert.equal(err.ok, false);
  if (!err.ok) assert.equal(err.code, "invalid_token");
});

test("normalizeEmail and isValidEmail", () => {
  assert.equal(normalizeEmail("  A@B.com "), "a@b.com");
  assert.equal(isValidEmail("a@b.com"), true);
  assert.equal(isValidEmail("nope"), false);
});

test('OTP response without a session token is not reported as successful login', async () => {
  const result = await verifyEmailOtp(mockClient({ session: {} }), 'ada@example.com', '123456');
  assert.equal(result.ok, false);
});
