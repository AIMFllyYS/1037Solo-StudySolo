import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("左下角坞显示头像和昵称，点击直接打开设置面板（额度折叠在内）", () => {
  const dock = readWorkspaceFile("components/layout/LeftDock.tsx");
  const settings = readWorkspaceFile("components/layout/settings/GlobalSettings.tsx");
  const dialog = readWorkspaceFile("components/layout/AccountDialog.tsx");
  const sidebar = readWorkspaceFile("components/layout/navigation/SubjectSidebar.tsx");
  // 设置页的字面量这一轮搬进了 i18n 词典：组件里断言「引用了哪个 key」，
  // 中文再回中文分片里断言，两边都钉住，文案既不会丢也不会漂。
  const settingsDict = readWorkspaceFile("lib/i18n/messages/parts/zh/settings.ts");

  assert.match(dock, /LeftDockFace/);
  assert.match(dock, /useAccountProfile/);
  assert.match(dock, /aria-expanded/);
  assert.doesNotMatch(dock, /UserDockMenu/);
  assert.match(sidebar, /LeftDock/);
  assert.match(sidebar, /GlobalSettings/);
  assert.doesNotMatch(sidebar, /UserQuotaPanel/);
  assert.match(settings, /title=\{t\("settings\.global\.quota"\)\}/);
  assert.match(settingsDict, /quota: "额度"/);
  assert.match(settings, /data-testid="account-card"/);
  assert.match(settings, /Math\.min\(352/);
  assert.match(settings, /AccountDialog/);
  assert.match(dialog, /t\("settings\.account\.localOnly"\)/);
  assert.match(settingsDict, /localOnly: "只保存在这台设备"/);
  assert.match(dialog, /settings\.account\.(?:changePassword|setPassword|updatePassword)/);
  assert.match(settingsDict, /setPassword: "设置密码"/);
  assert.match(settingsDict, /changePassword: "修改密码"/);
});

test("昵称走档案 API，头像只本地 persist", () => {
  const store = readWorkspaceFile("lib/stores/userProfile.ts");
  const client = readWorkspaceFile("lib/profile/client.ts");
  const migration = readWorkspaceFile("supabase/migrations/0006_app_users_nickname.sql");
  const authFetch = readWorkspaceFile("lib/auth/installAiAuthFetch.ts");

  assert.match(store, /studysolo-user-profile/);
  assert.match(store, /setLocalAvatar/);
  assert.doesNotMatch(store, /from\("app_users"\)/);
  assert.match(client, /\/api\/profile/);
  assert.match(migration, /add column if not exists nickname/);
  assert.doesNotMatch(migration, /avatar/);
  assert.match(authFetch, /\/api\/profile/);
});
