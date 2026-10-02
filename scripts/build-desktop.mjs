// Builds the Gailvlun desktop app end-to-end:
//   1. `next build` in standalone mode (BUILD_STANDALONE=1 flips next.config).
//   2. Copy the pieces Next standalone does NOT include by itself:
//        .next/static, public/, and the FULL content/ (incl. search .index
//        and examples) -> into .next/standalone/ for full offline use.
//   3. Run electron-builder to produce the portable .exe + NSIS installer.
//
// Run via: pnpm run desktop:build
// Archived legacy implementation. The package entry now uses the verified
// non-destructive staging builder; accidental direct runs must not clear old packages.
if (!process.argv.includes("--legacy-destructive")) {
  throw new Error("Legacy desktop builder is disabled. Use npm run desktop:build for isolated staging.");
}
import { execSync, spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync, cpSync, readFileSync } from "node:fs";
import net from "node:net";
import http from "node:http";
import path from "node:path";
import os from "node:os";

const SA = ".next/standalone";

// Remove Next 16 per-segment prefetch caches (`*.segments/`) — ~278MB of redundant
// RSC duplicates the desktop server doesn't need (soft-nav falls back to the full
// .rsc). Shrinks the exe and speeds portable extraction. Pages are unaffected.
function stripSegmentCaches(root) {
  let n = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = `${d}/${e.name}`;
      if (e.name.endsWith(".segments")) {
        rmSync(full, { recursive: true, force: true });
        n++;
      } else {
        walk(full);
      }
    }
  };
  walk(root);
  console.log(`[build-desktop] stripped ${n} *.segments/ prefetch caches`);
}

function run(cmd, extraEnv = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...extraEnv } });
}

// Windows-robust recursive copy. robocopy overwrites the read-only files Next's
// trace already placed in the standalone (node's cpSync throws EIO on those).
// robocopy exit codes 0-7 are success; >=8 is a real failure.
function copyInto(src, destWin) {
  if (!existsSync(src)) {
    console.warn(`[build-desktop] skip missing: ${src}`);
    return;
  }
  const srcWin = src.replace(/\//g, "\\");
  console.log(`[build-desktop] robocopy ${srcWin} -> ${destWin}`);
  try {
    execSync(`robocopy "${srcWin}" "${destWin}" /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1`, {
      stdio: "inherit",
    });
  } catch (e) {
    const code = typeof e.status === "number" ? e.status : 16;
    if (code >= 8) throw new Error(`robocopy failed (exit ${code}) for ${src}`);
  }
}

// ".pnpm" dir name -> package name. "next@16.2.9_..." -> "next";
// "@swc+helpers@0.5.15" -> "@swc/helpers"; "react-dom@19.2.7_react@19.2.7" -> "react-dom".
function pkgNameFromPnpmDir(d) {
  if (d.startsWith("@")) {
    const plus = d.indexOf("+");
    if (plus === -1) return null;
    const scope = d.slice(0, plus);
    const rest = d.slice(plus + 1);
    const at = rest.indexOf("@");
    return at === -1 ? null : `${scope}/${rest.slice(0, at)}`;
  }
  const at = d.indexOf("@");
  return at === -1 ? null : d.slice(0, at);
}

// ROOT CAUSE of the "Next 服务启动超时" failure has TWO layers, both fixed:
//   (1) electron-builder's DEFAULT ignore `!**/node_modules/**` strips node_modules from
//       extraResources entirely -> packaged app had NO node_modules -> server.js dies on
//       require('next') -> port never opens -> timeout. Fixed in electron-builder.yml by a
//       SECOND extraResources entry rooted AT node_modules (its relative paths contain no
//       'node_modules' segment, so the ignore doesn't match).
//   (2) Under pnpm the standalone node_modules is also a SYMLINK farm (top-level next/
//       react are ABSOLUTE symlinks into the repo .pnpm) — unreliable to copy on Windows.
//       A naive deref-to-flat copy breaks resolution (a package's deps are SIBLINGS in
//       .pnpm, not nested). Fixed here by HOISTING each .pnpm primary to top-level as real
//       files, then dropping the redundant .pnpm store -> flat, relocatable, symlink-free.
// Both are required. (Verified: packaged standalone boots & serves `/` HTTP 200; ~18MB.)
function materializeNodeModules(saDir) {
  const nm = `${saDir}/node_modules`;
  const pnpm = `${nm}/.pnpm`;
  if (!existsSync(pnpm)) {
    console.error("[build-desktop] standalone node_modules/.pnpm missing — aborting.");
    process.exit(1);
  }
  console.log("[build-desktop] hoisting standalone node_modules (.pnpm -> flat real files)…");
  // Drop the top-level symlinks (next/react/react-dom) so real dirs can take their place.
  for (const e of readdirSync(nm)) {
    if (e === ".pnpm") continue;
    rmSync(`${nm}/${e}`, { recursive: true, force: true });
  }
  let hoisted = 0;
  for (const d of readdirSync(pnpm)) {
    if (d === "node_modules") continue; // pnpm's own hoist dir, not a package
    const name = pkgNameFromPnpmDir(d);
    if (!name) continue;
    const src = `${pnpm}/${d}/node_modules/${name}`;
    if (!existsSync(src)) continue;
    cpSync(src, `${nm}/${name}`, { recursive: true, dereference: true });
    hoisted++;
  }
  rmSync(pnpm, { recursive: true, force: true }); // redundant once everything is flat
  if (!existsSync(`${nm}/next/package.json`)) {
    console.error("[build-desktop] hoist sanity check failed: node_modules/next absent.");
    process.exit(1);
  }
  console.log(`[build-desktop] hoisted ${hoisted} packages; node_modules is now flat real files.`);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function pingStatus(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(0));
  });
}

// Boot the materialized standalone with `node server.js` and confirm it serves `/`
// BEFORE packaging. This is the permanent guard against the missing/broken-node_modules
// class of bug: if the standalone can't self-host here, the desktop app never could.
async function smokeTestStandalone(saDir) {
  const port = await getFreePort();
  console.log(`[build-desktop] smoke-testing standalone on 127.0.0.1:${port}…`);
  const child = spawn(process.execPath, ["server.js"], {
    cwd: saDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      // dummy key so nothing reading env at boot throws; the `/` route needs none.
      AI_API_KEY: process.env.AI_API_KEY || "smoke-test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderrTail = "";
  let exitCode = null;
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => { stderrTail = (stderrTail + d.toString()).slice(-4000); });
  child.on("exit", (code) => { exitCode = code; });

  const start = Date.now();
  const TIMEOUT_MS = 45000;
  let ok = false;
  while (Date.now() - start < TIMEOUT_MS) {
    if (exitCode !== null) break;
    if ((await pingStatus(port)) > 0) { ok = true; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { child.kill(); } catch {}

  if (!ok) {
    console.error("[build-desktop] standalone smoke test FAILED — server did not serve / in time.");
    if (exitCode !== null) console.error(`[build-desktop] server exited early with code ${exitCode}.`);
    if (stderrTail.trim()) console.error("[build-desktop] server stderr tail:\n" + stderrTail.trim());
    process.exit(1);
  }
  console.log("[build-desktop] smoke test passed — standalone serves / OK.");
}

// After packaging, confirm the real node_modules made it into the unpacked resources.
function assertPackagedDeps() {
  const p = "dist-desktop/win-unpacked/resources/standalone/node_modules/next/package.json";
  if (!existsSync(p)) {
    console.error(`[build-desktop] post-pack check FAILED: ${p} missing — packaged app would not start.`);
    process.exit(1);
  }
  console.log("[build-desktop] post-pack check OK — packaged standalone has real node_modules/next.");
}

// Optional basic (self-signed) code signing. If a local cert exists OUTSIDE the repo
// (%LOCALAPPDATA%\Gailvlun\codesign.pfx + codesign.pwd), electron-builder signs the
// portable + installer with it (signtool, RFC3161-timestamped). The cert & password are
// NEVER committed — absent them the build is simply unsigned (prior behavior). An explicit
// CSC_LINK in the environment always wins.
function resolveSigning() {
  if (process.env.CSC_LINK) return {};
  const dir = path.join(process.env.LOCALAPPDATA || os.homedir(), "Gailvlun");
  const pfx = path.join(dir, "codesign.pfx");
  const pwd = path.join(dir, "codesign.pwd");
  if (existsSync(pfx) && existsSync(pwd)) {
    console.log("[build-desktop] code-signing: local self-signed cert found (kept outside repo) — will sign.");
    return { CSC_LINK: pfx, CSC_KEY_PASSWORD: readFileSync(pwd, "utf8").trim() };
  }
  console.log("[build-desktop] code-signing: no local cert — building UNSIGNED.");
  return {};
}

// 0. Regenerate derived assets the app/package imports (normally prebuild steps; we call
//    `next build` directly, so run them explicitly here): script-id manifest + app icons.
run("npx tsx scripts/gen-nav-manifest.ts");
run("npx tsx scripts/check-registry-consistency.ts");
run("pnpm run compile:search-worker");
run("node scripts/gen-script-ids.mjs");
run("node scripts/gen-icon.mjs");

// 0a. Clear any prior dist-desktop before next build. lib/content/loader.ts uses dynamic
//     paths, so Next's NFT trace follows them and would otherwise copy the entire project
//     root — including prior build artifacts (multi-GB old exes in dist-desktop/) — into
//     .next/standalone/, ballooning the packaged exe past GitHub's 2GB upload limit.
//     Removing dist-desktop pre-build gives NFT nothing to trace; electron-builder
//     recreates it as the output dir. This does NOT touch node_modules or content.
if (existsSync("dist-desktop")) {
  console.log("[build-desktop] clearing prior dist-desktop (prevents NFT trace pollution)…");
  rmSync("dist-desktop", { recursive: true, force: true });
}

// 1. Standalone production build. NEXT_PUBLIC_VIDEO_CDN_BASE is inlined here.
run("pnpm exec next build", {
  BUILD_STANDALONE: "1",
  NEXT_PUBLIC_VIDEO_CDN_BASE:
    process.env.NEXT_PUBLIC_VIDEO_CDN_BASE ||
    "https://qimo1b-1392708216.cos.ap-nanjing.myqcloud.com",
});

if (!existsSync(`${SA}/server.js`)) {
  console.error("[build-desktop] standalone server.js not produced — aborting.");
  process.exit(1);
}

// 2. Bring in the runtime assets Next standalone omits / may exclude.
//    (Content is largely placed by the trace already; robocopy fills the rest:
//     the search .index, examples, etc. — overwriting read-only files safely.)
copyInto(".next/static", ".next\\standalone\\.next\\static");
copyInto("public", ".next\\standalone\\public");
copyInto("content", ".next\\standalone\\content");
copyInto("runtime/search-worker", ".next\\standalone\\runtime\\search-worker");

// 2a. Prune directories Next's NFT trace may have pulled into standalone that must NOT
//     ship in the exe (dist-desktop prior artifacts, .git, caches, manim render output).
//     Belt-and-suspenders alongside the pre-build clear above; does NOT touch node_modules
//     (handled by materializeNodeModules) or content. Without this the packaged exe can
//     balloon past GitHub's 2GB upload limit.
//     manim/ contains Python source + render intermediates (media_*/partial_movie_files/*.mp4)
//     with paths approaching NSIS MAX_PATH (260 chars) — including them causes NSIS to fail
//     with ERR_ELECTRON_BUILDER_CANNOT_EXECUTE. The desktop app reads media via
//     lib/content-data/*.generated.ts + content/, never via manim/ at runtime.
for (const junk of ["dist-desktop", ".git", "node_modules/.cache", "manim"]) {
  const p = `${SA}/${junk}`;
  if (existsSync(p)) {
    console.log(`[build-desktop] pruning NFT-traced junk from standalone: ${junk}`);
    rmSync(p, { recursive: true, force: true });
  }
}

// robocopy copies the whole content/ and public/ trees. PDFs and local videos must not
// ship: they blow the NSIS 2GB mmap limit (`error mmapping datablock`) and videos already
// stream from NEXT_PUBLIC_VIDEO_CDN_BASE. Search index in content/.index stays.
for (const junk of ["content/_raw-src", "content/_raw", "public/media/videos"]) {
  const p = `${SA}/${junk}`;
  if (existsSync(p)) {
    console.log(`[build-desktop] pruning unpackaged source from standalone: ${junk}`);
    rmSync(p, { recursive: true, force: true });
  }
}

// 2b. Trim the redundant segment prefetch caches before packaging.
stripSegmentCaches(`${SA}/.next/server`);

// 2c. Materialize the pnpm-symlinked node_modules into real files so electron-builder
//     ships a self-contained server (root-cause fix for the startup failure).
materializeNodeModules(SA);

// 2d. Prove the standalone actually boots & serves before we spend minutes packaging.
await smokeTestStandalone(SA);

// 3. Package. electron-builder reads electron-builder.yml.
//    electron-builder downloads winCodeSign/nsis helper binaries from GitHub at pack
//    time (even unsigned builds need winCodeSign). On CN networks that GitHub fetch
//    routinely fails with `connect ETIMEDOUT <github-ip>:443` AFTER next build + hoist +
//    smoke test all pass — i.e. minutes of work thrown away at the last step. Default the
//    binaries mirror to npmmirror so packaging is reliable here; an explicit env wins.
//
//    `--publish never` is mandatory: without it electron-builder 26 auto-detects the git
//    remote and tries to publish to GitHub Releases (needs GH_TOKEN). The EXEs are
//    produced and signed BEFORE that publish step, so the build "fails" only at the very
//    end with `GitHub Personal Access Token is not set` — but execSync throws on non-zero
//    exit, so assertPackagedDeps() below never runs. The SOP publishes via `gh release`
//    separately (Step 7), so we explicitly disable electron-builder's own publish here.
run("pnpm exec electron-builder --win --publish never", {
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
    "https://npmmirror.com/mirrors/electron-builder-binaries/",
  ...resolveSigning(),
});

// 3b. Verify the real node_modules survived into the packaged resources.
assertPackagedDeps();

console.log("\n[build-desktop] done. Artifacts in dist-desktop/.");
