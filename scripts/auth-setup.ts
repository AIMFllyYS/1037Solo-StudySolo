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
import { loadEnvLocal } from "./auth-setup/paths";
import { cmdStatus, cmdApplySmtp } from "./auth-setup/smtp";
import { cmdVerifyTrigger } from "./auth-setup/trigger";
import { cmdVerifyOtp } from "./auth-setup/otp";
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