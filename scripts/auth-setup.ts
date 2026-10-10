/**
 * Apply / inspect Supabase Auth custom SMTP and prove signup trigger.
 *
 *   npx tsx scripts/auth-setup.ts status
 *   npx tsx scripts/auth-setup.ts apply-smtp
 *   npx tsx scripts/auth-setup.ts verify-trigger
 *   npx tsx scripts/auth-setup.ts verify-otp
 *
 * Reads .env.local. Never prints SMTP password or API keys.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserAuthClient } from "../lib/auth/browser/browserClient.ts";
import { resolveManagementAuthEnv, resolveSmtpEnv } from "../lib/auth/env.ts";
import { requestEmailOtp, type OtpRequestResult } from "../lib/auth/sessions/otp.ts";
import { createServiceAuthClient } from "../lib/auth/server/serviceClient.ts";
import {
  applyAuthSmtpConfig,
  collectDirectMailDeliveryTraces,
  fetchAuthConfig,
  isAliyunDirectMailSmtp,
  type AuthConfigSnapshot,
} from "../lib/auth/provisioning/smtpConfig.ts";
import {
  SIGNUP_GRANT_AMOUNT_CNY,
  SIGNUP_GRANT_SOURCE,
  isAuthUserId,
  probeSignupEmail,
  verifySignupTriggerOnce,
} from "../lib/auth/provisioning/signupTrigger.ts";
import { createManagementApiExecutor } from "../lib/db/migrate.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (process.env[k] == null) process.env[k] = v;
    }
  } catch {
    console.warn("warning: .env.local not found");
  }
}

function printSnapshot(label: string, snapshot: AuthConfigSnapshot) {
  console.log(label);
  console.log(`  smtpHost: ${snapshot.smtpHost || "(empty = Supabase default)"}`);
  console.log(`  smtpPort: ${snapshot.smtpPort}`);
  console.log(`  smtpUser: ${snapshot.smtpUser}`);
  console.log(`  smtpSenderName: ${snapshot.smtpSenderName}`);
  console.log(`  smtpAdminEmail: ${snapshot.smtpAdminEmail}`);
  console.log(`  smtpMaxFrequency: ${snapshot.smtpMaxFrequency}`);
  console.log(`  mailerOtpExp: ${snapshot.mailerOtpExp}`);
  console.log(`  externalEmailEnabled: ${snapshot.externalEmailEnabled}`);
  console.log(`  mailerAutoconfirm: ${snapshot.mailerAutoconfirm}`);
  console.log(`  customSmtpEnabled: ${snapshot.customSmtpEnabled}`);
  console.log(`  aliyunDirectMail: ${isAliyunDirectMailSmtp(snapshot)}`);
}

async function cmdStatus() {
  const mgmt = resolveManagementAuthEnv();
  const snapshot = await fetchAuthConfig(mgmt);
  printSnapshot("auth config", snapshot);
}

async function cmdApplySmtp() {
  const mgmt = resolveManagementAuthEnv();
  const smtp = resolveSmtpEnv();
  const applied = await applyAuthSmtpConfig({ ...mgmt, smtp });
  printSnapshot("auth config after PATCH", applied);
  const readback = await fetchAuthConfig(mgmt);
  printSnapshot("auth config GET readback", readback);
  if (!isAliyunDirectMailSmtp(readback)) {
    throw new Error("Custom SMTP readback is not Aliyun DirectMail");
  }
}

function countFromRows(rows: Array<Record<string, unknown>>): number {
  const n = rows[0]?.n ?? rows[0]?.count;
  return Number(n ?? rows.length);
}

async function cmdVerifyTrigger() {
  const mgmt = resolveManagementAuthEnv();
  const service = createServiceAuthClient();
  const sql = createManagementApiExecutor(mgmt);
  const email = probeSignupEmail();

  const proof = await verifySignupTriggerOnce(
    {
      async createUser(probeEmail) {
        const { data, error } = await service.auth.admin.createUser({
          email: probeEmail,
          email_confirm: true,
        });
        if (error || !data.user?.id) {
          throw new Error(error?.message ?? "admin.createUser returned no user");
        }
        return { id: data.user.id };
      },
      async deleteUser(id) {
        const { error } = await service.auth.admin.deleteUser(id);
        if (error) throw new Error(error.message);
      },
    },
    {
      async countAppUsers(userId) {
        if (!isAuthUserId(userId)) throw new Error("refusing non-UUID user id");
        return countFromRows(
          await sql.query(`select count(*)::int as n from public.app_users where id = '${userId}'`),
        );
      },
      async countQuotaGrants(userId) {
        if (!isAuthUserId(userId)) throw new Error("refusing non-UUID user id");
        const rows = await sql.query<{ n?: number; source?: string; amount_cny?: string }>(
          `select count(*)::int as n, min(source) as source, min(amount_cny)::text as amount_cny
           from public.quota_grants where user_id = '${userId}'`,
        );
        const row = rows[0];
        if (row?.source && row.source !== SIGNUP_GRANT_SOURCE) {
          throw new Error(`quota_grants.source=${row.source}`);
        }
        if (row?.amount_cny && Number(row.amount_cny) !== SIGNUP_GRANT_AMOUNT_CNY) {
          throw new Error(`quota_grants.amount_cny=${row.amount_cny}`);
        }
        return countFromRows(rows);
      },
    },
    email,
  );

  const leftover = await sql.query<{ n?: number; auth_users?: number; app_users?: number; quota_grants?: number }>(
    `select
       (select count(*)::int from auth.users where id = '${proof.userId}') as auth_users,
       (select count(*)::int from public.app_users where id = '${proof.userId}') as app_users,
       (select count(*)::int from public.quota_grants where user_id = '${proof.userId}') as quota_grants`,
  );
  const left = leftover[0] ?? {};

  console.log("signup trigger");
  console.log(`  email: ${proof.email}`);
  console.log(`  userId: ${proof.userId}`);
  console.log(`  appUsers: ${proof.appUsers}`);
  console.log(`  quotaGrants: ${proof.quotaGrants}`);
  console.log(`  cleanedUp: ${proof.cleanedUp}`);
  console.log(`  leftoverAuthUsers: ${left.auth_users ?? left.n ?? "?"}`);
  console.log(`  leftoverAppUsers: ${left.app_users ?? "?"}`);
  console.log(`  leftoverQuotaGrants: ${left.quota_grants ?? "?"}`);
  if (Number(left.auth_users) !== 0 || Number(left.app_users) !== 0 || Number(left.quota_grants) !== 0) {
    throw new Error("probe user leftover rows remain");
  }
}

interface DisposableInbox {
  provider: string;
  email: string;
  fetchMessages: () => Promise<DeliveredMail[]>;
}

interface DeliveredMail {
  from: string;
  subject: string;
  text: string;
  raw: string;
}

const OTP_POLL_MS = 45_000;
const OTP_POLL_INTERVAL_MS = 3_000;
const OTP_RETRY_GAP_MS = 65_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redactOtp(text: string): string {
  return text.replace(/\b\d{6,8}\b/g, "******");
}

function mailBlob(mail: DeliveredMail): string {
  return `${mail.from}\n${mail.subject}\n${mail.text}\n${mail.raw}`;
}

function hasOtpToken(mail: DeliveredMail): boolean {
  return /\b\d{6,8}\b/.test(mailBlob(mail));
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function jsonFetch(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${url} ${res.status}: ${text.slice(0, 240)}`);
  }
  return body;
}

async function openMailTmInbox(): Promise<DisposableInbox> {
  const domains = (await jsonFetch("https://api.mail.tm/domains")) as {
    "hydra:member"?: Array<{ domain?: string }>;
  };
  const domain = domains["hydra:member"]?.[0]?.domain;
  if (!domain) throw new Error("mail.tm: no domain");
  const email = `issue61otp${Date.now()}@${domain}`;
  const password = `otp-${Date.now()}-Aa1`;
  await jsonFetch("https://api.mail.tm/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: email, password }),
  });
  const tokenBody = (await jsonFetch("https://api.mail.tm/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: email, password }),
  })) as { token?: string };
  if (!tokenBody.token) throw new Error("mail.tm: no token");
  const auth = { Authorization: `Bearer ${tokenBody.token}` };
  return {
    provider: "mail.tm",
    email,
    async fetchMessages() {
      const list = (await jsonFetch("https://api.mail.tm/messages", { headers: auth })) as {
        "hydra:member"?: Array<{ id?: string; from?: { address?: string; name?: string }; subject?: string }>;
      };
      const out: DeliveredMail[] = [];
      for (const item of list["hydra:member"] ?? []) {
        if (!item.id) continue;
        const detail = (await jsonFetch(`https://api.mail.tm/messages/${item.id}`, {
          headers: auth,
        })) as {
          from?: { address?: string; name?: string };
          subject?: string;
          text?: string;
          html?: string;
        };
        let raw = "";
        try {
          const source = await jsonFetch(`https://api.mail.tm/sources/${item.id}`, { headers: auth });
          raw = typeof source === "string" ? source : JSON.stringify(source);
        } catch {
          raw = String(detail.html ?? "");
        }
        const fromAddr = detail.from?.address ?? item.from?.address ?? "";
        const fromName = detail.from?.name ?? item.from?.name ?? "";
        out.push({
          from: fromName ? `${fromName} <${fromAddr}>` : fromAddr,
          subject: detail.subject ?? item.subject ?? "",
          text: String(detail.text ?? ""),
          raw,
        });
      }
      return out;
    },
  };
}

async function openTempmailLolInbox(): Promise<DisposableInbox> {
  const created = (await jsonFetch("https://api.tempmail.lol/v2/inbox/create", {
    method: "POST",
  })) as { address?: string; token?: string };
  if (!created.address || !created.token) throw new Error("tempmail.lol: no inbox");
  return {
    provider: "tempmail.lol",
    email: created.address,
    async fetchMessages() {
      const inbox = (await jsonFetch(
        `https://api.tempmail.lol/v2/inbox?token=${encodeURIComponent(created.token!)}`,
      )) as {
        emails?: Array<{
          from?: string;
          subject?: string;
          body?: string;
          html?: string;
          raw?: string;
          headers?: unknown;
        }>;
      };
      return (inbox.emails ?? []).map((mail) => ({
        from: String(mail.from ?? ""),
        subject: String(mail.subject ?? ""),
        text: String(mail.body ?? ""),
        raw: [mail.raw, mail.html, JSON.stringify(mail.headers ?? {})].filter(Boolean).join("\n"),
      }));
    },
  };
}

async function openGuerrillaInbox(): Promise<DisposableInbox> {
  const created = (await jsonFetch(
    "https://api.guerrillamail.com/ajax.php?f=get_email_address",
  )) as { email_addr?: string; sid_token?: string };
  if (!created.email_addr || !created.sid_token) throw new Error("guerrilla: no inbox");
  const sid = created.sid_token;
  return {
    provider: "guerrillamail",
    email: created.email_addr,
    async fetchMessages() {
      const checked = (await jsonFetch(
        `https://api.guerrillamail.com/ajax.php?f=check_email&sid_token=${encodeURIComponent(sid)}&seq=0`,
      )) as { list?: Array<{ mail_id?: string; mail_from?: string; mail_subject?: string }> };
      const out: DeliveredMail[] = [];
      for (const item of checked.list ?? []) {
        if (!item.mail_id || item.mail_id === "0") continue;
        const detail = (await jsonFetch(
          `https://api.guerrillamail.com/ajax.php?f=fetch_email&sid_token=${encodeURIComponent(sid)}&email_id=${encodeURIComponent(item.mail_id)}`,
        )) as { mail_from?: string; mail_subject?: string; mail_body?: string; mail_source?: string };
        out.push({
          from: String(detail.mail_from ?? item.mail_from ?? ""),
          subject: String(detail.mail_subject ?? item.mail_subject ?? ""),
          text: String(detail.mail_body ?? ""),
          raw: String(detail.mail_source ?? detail.mail_body ?? ""),
        });
      }
      return out;
    },
  };
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

async function cmdVerifyOtp() {
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

async function main() {
  loadEnvLocal();
  const cmd = process.argv[2] ?? "status";
  if (cmd === "status") await cmdStatus();
  else if (cmd === "apply-smtp") await cmdApplySmtp();
  else if (cmd === "verify-trigger") await cmdVerifyTrigger();
  else if (cmd === "verify-otp") await cmdVerifyOtp();
  else {
    console.error("usage: auth-setup.ts <status|apply-smtp|verify-trigger|verify-otp>");
    process.exit(2);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
