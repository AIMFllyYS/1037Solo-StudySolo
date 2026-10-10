import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const root = process.cwd();

function readFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("左栏四行导航：顺序固定，图标取自 lucide 且各不相同，且与划词图标不重样", () => {
  const nav = readFile("components/agent/AgentNavRows.tsx");
  const sidebar = readFile("components/layout/AgentConversationSidebar.tsx");

  // 1) 四行都存在且顺序是 新对话 → 我的资产 → 定时任务 → 插件市场
  const newChat = nav.indexOf("data-testid=\"agent-nav-new-chat\"");
  const navMap = nav.indexOf("{NAV_ROWS.map(");
  assert.ok(newChat > 0 && navMap > newChat, "新对话排在三行路由之前");
  const [assets, scheduled, plugins] = ["assets", "scheduled", "plugins"].map((id) =>
    nav.indexOf(`{ id: "${id}"`),
  );
  assert.ok(assets > 0 && assets < scheduled && scheduled < plugins, "资产 → 定时任务 → 插件市场");
  assert.match(nav, /href: "\/agent\/assets"/);
  assert.match(nav, /href: "\/agent\/scheduled"/);
  assert.match(nav, /href: "\/agent\/plugins"/);
  assert.match(nav, /router\.push\(row\.href\)/);
  assert.doesNotMatch(nav, /openNoteLibrary/, "我的资产不再走笔记库浮窗");

  // 2) 四个图标是四个不同的 lucide 图形（与顶栏 / 菜单同一套线性图标），旧的自绘四件套已清理
  assert.match(nav, /import \{ Blocks, CalendarClock, Library, MessageSquarePlus, type LucideIcon \} from "lucide-react";/);
  assert.match(nav, /icon: Library/);
  assert.match(nav, /icon: CalendarClock/);
  assert.match(nav, /icon: Blocks/);
  assert.match(nav, /<MessageSquarePlus /);
  const icons = readFile("components/icons/AgentIcons.tsx");
  for (const name of ["compose", "assets", "schedule", "plugins"]) {
    assert.doesNotMatch(icons, new RegExp(`data-agent-icon=\"${name}\"`), `${name} 自绘图标应已清理`);
  }
  assert.doesNotMatch(nav, /PenLine|PencilSparklesIcon/, "新对话不要复用划词那支笔");

  // 3) 固定区/滚动区：四行在滚动容器之外，Projects 与 Recents 在之内
  const scrollStart = sidebar.indexOf("data-agent-scroll");
  assert.ok(scrollStart > 0, "滚动的只有 Projects + Recents 那一段");
  assert.ok(sidebar.indexOf("<AgentNavRows") < scrollStart, "四行导航在滚动区之前（固定）");
  assert.ok(sidebar.indexOf("<AgentSectionHeader") > scrollStart, "分组标题在滚动区里");
  assert.ok(sidebar.indexOf("archived-toggle") > scrollStart, "归档开关是固定底部");

  // 4) 搜索与折叠按钮保留在头部的固定条里（文案已迁到 i18n 词典，见 lib/i18n/messages/zh.ts）
  assert.match(sidebar, /title=\{t\("agent\.sidebar\.search"\)\}/);
  assert.match(sidebar, /title=\{t\("agent\.sidebar\.collapse"\)\}/);
  assert.match(sidebar, /<PanelLeftClose size=\{15\} \/>/);
});

test("会话列表：一次 10 条 + 滚动续载，不再是「还有 N 个对话」的 5 条阈值", () => {
  const list = readFile("components/agent/AgentSessionList.tsx");
  const sidebar = readFile("components/layout/AgentConversationSidebar.tsx");
  assert.match(list, /export const SESSION_PAGE_SIZE = 10;/);
  assert.match(list, /setLimit\(\(n\) => n \+ SESSION_PAGE_SIZE\)/);
  assert.match(list, /new IntersectionObserver/);
  assert.match(list, /visible = sessions\.slice\(0, limit\)/);
  assert.match(sidebar, /<AgentSessionList/);
  assert.doesNotMatch(sidebar, /SESSION_PREVIEW_LIMIT|还有 \$\{hidden\} 个/);
});

test("项目体系：两个系统项目不可删、可重命名，重命名同步云端", () => {
  const storage = readFile("lib/storage/chatStorage/manifest.ts");
  const store = readFile("lib/stores/chat/chatHistory/projectActions.ts");
  const menu = readFile("components/agent/AgentPanelMenu.tsx");

  assert.match(storage, /id: 'project-note'/);
  assert.match(storage, /id: 'project-floating'/);
  assert.match(storage, /system: 'note'/);
  assert.match(storage, /system: 'floating'/);
  // 删项目：系统项目直接返回 false，普通项目落 tombstone
  assert.match(store, /if \(!target \|\| isSystemProject\(target\)\) return false;/);
  assert.match(store, /scheduleCloudTombstone\('chat-project', folderId\)/);
  assert.match(store, /scheduleCloudUpsert\('chat-project', folderId\)/);
  // 移动会话要跟着上云
  assert.match(store, /if \(moved\) scheduleCloudUpsert\('chat-session', sessionId\)/);
  // 菜单：系统项目没有删除项；删除对话就地二次确认
  assert.match(menu, /data-testid="session-delete-confirm"/);
  // 文案迁到词典后菜单只引用 key：确认语必须仍在中文真相源里，否则等于丢了文案
  assert.match(menu, /t\("agent\.menu\.deleteSessionConfirm"\)/);
  assert.match(readFile("lib/i18n/messages/zh.ts"), /删除后云端记录一并删除，无法恢复。/);
  assert.match(menu, /target\.folder\.system \? null :/);
});

test("云端同步新增 chat-project：客户端与迁移文件对齐", () => {
  const types = readFile("lib/sync/types.ts");
  const migration = readFile("supabase/migrations/0007_sync_chat_project_kind.sql");
  assert.match(types, /\"chat-session\", \"artifact\", \"document\", \"user-note\", \"review-card\", \"chat-project\"/);
  assert.match(types, /MAX_CHAT_PROJECT_BYTES = 32 \* 1024/);
  assert.match(migration, /'chat-project'/);
  assert.match(migration, /when 'chat-project' then 32768/);
});

test("manifest 只有一个构造入口：云端拉取也必须走 manifestFrom", () => {
  const engine = readFile("lib/sync/stores.ts");
  const store = readFile("lib/stores/chat/chatHistory/manifest.ts");
  // 引擎侧：不再手写字段，全部交给 manifestFrom（它保留 folders / activeProjectId）
  assert.doesNotMatch(engine, /version: 2/);
  assert.match(engine, /saveManifest\(manifestFrom\(state/);
  assert.doesNotMatch(engine, /buildManifest/);
  // store 侧：唯一入口是 manifestOf → manifestFrom
  assert.doesNotMatch(store, /version: 2,/);
  assert.match(store, /return manifestFrom\(state, overrides\);/);
});
