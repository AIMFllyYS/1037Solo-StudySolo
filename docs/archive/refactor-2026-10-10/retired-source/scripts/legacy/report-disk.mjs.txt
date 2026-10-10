// Build-time disk diagnostic.
// Runs AFTER `next build`, right BEFORE EdgeOne's opennext plugin copies
// .next/standalone -> .edgeone/cloud-functions/ssr-node (the step that ENOSPCs).
// Goal: capture the REAL build-container disk budget + per-dir usage, so we stop
// guessing. The historical "64MB /dev/shm" figure was assumed, never measured.
// Never throws: instrumentation must not break the build.
import { execSync } from "node:child_process";

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
  } catch (e) {
    return `${(e.stdout || "").toString()}${(e.stderr || "").toString()}\n[report-disk] (command failed: ${cmd})`;
  }
}

const bar = "=".repeat(64);
console.log(`\n${bar}`);
console.log("[report-disk] BUILD-CONTAINER DISK SNAPSHOT (pre cloud-function copy)");
console.log(bar);
console.log("--- df -h (capacity + free space of every mount, incl /dev/shm) ---");
console.log(sh("df -h"));
console.log("\n--- du -sh of the heavy paths (sorted) ---");
console.log(
  sh(
    "du -sh .next .next/cache .next/server .next/static .next/standalone .next/standalone/node_modules node_modules content public 2>/dev/null | sort -h"
  )
);
console.log("\n--- working dir total ---");
console.log(sh("du -sh . 2>/dev/null"));
console.log(`${bar}`);
console.log("[report-disk] end snapshot");
console.log(`${bar}\n`);
