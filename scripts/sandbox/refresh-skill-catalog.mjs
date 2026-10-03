import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root = "lib/sandbox/skill-packs";
function files(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap(item => {
    if (item.name.startsWith(".") || item.name === "__pycache__" || item.isSymbolicLink()) throw new Error("Unexpected package file");
    const name = prefix + item.name, file = path.join(directory, item.name);
    return item.isDirectory() ? files(file, `${name}/`) : [{ path: name, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") }];
  });
}
const packages = ["notes-to-handbook", "gb-standard-docx-pdf"].map(id => {
  const entries = files(path.join(root, id));
  return { id, version: "2026.10.04", runtime: "skills-runtime-v1-20261004", source: "My-Skills user-owned package", digest: crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex"), files: entries };
});
fs.writeFileSync(path.join(root, "catalog.json"), JSON.stringify({ packages }, null, 2) + "\n");
console.log(JSON.stringify(packages.map(pack => ({ id: pack.id, fileCount: pack.files.length }))));
