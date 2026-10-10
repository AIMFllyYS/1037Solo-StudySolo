import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { createBrowserAuthClient } from "../../lib/auth/browser/browserClient.ts";
import { resolveManagementAuthEnv, resolveSmtpEnv } from "../../lib/auth/env.ts";
import { requestEmailOtp, type OtpRequestResult } from "../../lib/auth/sessions/otp.ts";
import { createServiceAuthClient } from "../../lib/auth/server/serviceClient.ts";
import { applyAuthSmtpConfig, collectDirectMailDeliveryTraces, isAliyunDirectMailSmtp } from "../../lib/auth/provisioning/smtpConfig.ts";
import { isAuthUserId } from "../../lib/auth/provisioning/signupTrigger.ts";
import { createManagementApiExecutor } from "../../lib/db/migrate.ts";
import { mailBlob, hasOtpToken, sleep, openMailTmInbox, openTempmailLolInbox, openGuerrillaInbox, redactOtp } from "./mail";
import type { DisposableInbox, DeliveredMail } from "./mail";
import { printSnapshot } from "./smtp";
import { ROOT } from "./paths";
const OTP_POLL_MS = 45_000;
const OTP_POLL_INTERVAL_MS = 3_000;
const OTP_RETRY_GAP_MS = 65_000;

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function waitForOtpMail(inbox: DisposableInbox): Promise<DeliveredMail | null> {
  const deadline = Date.now() + OTP_POLL_MS;
  while (Date.now() < deadline) {
    const messages = await inbox.fetchMessages();
    const hit = messages.find((mail) => {
      const blob = mailBlob(mail).toLowerCase();
      return (
        blob.includes("otp") ||
        blob.includes("verification") ||
        blob.includes("verify") ||
        blob.includes("sign-in") ||
        blob.includes("signin") ||
        blob.includes("supabase") ||
        blob.includes("studyreview") ||
        hasOtpToken(mail)
      );
    });
    if (hit) return hit;
    await sleep(OTP_POLL_INTERVAL_MS);
  }
  return null;
}

async function deleteAuthUsersByEmail(email: string): Promise<number> {
  const mgmt = resolveManagementAuthEnv();
  const service = createServiceAuthClient();
  const sql = createManagementApiExecutor(mgmt);
  const rows = await sql.query<{ id?: string }>(
    `select id::text as id from auth.users where lower(email) = lower(${sqlLiteral(email)})`,
  );
  let deleted = 0;
  for (const row of rows) {
    if (!row.id || !isAuthUserId(row.id)) continue;
    const { error } = await service.auth.admin.deleteUser(row.id);
    if (error) throw new Error(error.message);
    deleted += 1;
  }
  return deleted;
}

async function sendOtpToConfirmedInbox(inbox: DisposableInbox): Promise<{
  sent: OtpRequestResult;
  mail: DeliveredMail | null;
}> {
  const service = createServiceAuthClient();
  const created = await service.auth.admin.createUser({
    email: inbox.email,
    email_confirm: true,
  });
  if (created.error && !/already|registered|exists/i.test(created.error.message)) {
    throw new Error(created.error.message);
  }
  const sent = await requestEmailOtp(createBrowserAuthClient(), inbox.email);
  if (!sent.ok) return { sent, mail: null };
  return { sent, mail: await waitForOtpMail(inbox) };
}

export async function cmdVerifyOtp() {
  const smtp = resolveSmtpEnv();
  const mgmt = resolveManagementAuthEnv();
  const snapshot = await applyAuthSmtpConfig({ ...mgmt, smtp });
  printSnapshot("auth config after SMTP/template PATCH", snapshot);
  if (!isAliyunDirectMailSmtp(snapshot)) {
    throw new Error("Custom SMTP is not Aliyun DirectMail; refusing to send OTP");
  }

  const openers = [openMailTmInbox, openTempmailLolInbox, openGuerrillaInbox];
  const attempts: string[] = [];
  let proofMail: DeliveredMail | null = null;
  let usedInbox: DisposableInbox | null = null;
  let requestOk = false;
  let requestMessage = "";

  for (let i = 0; i < openers.length; i += 1) {
    const inbox = await openers[i]();
    usedInbox = inbox;
    await sleep(OTP_RETRY_GAP_MS);
    const { sent, mail } = await sendOtpToConfirmedInbox(inbox);
    requestOk = sent.ok;
    requestMessage = sent.ok ? "ok" : `${sent.code}: ${sent.message}`;
    attempts.push(`${inbox.provider} ${inbox.email} request=${requestMessage}`);
    console.log(`otp send ${inbox.provider} ${inbox.email} ${requestMessage}`);
    await deleteAuthUsersByEmail(inbox.email);
    if (mail) {
      proofMail = mail;
      break;
    }
    attempts.push(`${inbox.provider}: no message in ${OTP_POLL_MS}ms`);
  }

  const haystack = proofMail ? mailBlob(proofMail) : "";
  const traces = collectDirectMailDeliveryTraces(haystack);
  const fromLooksConfigured =
    Boolean(proofMail) &&
    proofMail!.from.toLowerCase().includes(smtp.adminEmail.toLowerCase());
  const hasCode = Boolean(proofMail && hasOtpToken(proofMail));
  const received = Boolean(proofMail);
  const viaDirectMail = traces.length > 0 || fromLooksConfigured;

  const proofPath = join(ROOT, "tmp", "issues", "61-c-delivery.md");
  mkdirSync(dirname(proofPath), { recursive: true });
  writeFileSync(
    proofPath,
    [
      "# #61 OTP delivery proof",
      "",
      `time: ${new Date().toISOString()}`,
      `smtpHost: ${snapshot.smtpHost}`,
      `smtpUser: ${snapshot.smtpUser}`,
      `customSmtpEnabled: ${snapshot.customSmtpEnabled}`,
      `provider: ${usedInbox?.provider ?? "none"}`,
      `recipient: ${usedInbox?.email ?? "none"}`,
      `requestOk: ${requestOk}`,
      `requestMessage: ${requestMessage}`,
      `received: ${received}`,
      `from: ${redactOtp(proofMail?.from ?? "")}`,
      `subject: ${redactOtp(proofMail?.subject ?? "")}`,
      `hasSixDigitCode: ${hasCode}`,
      `fromMatchesSmtpUser: ${fromLooksConfigured}`,
      `directMailTraces: ${traces.join(", ") || "(none)"}`,
      `attempts:`,
      ...attempts.map((line) => `- ${line}`),
      "",
      "bodyPreview:",
      "```",
      redactOtp((proofMail?.text || proofMail?.raw || "").slice(0, 800)),
      "```",
      "",
    ].join("\n"),
    "utf8",
  );

  console.log("otp delivery");
  console.log(`  provider: ${usedInbox?.provider ?? "none"}`);
  console.log(`  email: ${usedInbox?.email ?? "none"}`);
  console.log(`  requestOk: ${requestOk}`);
  console.log(`  received: ${received}`);
  console.log(`  from: ${redactOtp(proofMail?.from ?? "")}`);
  console.log(`  subject: ${redactOtp(proofMail?.subject ?? "")}`);
  console.log(`  hasSixDigitCode: ${hasCode}`);
  console.log(`  fromMatchesSmtpUser: ${fromLooksConfigured}`);
  console.log(`  directMailTraces: ${traces.join(", ") || "(none)"}`);
  console.log(`  proof: ${proofPath}`);
  if (!received || !viaDirectMail) {
    throw new Error("OTP delivery proof missing (not received or not DirectMail)");
  }
}