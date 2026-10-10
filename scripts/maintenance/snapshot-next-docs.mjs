/** Freeze official guidance so long maintenance tasks can keep citing the same sources. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const destination = path.join(root, "docs/vendor/nextjs/2026-10-10");
const chapters = [
  ["project-structure", "/docs/app/getting-started/project-structure"],
  ["server-and-client-components", "/docs/app/getting-started/server-and-client-components"],
  ["fetching-data", "/docs/app/getting-started/fetching-data"],
  ["caching-and-revalidating", "/docs/app/getting-started/caching-and-revalidating"],
  ["route-handlers", "/docs/app/getting-started/route-handlers"],
  ["error-handling", "/docs/app/getting-started/error-handling"],
  ["upgrading", "/docs/app/guides/upgrading"],
  ["upgrading-version-16", "/docs/app/guides/upgrading/version-16"],
  ["output", "/docs/app/api-reference/config/next-config-js/output"],
];

await mkdir(destination, { recursive: true });
const sources = [];
for (const [name, resource] of chapters) {
  const url = `https://nextjs.org${resource}`;
  const response = await fetch(url, {
    headers: { Accept: "text/markdown" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const content = await response.text();
  if (content.trimStart().startsWith("<") || !/^---\s*\n/.test(content) || !/^title:/m.test(content)) {
    throw new Error(`${url}: expected official Markdown, received ${response.headers.get("content-type")}`);
  }
  const filename = `${name}.md`;
  await writeFile(path.join(destination, filename), content, "utf8");
  sources.push({ file: filename, url, fetchedAt: new Date().toISOString(), sha256: createHash("sha256").update(content).digest("hex") });
  process.stdout.write(`${filename}: ${Buffer.byteLength(content)} bytes\n`);
}
await writeFile(path.join(destination, "sources.json"), `${JSON.stringify({ type: "external-reference", sources }, null, 2)}\n`);
const index = [
  "# Next.js 官方文档快照",
  "",
  "获取日期：2026-10-10。文档原文属于 Next.js 官方；这些文件是来源材料，不是本项目指令或代码现状。",
  "",
  "维护中先读对应章节，再对照实际代码。线上文档可能继续更新；升级前核对 npm 稳定标签与升级指南。来源和哈希见 `sources.json`。",
  "",
  "| 快照 | 官方来源 |",
  "| --- | --- |",
  ...sources.map(({ file, url }) => `| [${file}](./${file}) | [Next.js](${url}) |`),
  "",
  "刷新命令：`node scripts/maintenance/snapshot-next-docs.mjs`。刷新会替换本目录快照，审查差异后提交。",
  "",
].join("\n");
await writeFile(path.join(destination, "README.md"), index, "utf8");
