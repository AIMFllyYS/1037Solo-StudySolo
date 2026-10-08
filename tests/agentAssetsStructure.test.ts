import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const root = process.cwd();

function readFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("我的资产页：标签顺序、视图切换、搜索与排序都在最右", () => {
  const page = readFile("components/agent/AgentAssetsPage.tsx");
  const catalog = readFile("lib/agent/assetCatalog.ts");

  // 六类顺序固定，标签是「全部 + 类目」
  assert.match(catalog, /export const ASSET_KINDS: readonly AssetKind\[\] = \[/);
  const order = ["note", "flashcard", "document", "artifact", "file", "url"].map((kind) =>
    catalog.indexOf(`  "${kind}",`),
  );
  assert.ok(order.every((index) => index > 0), "六类都要在枚举里");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "枚举顺序＝标签顺序");

  // 「全部」也是同一个渲染分支里的标签，testid 用模板串拼出来
  assert.match(page, /testId: `assets-tab-\$\{tab\.id\}`/);
  assert.match(page, /\{ id: "all", label: "全部", count: counts\.all \}/);
  // 「分享的链接」是独立顶级标签，**不是**第七种 kind：云端分享不参与本机资产的计数与筛选
  assert.match(page, /\{ id: "share", label: t\("share\.assets\.tab"\) \}/);
  assert.match(page, /<SharedLinksPanel \/>/);
  assert.doesNotMatch(catalog, /"share"/, "分享不能混进 ASSET_KINDS");
  assert.match(page, /data-testid="assets-view-grid"/);
  assert.match(page, /data-testid="assets-view-list"/);
  assert.match(page, /testId="assets-search"/);
  assert.match(page, /data-testid="assets-sort"/);
  // 最右工具条：视图切换 → 搜索 → 排序 → 刷新，顺序即布局顺序
  const grid = page.indexOf("assets-view-grid");
  const search = page.indexOf("assets-search");
  const sort = page.indexOf("assets-sort");
  const refresh = page.indexOf("assets-refresh");
  assert.ok(grid < search && search < sort && sort < refresh, "工具条顺序：视图 / 搜索 / 排序 / 刷新");
});

test("卡片是链接到详情路由，不在橱窗里预览内容", () => {
  const card = readFile("components/agent/AgentAssetCard.tsx");
  assert.match(card, /href=\{assetHref\(item\.kind, item\.id\)\}/);
  // 橱窗卡不渲染正文：不出现 iframe / markdown 渲染器
  assert.doesNotMatch(card, /iframe|NoteRenderer|dangerouslySetInnerHTML/);
});

test("详情路由：kind 非法直接 404，未知 id 交给页面空态", () => {
  const route = readFile("app/agent/assets/[kind]/[id]/page.tsx");
  assert.match(route, /parseAssetKind\(kind\)/);
  assert.match(route, /if \(!parsed \|\| !id\) notFound\(\);/);
  assert.match(route, /<AgentAssetDetail kind=\{parsed\} id=\{id\} \/>/);
});

test("本地导入记录：只存路径与元数据，不落内容、不上云", () => {
  const imports = readFile("lib/stores/imports.ts");
  assert.match(imports, /absPath\?: string;/);
  assert.match(imports, /PERSIST_KEYS\.imports/);
  assert.doesNotMatch(imports, /scheduleCloudUpsert|scheduleCloudTombstone/, "导入记录不进云同步");
  assert.doesNotMatch(imports, /content:|dataUrl|base64/, "导入记录不存正文");
  // 三个入口都要记：输入框附件、加号菜单文件、网址
  assert.match(readFile("lib/hooks/useImageAttachments.ts"), /recordImport\(/);
  assert.match(readFile("components/window/WindowTaskbar.tsx"), /registerLocalFile\(/);
  assert.match(readFile('lib/local-files/client.ts'), /recordImport\(/);
  assert.doesNotMatch(readFile('lib/local-files/client.ts'), /uploadCloudFile|writeAssetVersion/);
  assert.match(readFile("components/window/OpenUrlDialog.tsx"), /recordImport\(/);
});

test("项目 chip 只出现在 Agent 中央对话的输入框右下角", () => {
  const chatPanel = readFile("components/chat/ChatPanel.tsx");
  const chatInput = readFile("components/chat/ChatInput.tsx");
  const chip = readFile("components/chat/composer/ProjectPickerChip.tsx");
  assert.match(chatPanel, /showProjectPicker=\{emptyLayout === "agent"\}/);
  assert.match(chatInput, /showProjectPicker\?: boolean;/);
  assert.match(chatInput, /\{showProjectPicker \? <ProjectPickerChip \/> : null\}/);
  // 位置：在发送键之前（输入框右下角）
  assert.ok(
    chatInput.indexOf("<ProjectPickerChip />") < chatInput.indexOf("className=\"chat-input-send\""),
    "chip 排在发送键左侧",
  );
  assert.match(chip, /No Projects/);
  // 文案已迁进 i18n 词典：组件只引用 key，中文原文留在 zh 分片里。
  const zhMenu = readFile("lib/i18n/messages/parts/zh/menu.ts");
  assert.match(chip, /t\("menu\.projectPicker\.add"\)/);
  assert.match(zhMenu, /add: "添加新项目"/);
  assert.match(chip, /t\("menu\.projectPicker\.clear"\)/);
  assert.match(zhMenu, /clear: "不使用项目"/);
  assert.match(readFile("app/styles/prose.css"), /\.chat-input-project-chip \{/);
});

test("资产页与 chip 都读同一份项目推导（不另存状态）", () => {
  assert.match(readFile("components/chat/composer/ProjectPickerChip.tsx"), /from "@\/lib\/agent\/projectViews"/);
  assert.match(readFile("components/layout/AgentConversationSidebar.tsx"), /buildProjectViews/);
});
