import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PASSWORD_MIN_LENGTH,
  isValidPassword,
  requestPasswordReset,
  signInWithPasswordEmail,
  signUpWithPasswordEmail,
  updateAccountPassword,
  type AuthPasswordClient,
} from "./password.ts";

function mockClient(opts: {
  signInError?: string | null;
  signUpError?: string | null;
  resetError?: string | null;
  updateError?: string | null;
  session?: unknown;
  user?: unknown;
}): AuthPasswordClient & {
  signInCalls: unknown[];
  signUpCalls: unknown[];
  resetCalls: unknown[];
} {
  const signInCalls: unknown[] = [];
  const signUpCalls: unknown[] = [];
  const resetCalls: unknown[] = [];
  return {
    signInCalls,
    signUpCalls,
    resetCalls,
    auth: {
      async signInWithPassword(args) {
        signInCalls.push(args);
        return {
          data: {
            user: opts.user ?? { id: "u1" },
            session: opts.session ?? { access_token: "t" },
          },
          error: opts.signInError ? { message: opts.signInError } : null,
        };
      },
      async signUp(args) {
        signUpCalls.push(args);
        return {
          data: {
            user: opts.user ?? { id: "u1" },
            session: opts.session ?? null,
          },
          error: opts.signUpError ? { message: opts.signUpError } : null,
        };
      },
      async resetPasswordForEmail(email, options) {
        resetCalls.push({ email, options });
        return { error: opts.resetError ? { message: opts.resetError } : null };
      },
      async updateUser() {
        return { data: { user: opts.user ?? { id: "u1" } }, error: opts.updateError ? { message: opts.updateError } : null };
      },
    },
  };
}

test("password length and sign-in normalize email", async () => {
  assert.equal(PASSWORD_MIN_LENGTH, 6);
  assert.equal(isValidPassword("12345"), false);
  assert.equal(isValidPassword("123456"), true);

  const client = mockClient({});
  const ok = await signInWithPasswordEmail(client, "  Ada@Example.COM ", "secret1");
  assert.equal(ok.ok, true);
  assert.deepEqual(client.signInCalls[0], { email: "ada@example.com", password: "secret1" });

  const short = await signInWithPasswordEmail(client, "ada@example.com", "123");
  assert.equal(short.ok, false);
  if (!short.ok) assert.equal(short.code, "invalid_password");
});

test("sign-up requires matching password and may only send mail", async () => {
  const client = mockClient({ session: null });
  const mismatch = await signUpWithPasswordEmail(client, "ada@example.com", "secret1", "secret2");
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.code, "mismatch");

  const mailed = await signUpWithPasswordEmail(
    client,
    "Ada@Example.com",
    "secret1",
    "secret1",
    "https://studysolo.example/login",
  );
  assert.deepEqual(mailed, { ok: true, email: "ada@example.com" });
  assert.deepEqual(client.signUpCalls[0], {
    email: "ada@example.com",
    password: "secret1",
    options: { emailRedirectTo: "https://studysolo.example/login" },
  });
});

test("reset and update password", async () => {
  const client = mockClient({});
  const reset = await requestPasswordReset(client, "Ada@Example.com", "https://app.example/login");
  assert.deepEqual(reset, { ok: true, email: "ada@example.com" });
  assert.deepEqual(client.resetCalls[0], {
    email: "ada@example.com",
    options: { redirectTo: "https://app.example/login" },
  });

  const updated = await updateAccountPassword(client, "newpass1", "newpass1");
  assert.deepEqual(updated, { ok: true, email: "" });

  const bad = await updateAccountPassword(client, "newpass1", "nope");
  assert.equal(bad.ok, false);
});
