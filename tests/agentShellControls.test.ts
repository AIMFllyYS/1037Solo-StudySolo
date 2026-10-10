import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import { AGENT_CHAT_MAX_PX } from "@/lib/constants/layout";
import { fitAgentPanelSizes } from "@/lib/layout/agentPanelSizes";
import { useStore } from "@/lib/stores/ui";
import { readAppShellSources } from "./helpers/appShellSources";

const root = process.cwd();

function readFile(path: string) {
  if (path === "components/layout/AppShell.tsx") return readAppShellSources();
  return readFileSync(join(root, path), "utf8");
}

test("侧边栏开关在顶栏左上角；中间不再浮「展开对话栏」", () => {
  const appShell = readFile("components/layout/AppShell.tsx");
  const agentShell = readFile("components/layout/AgentShell.tsx");
  // 顶栏那个开关不再对 Agent 隐藏（以前是 {!agentMode && <button …>}）
  assert.doesNotMatch(appShell, /\{!agentMode && <button[\s\S]{0,120}toggleSidebar/);
  assert.match(appShell, /data-testid="sidebar-toggle"/);
  assert.match(appShell, /onClick=\{toggleSidebar\}/);
  // 中间那块不再有悬浮展开按钮，也没有第二个入口
  assert.doesNotMatch(agentShell, /展开对话栏/);
  assert.doesNotMatch(agentShell, /PanelLeftOpen/);
});

test("Agent 左右栏共用像素状态：收起只改可见宽度，保留偏好与另一列尺寸", () => {
  const agentShell = readFile("components/layout/AgentShell.tsx");
  const appShell = readFile("components/layout/AppShell.tsx");
  const globals = readFile("app/globals.css");
  // 接线检查只保证两个外壳消费同一尺寸状态；真实 DOM 拖动/开合/重挂载由
  // AgentShell.restore.test.tsx 覆盖，不要求百分比纠偏或旧测量 ref 的具体语句。
  assert.match(agentShell, /useAgentPanelSizes\(\)/);
  assert.match(appShell, /useAgentPanelSizes\(\)/);
  assert.match(agentShell, /--agent-left-content-width/);
  assert.match(agentShell, /data-agent-slot="conversations"[\s\S]{0,500}overflow-hidden/);
  assert.match(globals, /\[data-agent-slot="conversations"\] \{\s*overflow: hidden;/);
  // 拖拽期的骨架屏已经不需要（内容不动了），别再盖一层
  assert.doesNotMatch(agentShell, /leftDragging && <ChatSkeleton/);

  const previous = useStore.getState();
  try {
    useStore.setState({ agentPanelSizes: { left: 280, right: 600 }, sidebarCollapsed: false, agentDockCollapsed: false });
    const visible = () => {
      const state = useStore.getState();
      return fitAgentPanelSizes(state.agentPanelSizes!, 1440, state.sidebarCollapsed, state.agentDockCollapsed);
    };
    useStore.getState().setAgentPanelSize("left", 296);
    assert.deepEqual(visible(), { left: 296, right: 600 }, "改左栏不动右栏");
    useStore.getState().setAgentPanelSize("right", 619);
    assert.deepEqual(visible(), { left: 296, right: 619 }, "改右栏不动左栏");
    const preferred = { ...useStore.getState().agentPanelSizes! };
    useStore.getState().setSidebarCollapsed(true);
    assert.deepEqual(visible(), { left: 0, right: 619 });
    assert.deepEqual(useStore.getState().agentPanelSizes, preferred, "收起左栏不覆盖尺寸偏好");
    useStore.getState().setSidebarCollapsed(false);
    useStore.getState().setAgentDockCollapsed(true);
    assert.deepEqual(visible(), { left: 296, right: 0 });
    assert.deepEqual(useStore.getState().agentPanelSizes, preferred, "收起右栏不覆盖尺寸偏好");
    useStore.getState().setAgentDockCollapsed(false);
    assert.deepEqual(visible(), preferred, "重新展开恢复已保存的左右像素尺寸");
  } finally {
    useStore.setState(previous, true);
  }
});

test("Agent 深色配色 B-A-A：左栏 B、中间与右栏 A，浅色不变", () => {
  const globals = readFile("app/globals.css");
  const sidebar = readFile("components/layout/AgentConversationSidebar.tsx");
  assert.match(globals, /:root \{\s*\n\s*--agent-sidebar-bg: var\(--md-sys-color-surface-container-lowest\);/);
  assert.match(globals, /:root \{\s*\n\s*--agent-sidebar-bg[\s\S]{0,120}--agent-content-bg: var\(--md-sys-color-surface-container-low\);/);
  assert.match(globals, /html:not\(\[data-theme="light"\]\) \[data-agent-shell\] \{/);
  assert.match(globals, /--agent-sidebar-bg: var\(--md-sys-color-surface-container-low\);/);
  assert.match(globals, /--agent-content-bg: var\(--bg-panel\);/);
  assert.match(globals, /\[data-agent-shell\] \[data-agent-slot="main"\],\s*\n\[data-agent-shell\] \.chat-panel \{/);
  // 左栏背景走变量（浅色仍是原来那档），不再是写死的 lowest
  assert.match(sidebar, /background: "var\(--agent-sidebar-bg, var\(--md-sys-color-surface-container-lowest\)\)"/);
  // 资产 / 详情 / 插件市场共用 PageShell：中间列的底色只在这一处写。
  assert.match(readFile("components/ui/PageChrome.tsx"), /bg-\[var\(--agent-content-bg,var\(--md-sys-color-surface-container-low\)\)\]/);
  assert.match(readFile("components/agent/AgentAssetsPage.tsx"), /<PageShell data-testid="agent-assets-page">/);
  assert.match(readFile("components/agent/AgentAssetDetail.tsx"), /<PageShell data-testid="agent-asset-detail"/);
});

test("非对话页点新对话 / 点会话要跳回 /agent", () => {
  const sidebar = readFile("components/layout/AgentConversationSidebar.tsx");
  assert.match(sidebar, /const onChatRoute = pathname === "\/agent";/);
  // goToChat 现在多一个可选目标：深链上切会话要换成新对话的深链，其它非对话页仍回 /agent。
  assert.match(sidebar, /if \(!onChatRoute\) router\.push\("\/agent"\);/);
  assert.match(sidebar, /const deepLinked = pathname\.startsWith\("\/c\/"\);/);
  // 三个入口都要先回对话页：新对话、点会话、项目菜单里的「在此新建对话」（走 handleNewChat）
  const newChat = sidebar.indexOf("const handleNewChat = useCallback(");
  const select = sidebar.indexOf("const handleSelect = useCallback(");
  assert.ok(newChat > 0 && select > newChat);
  assert.match(sidebar.slice(newChat, newChat + 600), /goToChat\(\);/);
  // 点会话时带上目标 id：这样深链上切会话会把地址栏一起换掉（见 goToChat）。
  assert.match(sidebar.slice(select, select + 700), /goToChat\(session\.id\);/);
});

test("删除项目同样二次确认（与删除对话一致）", () => {
  const menu = readFile("components/agent/AgentPanelMenu.tsx");
  const sidebar = readFile("components/layout/AgentConversationSidebar.tsx");
  assert.match(menu, /data-testid="project-delete-confirm"/);
  // 文案迁到词典后菜单只引用 key：确认语必须仍在中文真相源里，否则等于丢了文案
  assert.match(menu, /t\("agent\.menu\.deleteProjectConfirm"\)/);
  assert.match(readFile("lib/i18n/messages/zh.ts"), /删除项目后，里面的对话会退回 Recents（对话本身不删）。/);
  assert.match(menu, /onClick=\{\(\) => onRequestDeleteProject\(target\.folder\.id\)\}/);
  assert.match(menu, /onClick=\{\(\) => onConfirmDeleteProject\(target\.folder\.id\)\}/);
  // 菜单不再直接删：动作里没有 deleteProject 了
  assert.doesNotMatch(menu, /actions\.deleteProject/);
  assert.match(sidebar, /const handleDeleteProject = useCallback\(/);
  assert.match(sidebar, /onRequestDeleteProject=\{setPendingDeleteProjectId\}/);
});

test("右栏按对话隔离：窗口带 sessionId，四处一致筛选，新默认展开与显式偏好分开", () => {
  const manager = readFile("lib/stores/workspace/windowManager.ts");
  assert.match(manager, /sessionId\?: string \| null;/);
  assert.match(manager, /export function setWindowSessionProvider\(provider: \(\(\) => string \| null\) \| null\): void \{/);
  assert.match(manager, /sessionId: input\.sessionId \?\? sessionProvider\?\.\(\) \?\? null,/);

  const scope = readFile("lib/window/sessionScope.ts");
  assert.match(scope, /export function windowBelongsToSession\(/);
  assert.match(scope, /if \(!windowSessionId\) return true;/);

  // 四处消费同一判定：ManagedWindow 可见性 / RightPanel / WindowTaskbar / AgentDockHost
  assert.match(readFile("lib/window/useManagedWindowSurface.ts"), /windowBelongsToSession\(windowSessionId, activeSessionId\)/);
  assert.match(readFile("components/layout/RightPanel.tsx"), /dockWindows = useMemo\(/);
  assert.match(readFile("components/window/WindowTaskbar.tsx"), /filterWindowsForSession\(windows, activeSessionId\)/);
  assert.match(readFile("components/window/AgentDockHost.tsx"), /filterWindowsForSession\(windows, activeSessionId\)/);

  // 新默认展开；仅新版显式偏好由 bootstrap/hydrate 恢复。
  const ui = readFile("lib/stores/ui.ts");
  assert.match(ui, /agentDockCollapsed: false,/);
  assert.match(ui, /updates\.agentDockCollapsed = agentDock;/);
  assert.match(ui, /gailvlun-agent-dock-collapsed-v2/);
  assert.match(readFile("lib/hooks/layout/useAgentDockPerSession.ts"), /setAgentDockCollapsedTransient/);
  // 每个对话一份记忆的钩子挂在 AgentShell 上
  assert.match(readFile("components/layout/AgentShell.tsx"), /useAgentDockPerSession\(\);/);
  assert.match(readFile("lib/hooks/layout/useAgentDockPerSession.ts"), /rememberAgentDockState\(previous, snapshotRef\.current\)/);
});

test("Agent 中央对话：不贴满左右面板（空隙 + 可读宽度居中）", () => {
  const globals = readFile("app/globals.css");
  const thread = readFile("components/chat/ChatThread.tsx");
  // 变量挂在 [data-agent-shell] 根节点上：顶栏那三个切面也要读同一条内边距（挂 .chat-panel 上它读不到）。
  assert.match(globals, /\[data-agent-shell\] \{\s*\n\s*--agent-chat-inline: clamp\(20px, 2\.6vw, 44px\);/);
  // 用户口径：Agent 这一栏要比 Codex 再收一点（780，原 920），两侧留白多一些才协调。
  // 数字取自 AGENT_CHAT_MAX_PX：与 globals.css 的一致性由下面「阅读宽度单一真相源」那条测试守着。
  assert.match(globals, new RegExp(`--agent-chat-max: ${AGENT_CHAT_MAX_PX}px;`));
  // 消息流两侧留白（!important 盖住「有跳转点时内联的 18px」）
  assert.match(globals, /\[data-agent-shell\] \.chat-messages \{\s*\n\s*padding-left: var\(--agent-chat-inline\) !important;/);
  assert.match(globals, /padding-right: var\(--agent-chat-inline\) !important;/);
  // 虚拟行的定宽容器收进可读宽度并居中
  assert.match(globals, /\[data-agent-shell\] \.chat-messages-sizer \{\s*\n\s*width: min\(100%, var\(--agent-chat-max\)\) !important;\s*\n\s*margin-inline: auto;/);
  assert.match(thread, /className="chat-messages-sizer"/);
  // 输入框与正文同宽同中线；欢迎页那份自带居中，排除掉
  assert.match(globals, /\[data-agent-shell\] \.chat-panel:not\(\.chat-panel--welcome\) \.chat-input-container \{/);
  assert.match(globals, /inset-inline: var\(--agent-chat-inline\);/);
  assert.match(globals, /max-width: var\(--agent-chat-max\);/);
  // 「跟随最新输出」按钮贴正文栏右下角
  assert.match(globals, /\[data-agent-shell\] \.chat-scroll-btn \{\s*\n\s*right: max\(12px, calc\(\(100% - var\(--agent-chat-max\)\) \/ 2 \+ 2px\)\);/);
  // 只作用于 Agent 外壳：Studio/浮窗的 .chat-messages 不受影响
  assert.doesNotMatch(globals, /^\s*\.chat-messages \{\s*\n\s*padding-left: var\(--agent-chat-inline/m);
});

test("阅读宽度单一真相源：--agent-chat-max 只声明一次，分享页用同一个常量", () => {
  const globals = readFile("app/globals.css");
  const declared = globals.match(/--agent-chat-max:\s*(\d+)px;/);
  assert.ok(declared, "globals.css 里找不到 --agent-chat-max 的 px 声明");
  // 只有一处声明：多一处就又是一次「两边各写一个数」的漂移起点
  assert.equal(globals.match(/--agent-chat-max:\s*\d+px;/g)?.length, 1);
  assert.equal(Number(declared[1]), AGENT_CHAT_MAX_PX);
  // 公开分享页是裸壳（根节点没有 [data-agent-shell]，读不到那条 CSS 变量），
  // 它的内联宽度必须来自同一个常量 —— 曾经这里是 max-w-[var(--agent-chat-max,920px)]，
  // 兜底值 920 永远生效，比站内宽 140px。
  const sharePage = readFile("components/share/SharePage.tsx");
  assert.match(sharePage, /style=\{\{ maxWidth: AGENT_CHAT_MAX_PX \}\}/);
  // 回归点：这里曾经是 max-w-[var(--agent-chat-max,920px)]，兜底值 920 永远生效
  assert.doesNotMatch(sharePage, /max-w-\[var\(--agent-chat-max/);
});

test("骨架懒加载：资产页与详情页都压约 1 秒最小时长", () => {
  const hook = readFile("lib/hooks/layout/useMinimumSkeleton.ts");
  const page = readFile("components/agent/AgentAssetsPage.tsx");
  const detail = readFile("components/agent/AgentAssetDetail.tsx");
  assert.match(hook, /durationMs = 900/);
  assert.match(hook, /return !ready \|\| elapsedAt === null;/);
  // 定时器回调里 setState（不是 effect 体内同步 setState），才过得了 react-hooks/set-state-in-effect
  assert.match(hook, /setTimeout\(\(\) => setElapsedAt\(Date\.now\(\)\), durationMs\)/);
  assert.match(page, /const showSkeleton = useMinimumSkeleton\(\{ ready: assets !== null \}\);/);
  assert.match(detail, /const showSkeleton = useMinimumSkeleton\(\{ ready: assets !== null \}\);/);
  assert.match(detail, /data-testid="asset-detail-skeleton"/);
});

test("切标签的卡片重排动画：layout + popLayout + 尊重减少动态效果", () => {
  const page = readFile("components/agent/AgentAssetsPage.tsx");
  const motion = readFile("lib/motion.ts");
  // 共享弹簧：刚度/阻尼写在 lib/motion.ts，组件不写魔法数字
  assert.match(motion, /export const LAYOUT_REFLOW: Transition = \{/);
  assert.match(motion, /export const cardSwapVariants: Variants = \{/);
  // 卡片进出场/重排收口在共享预设 reflowItemProps（内部用 cardSwapVariants + reduced 降级）
  assert.match(motion, /export function reflowItemProps\(/);
  assert.match(page, /import \{ LAYOUT_REFLOW, reflowItemProps \} from "@\/lib\/motion";/);
  // 卡片外层 motion.div 带 layout，进出场由 AnimatePresence 接管；popLayout 让退场的先脱离文档流
  assert.match(page, /<AnimatePresence initial=\{false\} mode="popLayout">/);
  assert.match(page, /data-testid=\{`asset-cell-\$\{item\.kind\}-\$\{item\.id\}`\}/);
  assert.match(page, /layout=\{!reducedMotion\}/);
  // 用户「减少动画」设置与系统 prefers-reduced-motion 统一收口在 useUiReducedMotion
  assert.match(page, /const reducedMotion = useUiReducedMotion\(\);/);
  // 网格与列表两个容器也参与 layout，容器尺寸变化同样动画
  const gridBlock = page.slice(page.indexOf("data-testid=\"assets-grid\"") - 400, page.indexOf("data-testid=\"assets-grid\""));
  assert.match(gridBlock, /<motion\.div[\s\S]*layout=\{!reducedMotion\}/);
  assert.doesNotMatch(page, /visible\.map\(\(item\) => \(\s*<AgentAssetCard/);
});

test("资产页：卡片更大 + 骨架按视图 + 加载期 aria-busy", () => {
  const card = readFile("components/agent/AgentAssetCard.tsx");
  const page = readFile("components/agent/AgentAssetsPage.tsx");
  assert.match(card, /h-\[188px\] flex-col gap-2\.5 rounded-2xl/);
  // 卡片左右再拉宽：网格最小列宽 208 → 260（1440 下从 4 列变 3 列，单卡更舒展）
  assert.match(page, /minmax\(260px,1fr\)\)\] gap-4/);
  assert.doesNotMatch(page, /minmax\(208px/);
  assert.match(page, /data-testid="assets-skeleton"/);
  assert.match(page, /aria-label="资产加载中"/);
  // 分享标签走的是云端列表、与本机资产的骨架无关，所以加载期标记要把它排除掉（见组件里的 onShareTab）。
  assert.match(page, /aria-busy=\{\(onShareTab \? false : onCloudTab \? cloud\.phase === 'loading' : showSkeleton \|\| remoteLoading\) \|\| undefined\}/);
});
