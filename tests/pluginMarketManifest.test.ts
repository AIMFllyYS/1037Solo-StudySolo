import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import { parseMarketManifest } from "../lib/plugins/market.ts";
import { parseSkillMarkdown } from "../lib/utils/skillFrontmatter.ts";
import { CONNECTOR_IDS, CONNECTOR_REGISTRY } from "../lib/connectors/registry.ts";

const root = process.cwd();

const manifest = parseMarketManifest(
  JSON.parse(readFileSync(join(root, "public/plugins/market.json"), "utf8")),
);

test("插件市场 manifest：实际连接器齐备、无未接入 CLI、id 唯一与必填字段齐备", () => {
  assert.deepEqual(manifest.mcp.map((entry) => entry.id).sort(), ["kitsolo", ...CONNECTOR_IDS].sort());
  assert.deepEqual(manifest.cli, [], "尚未实现的 CLI 安装目录不展示");
  assert.ok(manifest.skills.length >= 2, "官方 skills 至少 2 个");

  const all = [...manifest.mcp, ...manifest.cli, ...manifest.skills];
  const ids = new Set(all.map((e) => e.id));
  assert.equal(ids.size, all.length, "id 不能重复");

  for (const entry of all) {
    assert.ok(entry.name && entry.tagline && entry.desc, `${entry.id} 缺名称/简介/描述`);
    assert.ok(entry.tags.length > 0, `${entry.id} 至少一个标签`);
    assert.ok(
      entry.homepage === undefined || /^https?:\/\//.test(entry.homepage),
      `${entry.id} homepage 必须是 http(s) 链接`,
    );
  }
});

test("连接器条目：原生 API/导出有实现绑定，远程 MCP 有实际 endpoint", () => {
  for (const entry of manifest.mcp) {
    if (entry.connector) {
      assert.equal(entry.id, entry.connector);
      const binding = CONNECTOR_REGISTRY[entry.connector];
      if (binding.kind === "mcp") assert.equal(entry.url, binding.endpoint);
      else assert.equal(entry.url, undefined, `${entry.id} 不虚构远程 MCP 地址`);
    } else if (entry.transport === "stdio") {
      assert.ok(entry.command, `${entry.id} stdio 缺 command`);
      assert.ok(entry.args && entry.args.length > 0, `${entry.id} stdio 缺 args`);
    } else {
      assert.ok(entry.url && /^https?:\/\//.test(entry.url), `${entry.id} 远端缺 url`);
    }
    for (const env of entry.env ?? []) {
      assert.ok(/^[A-Z][A-Z0-9_]*$/.test(env.name), `${entry.id} env 名 ${env.name} 需全大写`);
      if (env.required) assert.ok(env.desc, `${entry.id}.${env.name} 必填凭证要写用途说明`);
      if (env.keyUrl) assert.match(env.keyUrl, /^https?:\/\//);
    }
  }
});

test("官方 skills：manifest.path 指到仓库内真实存在的 SKILL.md，frontmatter 可解析", () => {
  for (const entry of manifest.skills) {
    assert.ok(entry.path.startsWith("/skills/"), `${entry.id} path 须挂在 /skills/ 下`);
    const file = join(root, "public", entry.path);
    assert.ok(existsSync(file), `${entry.id} 文件不存在：${entry.path}`);
    const parsed = parseSkillMarkdown(readFileSync(file, "utf8"), "SKILL.md");
    assert.ok(parsed.name.trim(), `${entry.id} frontmatter 缺 name`);
    assert.ok(parsed.description.trim(), `${entry.id} frontmatter 缺 description`);
    assert.ok(parsed.content.length > 200, `${entry.id} 正文过短`);
  }
});

test("CLI 条目：install 命令是单行 shell 可拷贝文本；skill-pack 带获取指引", () => {
  for (const entry of manifest.cli) {
    if (entry.install) {
      assert.ok(!entry.install.includes("\r"), `${entry.id} install 不含回车`);
    }
    if (entry.kind === "skill-pack") {
      assert.ok(entry.homepage?.includes("github.com") || entry.install, `${entry.id} skill-pack 要有仓库链接或获取命令`);
    }
  }
});
