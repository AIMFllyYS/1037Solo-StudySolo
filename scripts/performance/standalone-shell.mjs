import { cpSync } from "node:fs";
import { relative } from "node:path";

/** Copy generated server/shell files with real targets for Next's nested package links. */
export function copyStandaloneShell(source, destination, distDir) {
  const allowedTop = new Set(["server.js", "package.json", distDir]);
  cpSync(source, destination, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const rel = relative(source, src);
      if (!rel) return true;
      const parts = rel.split(/[\\/]/);
      return allowedTop.has(parts[0]) && !parts.some((part) => part.endsWith(".segments"));
    },
  });
}
