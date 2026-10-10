import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Structural checks follow the real shell composition rather than a former single-file layout. */
export function readAppShellSources(): string {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const shell = read("components/layout/AppShell.tsx");
  assert.match(shell, /import TopBar from "\.\/shell\/TopBar"/);
  assert.match(shell, /<TopBar\s/);
  assert.match(shell, /useShellLifecycle\(\{/);
  return [shell, read("components/layout/shell/TopBar.tsx"), read("components/layout/shell/useShellLifecycle.ts")].join("\n");
}
