import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, sep } from "node:path";
import test from "node:test";
import { copyStandaloneShell } from "./standalone-shell.mjs";

test("standalone nested package links become real files while secrets and root dependencies stay out of the shell copy", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "studysolo-shell-copy-"));
  try {
    const source = join(temporaryRoot, "source"), destination = join(temporaryRoot, "stage"), distDir = ".next-desktop-test";
    const packageRoot = join(source, "node_modules", ".pnpm", "sharp-test", "node_modules", "sharp");
    const nestedModules = join(source, distDir, "node_modules");
    mkdirSync(packageRoot, { recursive: true });
    mkdirSync(nestedModules, { recursive: true });
    writeFileSync(join(packageRoot, "index.js"), "module.exports = 'native-package-fixture';");
    writeFileSync(join(source, "server.js"), "server");
    writeFileSync(join(source, "package.json"), "{}");
    writeFileSync(join(source, ".env.local"), "TEST_SECRET=must-not-copy");
    mkdirSync(join(source, distDir, "ignored.segments"), { recursive: true });
    writeFileSync(join(source, distDir, "ignored.segments", "segment.txt"), "excluded");
    symlinkSync(packageRoot, join(nestedModules, "sharp-hash"), process.platform === "win32" ? "junction" : "dir");

    copyStandaloneShell(source, destination, distDir);
    const copiedPackage = join(destination, distDir, "node_modules", "sharp-hash");
    assert.equal(lstatSync(copiedPackage).isSymbolicLink(), false);
    assert.equal(readFileSync(join(copiedPackage, "index.js"), "utf8"), "module.exports = 'native-package-fixture';");
    assert.equal(existsSync(join(destination, "server.js")), true);
    assert.equal(existsSync(join(destination, ".env.local")), false);
    assert.equal(existsSync(join(destination, "node_modules")), false);
    assert.equal(existsSync(join(destination, distDir, "ignored.segments")), false);
  } finally {
    const checked = resolve(temporaryRoot), allowed = resolve(tmpdir()) + sep;
    if (!checked.startsWith(allowed) || !checked.includes("studysolo-shell-copy-")) throw new Error("unsafe temporary cleanup");
    rmSync(checked, { recursive: true, force: true });
  }
});
