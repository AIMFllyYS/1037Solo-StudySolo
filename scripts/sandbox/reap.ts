/** Optional one-shot recovery on a trusted server; no browser target parameters. */
import { maintainExecutions } from "@/lib/sandbox/maintenance.server";

async function main() {
  if (process.env.CLOUD_SANDBOX_ENABLED !== "true") { console.log("sandbox-reaper: execution disabled; provider TTL remains active"); return; }
  console.log(JSON.stringify({ maintenance: "sandbox-reaper", ...await maintainExecutions() }));
}
main().catch(() => { console.error("sandbox-reaper: storage or provider unavailable"); process.exitCode = 1; });
