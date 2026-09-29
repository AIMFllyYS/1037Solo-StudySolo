import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("顶栏与壳走 StudySolo 三模式，不再写期末复习工作站", () => {
  const appShell = readWorkspaceFile("components/layout/AppShell.tsx");
  const mobile = readWorkspaceFile("components/layout/MobileTopBar.tsx");
  const switcher = readWorkspaceFile("components/layout/ModeSwitcher.tsx");
  const bookshelf = readWorkspaceFile("components/layout/HomeBookshelf.tsx");
  const logo = readWorkspaceFile("components/layout/BrandLogo.tsx");

  assert.match(appShell, /from "\.\/ModeSwitcher"/);
  assert.match(appShell, /<ModeSwitcher\s*\/>/);
  assert.match(appShell, /useAppMode/);
  assert.match(appShell, /usesStudioChrome/);
  assert.match(appShell, /usesMobileStudioChrome/);
  assert.match(appShell, /retainAgentOnStudio/);
  assert.match(appShell, /hrefForMobileAppMode/);
  assert.doesNotMatch(appShell, /期末复习工作站/);
  assert.doesNotMatch(appShell, /from "\.\/BrandLogo"/);

  assert.match(mobile, /打开侧栏/);
  assert.match(mobile, /usesMobileStudioChrome/);
  assert.doesNotMatch(mobile, /from "\.\/ModeSwitcher"/);
  assert.doesNotMatch(mobile, /from "\.\/BrandLogo"/);

  const drawer = readWorkspaceFile("components/layout/MobileSidebarDrawer.tsx");
  assert.match(drawer, /<ModeSwitcher compact stayOnStudioForAgent \/>/);
  assert.match(drawer, /SubjectFolderTree/);

  assert.match(switcher, /from "@\/components\/ui\/AnchoredMenu"/);
  assert.match(switcher, /appModeTitle/);
  assert.match(switcher, /app-mode-option-\$\{item\}/);
  assert.match(switcher, /APP_MODES\.map/);

  assert.match(bookshelf, /StudySolo/);
  assert.doesNotMatch(bookshelf, /期末复习工作站/);
  assert.match(logo, /aria-label="StudySolo"/);
});

test("Agent / Class 路由接上，Agent 复用 ChatPanel 槽位", () => {
  const agentPage = readWorkspaceFile("app/agent/page.tsx");
  const agentLayout = readWorkspaceFile("app/agent/layout.tsx");
  const classPage = readWorkspaceFile("app/class/page.tsx");
  const workspace = readWorkspaceFile("components/layout/AgentShell.tsx");
  const appShell = readWorkspaceFile("components/layout/AppShell.tsx");


  // 左栏放在 Agent 段布局里：切到 /agent/assets 等子页时左栏要原样留着，只有中央区换内容。
  assert.match(agentLayout, /from "@\/components\/layout\/AgentShell"/);
  assert.match(agentLayout, /<AgentShell>\{children\}<\/AgentShell>/);
  assert.match(agentPage, /from "@\/components\/agent\/AgentChatCenter"/);
  assert.match(classPage, /ClassEntry/);
  assert.doesNotMatch(classPage, /ClassPlaceholder/);
  // 左对话栏是常驻列（可收起），右侧工作区是顶层外壳里与顶栏并列、通到窗口最顶的一列。
  assert.match(workspace, /data-agent-slot="conversations"/);
  assert.match(workspace, /data-agent-slot="main"/);
  assert.doesNotMatch(workspace, /data-agent-slot="windows"/);
  assert.match(workspace, /AgentConversationSidebar/);
  // 中央内容是路由插槽（children），对话组件挂在 /agent 路由自己身上。
  assert.match(readWorkspaceFile("components/agent/AgentChatCenter.tsx"), /components\/chat\/ChatPanel/);
  assert.doesNotMatch(workspace, /next\/dynamic/);
  assert.match(workspace, /if \(isMobile\)/);
  // 展开左栏的入口只有顶栏那一个（与 Studio 同款，testid=sidebar-toggle）；
  // 中间不再浮「展开对话栏」。
  assert.doesNotMatch(workspace, /展开对话栏/);
  assert.match(appShell, /data-testid="sidebar-toggle"/);
  const dockColumn = readWorkspaceFile("components/layout/AgentDockColumn.tsx");
  assert.match(dockColumn, /data-agent-slot="windows"/);
  assert.match(dockColumn, /hideBuiltinTabs/);
  assert.match(dockColumn, /showWindowDock/);
  // 收起按钮的落点由外壳注入，右栏不再自己写 Studio 档位
  assert.match(dockColumn, /onCollapse/);
  assert.match(appShell, /AgentDockColumn/);
  assert.match(appShell, /isAgentRoute/);
  assert.match(appShell, /agent-dock-toggle|展开右侧工作区/);
  const sidebar = readWorkspaceFile("components/layout/AgentConversationSidebar.tsx");
  assert.match(sidebar, /from "\.\/LeftDock"/);
  // 左栏结构：固定四行导航 + 一起滚动的 Projects / Recents（详见 tests/agentNavStructure.test.ts）
  assert.match(sidebar, /AgentNavRows/);
  // 分组标题文案走 i18n 词典（zh 值「项目 / 最近」，en 值 Projects / Recents）
  assert.match(sidebar, /label=\{t\("agent\.sidebar\.projects"\)\}/);
  assert.match(sidebar, /label=\{t\("agent\.sidebar\.recents"\)\}/);
  assert.match(appShell, /hideWindowTaskbar/);


  const settings = readWorkspaceFile("components/layout/MobileSettingsPanel.tsx");
  const globalSettings = readWorkspaceFile("components/layout/GlobalSettings.tsx");
  assert.match(settings, /from "\.\/GlobalSettings"/);
  assert.match(settings, /variant="page"/);
  assert.doesNotMatch(settings, /ChatSettings/);
  assert.match(globalSettings, /mobile-settings-quota/);
  assert.match(globalSettings, /AccountQuota/);
  assert.doesNotMatch(globalSettings, /UserQuotaPanel/);
  assert.match(appShell, /MobileSidebarDrawer/);
  assert.match(appShell, /MobileMiniChat/);
});

test("Agent 顶栏：网页全屏按钮紧贴右侧工作区开关左侧，且与两个面板级「全屏」用不同图标", () => {
  const appShell = readWorkspaceFile("components/layout/AppShell.tsx");
  const workspace = readWorkspaceFile("components/layout/AgentShell.tsx");
  const rightPanel = readWorkspaceFile("components/layout/RightPanel.tsx");

  // 1) 位置：全屏键排在 agent-dock-toggle（控制右侧工作区的那个键）之前 = 它的左侧。
  const fullscreen = appShell.indexOf('data-testid="browser-fullscreen"');
  const dockToggle = appShell.indexOf('data-testid="agent-dock-toggle"');
  assert.ok(fullscreen > 0 && dockToggle > 0, "顶栏要有全屏键与右侧工作区开关");
  assert.ok(fullscreen < dockToggle, "全屏键必须在右侧工作区开关左侧");

  // 2) 图标：顶栏用四角 Maximize / Minimize；右栏「面板全屏」用对角箭头，两者不得混用。
  const block = appShell.slice(appShell.lastIndexOf("<button", fullscreen), appShell.indexOf("</button>", fullscreen));
  assert.match(block, /<Minimize size=\{18\} \/>/);
  assert.match(block, /<Maximize size=\{18\} \/>/);
  assert.doesNotMatch(block, /Maximize2|Minimize2/);
  assert.match(rightPanel, /<Maximize2 size=\{16\} \/>/);
  assert.match(rightPanel, /<Minimize2 size=\{16\} \/>/);

  // 3) 中间对话面板里不再有悬浮全屏键（旧版会压住第一条消息，且与右栏图标重样）。
  assert.doesNotMatch(workspace, /agent-chat-fullscreen|useBrowserFullscreen/);
  assert.doesNotMatch(workspace, /Maximize2|Minimize2/);

  // 4) Agent 顶栏是控件条：不吃 Studio 那个会落盘的「收起顶栏」，否则两个键一起消失。
  //    React 侧（barCollapsed）与首帧 CSS（html[data-topbar-collapsed] 那条）都要放过它。
  assert.match(appShell, /const barCollapsed = !agentMode && !classMode && !reviewMode && topBarCollapsed;/);
  assert.match(appShell, /barCollapsed \? "h-0 border-b-0 py-0"/);
  assert.match(appShell, /data-agent-bar=\{agentMode \? "true" : undefined\}/);
  const globals = readWorkspaceFile("app/globals.css");
  assert.match(globals, /html\[data-topbar-collapsed="true"\] header\[data-topbar\]:not\(\[data-agent-bar\]\)/);
});
