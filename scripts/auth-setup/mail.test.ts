import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "./paths";
import { hasOtpToken, mailBlob, redactOtp } from "./mail";

test("auth setup helper paths still address the repository independently of the CLI location", () => {
  assert.equal(path.resolve(ROOT), path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
});

test("OTP proof redacts six-to-eight-digit tokens and retains ordinary surrounding text", () => {
  const safe = redactOtp("Your code is 123456; second code 987654; other 1234567 / 12345678; id 123456789.");
  assert.ok(!safe.includes("123456;"));
  assert.ok(!safe.includes("987654"));
  assert.ok(!safe.includes("1234567 /"));
  assert.ok(!safe.includes("12345678;"));
  assert.ok(safe.includes("Your code is "));
  assert.ok(safe.includes("123456789"));
});

test("mail proof examines subject, text and raw content without accepting a longer numeric identifier", () => {
  const plain = { from: "sender@example.invalid", subject: "Sign in", text: "tracking 123456789", raw: "" };
  assert.equal(hasOtpToken(plain), false);
  assert.equal(hasOtpToken({ ...plain, raw: "code 654321" }), true);
  assert.ok(mailBlob({ ...plain, subject: "code 654321" }).includes("code 654321"));
});
