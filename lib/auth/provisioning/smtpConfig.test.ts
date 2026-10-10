import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMAIL_OTP_EXPIRY_SECONDS,
  EMAIL_OTP_RESEND_INTERVAL_SECONDS,
} from "../sessions/otp.ts";
import {
  AUTH_CONFIG_API_PATH,
  CUSTOM_SMTP_EMAIL_RATE_LIMIT,
  DIRECTMAIL_SMTP_HOSTS,
  MAILER_SUBJECT_CONFIRMATION,
  MAILER_SUBJECT_MAGIC_LINK,
  MAILER_SUBJECT_RECOVERY,
  MAILER_TEMPLATE_CONFIRMATION,
  MAILER_TEMPLATE_MAGIC_LINK,
  MAILER_TEMPLATE_RECOVERY,
  applyAuthSmtpConfig,
  authConfigUrl,
  buildAuthSmtpPatch,
  collectDirectMailDeliveryTraces,
  fetchAuthConfig,
  isAliyunDirectMailSmtp,
  snapshotAuthConfig,
} from "./smtpConfig.ts";

const SAMPLE_SMTP = {
  host: "smtpdm.aliyun.com",
  port: "465",
  user: "verify@example.com",
  pass: "smtp-pass-placeholder",
  senderName: "StudyReview_Platform",
  adminEmail: "verify@example.com",
};

test("buildAuthSmtpPatch writes DirectMail host plus OTP expiry and resend throttle", () => {
  const patch = buildAuthSmtpPatch(SAMPLE_SMTP);
  assert.equal(patch.smtp_host, "smtpdm.aliyun.com");
  assert.equal(patch.smtp_port, "465");
  assert.equal(patch.smtp_user, "verify@example.com");
  assert.equal(patch.smtp_pass, "smtp-pass-placeholder");
  assert.equal(patch.smtp_sender_name, "StudyReview_Platform");
  assert.equal(patch.external_email_enabled, true);
  assert.equal(patch.mailer_autoconfirm, false);
  assert.equal(patch.mailer_otp_exp, EMAIL_OTP_EXPIRY_SECONDS);
  assert.equal(patch.smtp_max_frequency, EMAIL_OTP_RESEND_INTERVAL_SECONDS);
  assert.equal(patch.rate_limit_email_sent, CUSTOM_SMTP_EMAIL_RATE_LIMIT);
  assert.equal(patch.mailer_subjects_magic_link, MAILER_SUBJECT_MAGIC_LINK);
  assert.equal(patch.mailer_subjects_recovery, MAILER_SUBJECT_RECOVERY);
  assert.match(String(patch.mailer_templates_confirmation_content), /\{\{ \.Token \}\}/);
  assert.match(String(patch.mailer_templates_magic_link_content), /\{\{ \.Token \}\}/);
  assert.match(String(patch.mailer_templates_recovery_content), /\{\{ \.Token \}\}/);
  assert.match(String(patch.mailer_templates_recovery_content), /\{\{ \.ConfirmationURL \}\}/);
  assert.ok(MAILER_TEMPLATE_CONFIRMATION.includes("StudySolo"));
  assert.ok(MAILER_TEMPLATE_MAGIC_LINK.includes("StudySolo"));
  assert.ok(MAILER_TEMPLATE_RECOVERY.includes("StudySolo"));
  assert.ok(MAILER_SUBJECT_CONFIRMATION.includes("StudySolo"));
  assert.equal(EMAIL_OTP_EXPIRY_SECONDS, 600);
  assert.equal(EMAIL_OTP_RESEND_INTERVAL_SECONDS, 60);
});

test("snapshot never keeps smtp_pass and DirectMail detection requires aliyun host", () => {
  const snapshot = snapshotAuthConfig({
    smtp_host: "smtpdm.aliyun.com",
    smtp_port: 465,
    smtp_user: "verify@example.com",
    smtp_pass: "should-not-leak",
    smtp_sender_name: "StudyReview_Platform",
    smtp_admin_email: "verify@example.com",
    smtp_max_frequency: 60,
    mailer_otp_exp: 600,
    external_email_enabled: true,
    mailer_autoconfirm: false,
  });
  assert.equal(snapshot.customSmtpEnabled, true);
  assert.equal(isAliyunDirectMailSmtp(snapshot), true);
  assert.equal("smtpPass" in snapshot, false);
  assert.equal(JSON.stringify(snapshot).includes("should-not-leak"), false);

  assert.equal(isAliyunDirectMailSmtp({ smtpHost: "", customSmtpEnabled: false }), false);
  assert.equal(
    isAliyunDirectMailSmtp({ smtpHost: "smtp.supabase.invalid", customSmtpEnabled: true }),
    false,
  );
  assert.ok(DIRECTMAIL_SMTP_HOSTS.includes("smtpdm.aliyun.com"));
  assert.deepEqual(
    collectDirectMailDeliveryTraces(
      "Received: from smtpdm.aliyun.com (AliMail) id aliyun-dm-1",
    ),
    ["smtpdm.aliyun.com", "alimail", "aliyun-dm"],
  );
  assert.deepEqual(collectDirectMailDeliveryTraces("Received: from mail.app.supabase.io"), []);
});

test("fetch/apply Auth config use Management API and omit password from the snapshot", async () => {
  assert.equal(authConfigUrl("abc123"), `https://api.supabase.com/v1/projects/abc123${AUTH_CONFIG_API_PATH}`);

  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        smtp_host: "smtpdm.aliyun.com",
        smtp_user: "verify@example.com",
        smtp_pass: "redacted-should-drop",
        smtp_max_frequency: 60,
        mailer_otp_exp: 600,
        external_email_enabled: true,
      }),
      { status: 200 },
    );
  };

  const fetched = await fetchAuthConfig({
    accessToken: "token",
    projectRef: "abc123",
    fetchImpl,
  });
  assert.equal(fetched.smtpHost, "smtpdm.aliyun.com");
  assert.equal(JSON.stringify(fetched).includes("redacted-should-drop"), false);
  assert.equal(calls[0].init?.method ?? "GET", "GET");

  const applied = await applyAuthSmtpConfig({
    accessToken: "token",
    projectRef: "abc123",
    smtp: SAMPLE_SMTP,
    fetchImpl,
  });
  assert.equal(applied.smtpHost, "smtpdm.aliyun.com");
  assert.equal(calls[1].init?.method, "PATCH");
  const body = JSON.parse(String(calls[1].init?.body));
  assert.equal(body.smtp_host, "smtpdm.aliyun.com");
  assert.equal(body.mailer_otp_exp, 600);
  assert.equal(body.smtp_max_frequency, 60);
});
