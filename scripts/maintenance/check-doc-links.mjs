/** Check live repository Markdown links, keeping historical and upstream snapshots separate. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownLinks } from "./markdown-links.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const excluded = ["docs/archive/", "docs/plans/archive/", "docs/design-snapshots/", "docs/vendor/", "docs/refer/dist/"];
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (excluded.some((prefix) => `${relative}/`.startsWith(prefix))) return [];
    if (entry.isDirectory()) return collect(absolute);
    return entry.isFile() && entry.name.endsWith(".md") ? [relative] : [];
  });
}
const files = ["AGENTS.md", "README.md", "README_en.md", ...collect(path.join(root, "docs"))].filter((file) => existsSync(path.join(root, file)));
const broken = [];
let checked = 0;
for (const file of files) {
  const markdown = readFileSync(path.join(root, file), "utf8");
  for (const { target, line } of markdownLinks(markdown)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) continue;
    const local = decodeURIComponent(target.split("#")[0].split("?")[0]);
    if (!local) continue;
    checked += 1;
    if (!existsSync(path.resolve(root, path.dirname(file), local))) {
      broken.push({ file, line, target });
    }
  }
}
const destination = path.join(root, "docs/plans/project-refactor/verify/doc-links.json");
mkdirSync(path.dirname(destination), { recursive: true });
writeFileSync(destination, `${JSON.stringify({ generatedAt: new Date().toISOString(), files: files.length, checked, broken }, null, 2)}\n`);
process.stdout.write(`${files.length} live documents, ${checked} local links, ${broken.length} missing targets\n`);
for (const issue of broken) process.stdout.write(`${issue.file}:${issue.line} ${issue.target}\n`);
process.exitCode = broken.length ? 1 : 0;
