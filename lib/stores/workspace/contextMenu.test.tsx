import { describe, it, expect, beforeEach } from "vitest";
import { useContextMenu } from "./contextMenu";

describe("useContextMenu", () => {
  beforeEach(() => {
    useContextMenu.getState().closeMenu();
  });

  it("初始状态关闭", () => {
    const s = useContextMenu.getState();
    expect(s.open).toBe(false);
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
    expect(s.text).toBe("");
  });

  it("openAt 打开菜单并设置坐标和文本", () => {
    useContextMenu.getState().openAt({ x: 100, y: 200, text: "右键文本" });
    const s = useContextMenu.getState();
    expect(s.open).toBe(true);
    expect(s.x).toBe(100);
    expect(s.y).toBe(200);
    expect(s.text).toBe("右键文本");
  });

  it("openAt 支持 subjectOverride", () => {
    useContextMenu.getState().openAt({ x: 50, y: 50, text: "测试", subjectOverride: "physics" });
    expect(useContextMenu.getState().subjectOverride).toBe("physics");
  });

  it("closeMenu 关闭并清空文本", () => {
    useContextMenu.getState().openAt({ x: 10, y: 20, text: "内容" });
    useContextMenu.getState().closeMenu();
    const s = useContextMenu.getState();
    expect(s.open).toBe(false);
    expect(s.text).toBe("");
  });
});
