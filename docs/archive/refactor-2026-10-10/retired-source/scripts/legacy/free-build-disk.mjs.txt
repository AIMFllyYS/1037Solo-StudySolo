// Shrinks the Next standalone BEFORE EdgeOne's opennext plugin assembles + copies
// it to .edgeone/cloud-functions/ssr-node (the step that ENOSPCs on the 3.2GB
// /dev/shm sandbox).
//
// ROOT CAUSE (measured): the plugin ASSEMBLES `.next/standalone` (~700MB) and then
// COPIES it (another ~700MB). The dominant chunk is `.next/server/app`, where
// Next 16's per-segment prefetch cache (`*.segments/*.segment.rsc`) stores each
// page's RSC payload 2-3x over — ~278MB of pure duplication for this app (see
// vercel/next.js discussion #86320, a known Next 16 build-size regression).
// Because standalone is the DOUBLED term, freeing unrelated working-dir files does
// NOT help (the assembly just re-consumes it); only shrinking standalone itself does.
// Deleting the `.segments` caches reverts navigation to Next-15 behavior (client
// fetches the full `.rsc` on soft-nav instead of per-segment) — a prefetch
// optimization only, pages render/navigate exactly the same.
//
// Runs as the last step of `pnpm run build`, after `next build`, before the plugin.
// SAFETY: only acts inside the EdgeOne build tmpfs (cwd under /dev/shm). On any
// local machine it is a pure no-op. Force-disable with EDGEONE_FREE_DISK=0.
// Deletion uses fs.rmSync (no shell).
import { execFileSync } from "node:child_process";
import { rmSync, existsSync, readdirSync } from "node:fs";

const cwd = process.cwd().replace(/\\/g, "/");
const inEdgeOneBuild = process.platform === "linux" && cwd.includes("/dev/shm");

if (process.env.EDGEONE_FREE_DISK === "0" || !inEdgeOneBuild) {
  console.log(
    `[free-build-disk] skip — not in EdgeOne build tmpfs (cwd=${cwd}, platform=${process.platform}). No files touched.`
  );
  process.exit(0);
}

function sizeOf(path) {
  try {
    // execFileSync: no shell, args passed directly — path is hardcoded regardless.
    return execFileSync("du", ["-sh", path], { encoding: "utf8" }).split("\t")[0].trim();
  } catch {
    return "?";
  }
}

console.log("[free-build-disk] EdgeOne build tmpfs detected — shrinking standalone before copy.");

// ---- PRIMARY LEVER: strip Next 16 per-segment prefetch caches from .next/server ----
// Walk .next/server and remove every directory whose name ends in `.segments`.
function stripSegmentCaches(root) {
  let count = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = `${dir}/${e.name}`;
      if (e.name.endsWith(".segments")) {
        try {
          rmSync(full, { recursive: true, force: true });
          count++;
        } catch (err) {
          console.log(`[free-build-disk]   FAILED to remove ${full}: ${err.message}`);
        }
      } else {
        stack.push(full);
      }
    }
  }
  return count;
}

const serverDir = ".next/server";
if (existsSync(serverDir)) {
  const before = sizeOf(serverDir);
  const n = stripSegmentCaches(serverDir);
  console.log(
    `[free-build-disk]   stripped ${n} *.segments/ caches from ${serverDir} (${before} -> ${sizeOf(serverDir)})`
  );
} else {
  console.log(`[free-build-disk]   ${serverDir}: absent, skipped segment strip`);
}

// ---- SECONDARY: remove build-irrelevant paths for marginal extra headroom ----
const targets = [".next/cache", ".git", "docs", "content/_raw"];
for (const t of targets) {
  if (!existsSync(t)) {
    console.log(`[free-build-disk]   ${t}: absent, skipped`);
    continue;
  }
  const before = sizeOf(t);
  try {
    rmSync(t, { recursive: true, force: true });
    console.log(`[free-build-disk]   removed ${t} (was ${before})`);
  } catch (e) {
    console.log(`[free-build-disk]   FAILED to remove ${t} (${before}): ${e.message}`);
  }
}

// Strip dev-only deps too (cheap, non-fatal). Verified no lib/ runtime code imports
// cos-nodejs-sdk-v5 (build scripts only), so prune --prod is runtime-safe.
try {
  const before = sizeOf("node_modules");
  execFileSync("pnpm", ["prune", "--prod"], { stdio: ["ignore", "ignore", "pipe"] });
  console.log(`[free-build-disk]   pnpm prune --prod: node_modules ${before} -> ${sizeOf("node_modules")}`);
} catch (e) {
  console.log(`[free-build-disk]   pnpm prune --prod skipped (non-fatal): ${e.message}`);
}

console.log("[free-build-disk] done.");
