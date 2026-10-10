import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENT_PANEL_SIZES_KEY, defaultAgentPanelSizes, fitAgentPanelSizes, readAgentPanelSizes } from "./agentPanelSizes.ts";

const storage = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null });

test("左右偏好直接按像素保存；开合一列不会重新分配另一列", () => {
  const saved = { left: 280, right: 760 };
  assert.deepEqual(fitAgentPanelSizes(saved, 1440, false, false), saved);
  assert.deepEqual(fitAgentPanelSizes(saved, 1440, false, true), { left: 280, right: 0 });
  assert.deepEqual(fitAgentPanelSizes(saved, 1440, true, false), { left: 0, right: 760 });
  assert.deepEqual(readAgentPanelSizes(1440, storage({ [AGENT_PANEL_SIZES_KEY]: JSON.stringify(saved) })), saved);
});

test("兼容旧左栏像素值及右栏已收起时的 expandToSizes，不采用0作为默认宽度", () => {
  const legacy = storage({
    "studysolo-agent-left-px-v1": "310",
    "react-resizable-panels:studysolo-agent-shell-v2": JSON.stringify({ "agent-shell-dock,agent-shell-main": { layout: [100, 0], expandToSizes: { "agent-shell-dock": 45 } } }),
  });
  assert.deepEqual(readAgentPanelSizes(1600, legacy), { left: 310, right: 720 });
});

test("未存左像素时迁移嵌套组比例；新完整尺寸记录优先于旧记录", () => {
  const values = {
    "react-resizable-panels:studysolo-agent-shell-v2": JSON.stringify({ "agent-shell-dock,agent-shell-main": { layout: [50, 50] } }),
    "react-resizable-panels:studysolo-agent-layout-v3": JSON.stringify({ "agent-conversations,agent-main": { layout: [30, 70] } }),
  };
  assert.deepEqual(readAgentPanelSizes(1600, storage(values)), { left: 240, right: 800 });
  assert.deepEqual(readAgentPanelSizes(1600, storage({ ...values, [AGENT_PANEL_SIZES_KEY]: JSON.stringify({ left: 300, right: 600 }) })), { left: 300, right: 600 });
});

test("首次沿用60%右工作区；缩小窗口只约束可见几何而不覆写偏好", () => {
  assert.deepEqual(defaultAgentPanelSizes(1600), { left: 240, right: 960 });
  const preferred = { left: 310, right: 900 };
  assert.deepEqual(fitAgentPanelSizes(preferred, 900, false, false), { left: 310, right: 430 });
  assert.deepEqual(preferred, { left: 310, right: 900 });
  assert.deepEqual(readAgentPanelSizes(1600, storage({ [AGENT_PANEL_SIZES_KEY]: "bad json" })), defaultAgentPanelSizes(1600));
});
