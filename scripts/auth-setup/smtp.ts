import { resolveManagementAuthEnv, resolveSmtpEnv } from "../../lib/auth/env.ts";

import { applyAuthSmtpConfig, fetchAuthConfig, isAliyunDirectMailSmtp, type AuthConfigSnapshot } from "../../lib/auth/provisioning/smtpConfig.ts";

export function printSnapshot(label: string, snapshot: AuthConfigSnapshot) {
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

export async function cmdStatus() {
  const mgmt = resolveManagementAuthEnv();
  const snapshot = await fetchAuthConfig(mgmt);
  printSnapshot("auth config", snapshot);
}

export async function cmdApplySmtp() {
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