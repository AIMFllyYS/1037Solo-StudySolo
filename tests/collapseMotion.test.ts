import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

/**
 * 折叠动画的防回归守门测试。
 * 背景：展开动画一度以 `height: "auto"` 为目标，framer 只在动画开始时按元素边界矩形测量一次，
 * 于是（1）祖先 transform: scale() 把测量值按比例缩小，动画停在真实高度的 90%、末帧被 auto 拉回；
 * （2）异步内容让测量值过期，末帧跳变可达数百像素。这里把正确契约钉死。
 */
test("折叠动画用实测像素高度，不用 height:auto 作为动画目标", () => {
  const src = readWorkspaceFile("components/ui/AnimatedCollapse.tsx");

  // 测量必须走布局值（scrollHeight），免疫祖先 transform
  assert.match(src, /scrollHeight/);
  assert.match(src, /function contentHeight/);

  // 展开与收起都显式动画到像素高度，路径对称
  assert.match(src, /controls\.start\(\{ height, opacity: 1/);
  assert.match(src, /controls\.set\(\{ height, opacity: 1 \}\)/);
  assert.match(src, /controls\.start\(\{ height: 0, opacity: 0/);

  // 动画目标里不允许再出现 height: "auto"
  assert.doesNotMatch(src, /start\(\{[^}]*height:\s*"auto"/);

  // 展开期间要跟随内容尺寸变化，收口时才交还 auto
  assert.match(src, /ResizeObserver/);
  assert.match(src, /controls\.set\(\{ height: "auto" \}\)/);

  // 不得加 layout / layoutId：会让 SubjectSidebar 的 AnimatePresence(mode="wait") 静默死锁
  assert.doesNotMatch(src, /\blayout(Id)?\s*=/);
});

test("设置弹层不做整体 transform 缩放，滚动定位写回前先浅比较", () => {
  const settings = readWorkspaceFile("components/layout/settings/GlobalSettings.tsx");

  // transform: scale() 会把子元素的高度测量值一起缩放，是折叠抖动的直接来源
  assert.doesNotMatch(settings, /scale:\s*0?\.\d+/);
  assert.match(settings, /setPos\(\(prev\) =>/);
});

test("菜单分区展开内容限高，保证各分区动画位移同量级", () => {
  const section = readWorkspaceFile("components/layout/settings/SettingsSection.tsx");
  assert.match(section, /max-h-\[min\(44vh,300px\)\]/);
});
