/** Report tracked source structure and direct dependencies without loading application code. */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.resolve(root, process.argv[2] ?? "docs/plans/project-refactor/verify/inventory.json");
const tracked = execFileSync("git", ["ls-files", "-z", "--", "app", "components", "lib", "classolo", "electron", "scripts"], { cwd: root }).toString().split("\0").filter(Boolean);
const filenames = tracked.filter((file) => /\.(?:ts|tsx|js|mjs|cjs)$/.test(file));
const directories = new Map();
const records = [];
const { config } = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
const { options } = ts.parseJsonConfigFileContent(config, ts.sys, root);
for (const file of filenames) {
  const filename = path.join(root, file);
  const source = readFileSync(filename, "utf8");
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  const runtimeImports = [];
  const typeImports = [];
  const dynamicImports = [];
  const visit = (node) => {
    const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier :
      ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
    if (specifier && ts.isStringLiteralLike(specifier)) {
      const name = specifier.text;
      const resolved = ts.resolveModuleName(name, filename, options, ts.sys).resolvedModule;
      if (resolved && !resolved.isExternalLibraryImport) {
        const dependency = path.relative(root, resolved.resolvedFileName).replaceAll("\\", "/");
        imports.push(dependency);
        const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
        const bindings = clause?.namedBindings;
        const onlyTypes = ts.isExportDeclaration(node) ? node.isTypeOnly : clause?.isTypeOnly ||
          (!clause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly));
        if (ts.isCallExpression(node)) dynamicImports.push(dependency);
        else if (onlyTypes) typeImports.push(dependency);
        else runtimeImports.push(dependency);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const directory = path.posix.dirname(file);
  directories.set(directory, (directories.get(directory) ?? 0) + 1);
  const classification = /\.test\.|\.spec\./.test(file) ? "test" : /generated|\.registry-data\./.test(file) ? "generated" : "source";
  records.push({ file, lines: source.split(/\r?\n/).length, bytes: Buffer.byteLength(source), classification, client: /^\s*["']use client["']/m.test(source), serverOnly: /import\s+["']server-only["']/.test(source), imports: [...new Set(imports)], runtimeImports: [...new Set(runtimeImports)], typeImports: [...new Set(typeImports)], dynamicImports: [...new Set(dynamicImports)] });
}
const graph = new Map(records.filter((record) => record.classification === "source").map((record) => [record.file, record.runtimeImports]));
const visited = new Set();
const visiting = new Set();
const stack = [];
const cycles = [];
const walk = (file) => {
  if (visiting.has(file)) { cycles.push([...stack.slice(stack.indexOf(file)), file]); return; }
  if (visited.has(file)) return;
  visiting.add(file); stack.push(file);
  for (const dependency of graph.get(file) ?? []) if (graph.has(dependency)) walk(dependency);
  stack.pop(); visiting.delete(file); visited.add(file);
};
for (const file of graph.keys()) walk(file);
const authored = records.filter((record) => record.classification === "source");
const report = {
  generatedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim(),
  note: "Tracked-file snapshot; uncommitted new files are excluded until staged. Length is a review signal, not proof of mixed responsibility. Cycles are eager runtime import paths; type-only and lazy imports are reported separately.",
  counts: { files: records.length, source: authored.length, over500: authored.filter((record) => record.lines > 500).length, over800: authored.filter((record) => record.lines > 800).length },
  crowdedDirectories: [...directories].map(([directory, files]) => ({ directory, files })).sort((a, b) => b.files - a.files),
  largestSources: [...authored].sort((a, b) => b.lines - a.lines).slice(0, 100),
  cycles,
  files: records,
};
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${path.relative(root, output)}\n${JSON.stringify(report.counts)}\nStatic import cycles: ${cycles.length}\n`);
