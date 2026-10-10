import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const root = process.cwd();

function readFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("Agent 加号菜单与空态共用项目入口，且会话项目归属优先", () => {
  const taskbar = readFile("components/window/WindowTaskbar.tsx");
  const empty = readFile("components/window/AgentDockEmptyState.tsx");
  const entry = readFile("components/project/useProjectFilesEntry.tsx");
  assert.match(taskbar, /const agentMode = useAppMode\(\(s\) => s\.mode === "agent"\);/);
  assert.match(taskbar, /data-menu-group="project-files"/);
  const group = taskbar.indexOf("data-menu-group=\"project-files\"");
  const panels = taskbar.indexOf("data-menu-group=\"open-panels\"");
  assert.ok(group > 0 && panels > group, "项目文件组在打开面板组之前");
  assert.match(taskbar, /agentMode && \(/);
  // 这里只检查入口接线和归属契约；空态真实点击、无项目弹窗与会话优先行为
  // 由 AgentDockEmptyState.test.tsx 验证，不要求各 UI 再复制一份项目解析实现。
  assert.match(taskbar, /useProjectFilesEntry\(\)/);
  assert.match(taskbar, /openProjectFilesEntry\(\)/);
  assert.match(empty, /useProjectFilesEntry\(\)/);
  assert.match(empty, /id: "project-files"[\s\S]*?run: openProjectFilesEntry/);
  assert.match(entry, /active\?\.folderId\s*\?\?\s*history\.activeProjectId\s*\?\?\s*null/);
  assert.match(entry, /if \(projectId\) openProjectFiles\(projectId\);\s*else setProjectGateOpen\(true\);/);
  assert.match(entry, /<ProjectRequiredDialog/);
});

test("项目文件窗：注册类型、窗层、图标与打开入口", () => {
  const manager = readFile("lib/stores/workspace/windowManager.ts");
  assert.match(manager, /\| "project-files"/);
  assert.match(manager, /export interface ProjectFilesData \{\s*projectId: string;\s*\}/);
  assert.match(readFile("components/window/DeferredWindowLayers.tsx"), /ProjectFilesLayer/);
  assert.match(readFile("components/window/WindowTypeIcon.tsx"), /type === "project-files"/);
  const opener = readFile("lib/project/openProjectFiles.ts");
  assert.match(opener, /type: "project-files"/);
  assert.match(opener, /data: \{ projectId \}/);
});

test("项目文件不上云：store 与导入路径都不排云同步", () => {
  const store = readFile("lib/stores/assets/projectFiles.ts");
  const importMod = readFile("lib/project/import.ts");
  assert.doesNotMatch(store, /scheduleCloudUpsert|scheduleCloudTombstone/);
  assert.doesNotMatch(importMod, /scheduleCloudUpsert|scheduleCloudTombstone/);
  assert.match(store, /name: PERSIST_KEYS\.projectFiles/);
  // 只有路径与元数据进导入记录
  assert.match(importMod, /source: "project-files"/);
});

test("两个工具在四处登记齐全：names / server / presentations / renderer registry", () => {
  const names = readFile("lib/ai/agent/tools/names.ts");
  assert.match(names, /getProjectFiles: \{ input: GetProjectFilesInput; output: GetProjectFilesOutput \};/);
  assert.match(names, /readProjectSlices: \{ input: ReadProjectSlicesInput; output: ReadProjectSlicesOutput \};/);
  assert.match(names, /"getProjectFiles",\s*\n\s*"readProjectSlices",/);

  const server = readFile("lib/ai/agent/tools/server.ts");
  assert.match(server, /getProjectFiles: createGetProjectFilesTool\(ctx\)/);
  assert.match(server, /readProjectSlices: createReadProjectSlicesTool\(ctx, runtime\)/);

  const presentations = readFile("lib/ai/agent/tools/presentations.ts");
  assert.match(presentations, /getProjectFiles,/);
  assert.match(presentations, /readProjectSlices,/);

  const registry = readFile("components/chat/toolCards/registry.tsx");
  assert.match(registry, /getProjectFiles: moduleOf\("getProjectFiles"\)/);
  assert.match(registry, /readProjectSlices: moduleOf\("readProjectSlices"\)/);
});

test("目录与切片随请求上行：schema / body / 发送侧三处对齐", () => {
  const schema = readFile("lib/ai/agent/request/chat.ts");
  assert.match(schema, /projectFiles: z/);
  assert.match(schema, /projectSlices: z/);
  assert.match(schema, /\.max\(1000\)\s*\n\s*\.default\(\[\]\),/, "目录条数有上限，且不把单次9个附件误作项目累计限制");

  const body = readFile("lib/chat/buildChatRequestBody.ts");
  assert.match(body, /projectFiles\?: ProjectFileCatalogItem\[\];/);
  assert.match(body, /projectSlices\?: ProjectSlicePayload\[\];/);
  assert.match(body, /projectFiles: settings\.projectFiles \?\? \[\],/);
  assert.match(body, /projectSlices: settings\.projectSlices \?\? \[\],/);

  const useChat = readFile("lib/hooks/chat/useChat.ts");
  // 项目归属取**会话自己的 folderId**（回落当前选中项目）：从历史里打开旧对话继续聊时，
  // 不能突然带上另一个项目的文件（"换户口"）。
  assert.match(useChat, /sessionMeta\?\.folderId \?\? historySnapshot\.activeProjectId/);
  assert.match(useChat, /buildProjectCatalog\(projectFileList, sessionProjectId\)\.files/);
  assert.match(useChat, /planCarry\(projectFileList, sessionProjectId \?\? undefined\)/);
  // 携带计划要并上"本会话读过的切片"，否则项目超预算后模型读过的东西下一轮就没了。
  assert.match(useChat, /withRememberedSlices\(/);
  assert.match(useChat, /rememberReadSlices\(/);
  assert.match(useChat, /projectFiles,\s*\n\s*projectSlices,/);
});

test("工具只读「本轮携带」的切片，未携带要给可执行提示", () => {
  const tool = readFile("lib/ai/agent/tools/readProjectSlices/tool.ts");
  assert.match(tool, /const carried = ctx\.projectSlices \?\? \[\];/);
  assert.match(tool, /项目文件窗点「带入对话」/);
  assert.match(tool, /getSection\(path\)/, "studio-ref 指回既有工具");
  assert.match(tool, /dedupeByContextKey/);
});
