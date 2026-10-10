import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ModelMenu from "./ModelMenu";
import { useSettings } from "@/lib/stores/settings";

function openMenu() { fireEvent.click(screen.getByTestId("model-menu-button")); }
function openFamilies() { fireEvent.click(screen.getByTestId("model-choose-family")); }
function openCategory(name: string) {
  openMenu(); openFamilies();
  fireEvent.click(screen.getByRole("button", { name }));
}
function viewport(width: number) {
  const previous = window.innerWidth;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  return () => Object.defineProperty(window, "innerWidth", { configurable: true, value: previous });
}

describe("ModelMenu progressive selection", () => {
  beforeEach(() => useSettings.setState({
    selectedModelId: "deepseek/deepseek-v4.1-flash", customApiGroups: [], reduceMotion: true,
  }));
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("opens only a compact effort card; model label explicitly opens the families", () => {
    render(<ModelMenu />);
    openMenu();
    expect(screen.getByRole("slider", { name: "思考深度" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "模型系列" })).toBeNull();
    expect(screen.queryByRole("region", { name: "具体模型" })).toBeNull();
    expect(screen.getByTestId("model-menu-panel")).not.toHaveTextContent(/模型信息|上游|七牛|不启用推理链/);
    openFamilies();
    expect(screen.getByRole("region", { name: "模型系列" })).toBeInTheDocument();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("region", { name: "具体模型" })).toBeNull();
    // The new family row appearing under the stationary pointer must not auto-open level three.
    fireEvent.mouseEnter(screen.getByRole("button", { name: "快速模型" }));
    expect(screen.queryByRole("region", { name: "具体模型" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "返回思考强度" }));
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("keeps the same desktop anchor while replacing level one with level two", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 900, right: 1000, top: 600, bottom: 632, width: 100, height: 32, x: 900, y: 600, toJSON() {},
    });
    const restore = viewport(1280);
    try {
      render(<ModelMenu />); openMenu();
      const panel = screen.getByTestId("model-menu-panel");
      const left = panel.style.left, bottom = panel.style.bottom;
      openFamilies();
      fireEvent.mouseMove(screen.getByRole("button", { name: "快速模型" }));
      expect(panel.style.left).toBe(left); expect(panel.style.bottom).toBe(bottom);
      expect(panel.style.width).toBe("320px");
      const flyout = screen.getByRole("region", { name: "具体模型" });
      expect(flyout.style.width).toBe("352px");
      expect(flyout.style.left).toBe("-362px");
      expect(screen.getByRole("region", { name: "模型系列" })).toBeVisible();
    } finally { restore(); }
  });

  it("selects automatic and retains the category order", () => {
    const onChange = vi.fn();
    render(<ModelMenu onChange={onChange} />);
    openMenu(); openFamilies();
    const cats = screen.getByRole("region", { name: "模型系列" });
    const names = within(cats).getAllByRole("button").map((b) => b.textContent);
    expect(names.slice(1, 6)).toEqual(["自动模型", "免费模型", "快速模型", "多模态模型", "旗舰模型"]);
    fireEvent.click(screen.getByTestId("model-menu-item-auto"));
    expect(onChange).toHaveBeenCalledWith("auto");
    expect(screen.queryByTestId("model-menu-panel")).toBeNull();
  });

  it("keeps image models selectable and the compact image card has no effort slider", () => {
    useSettings.setState({ selectedModelId: "Tongyi-MAI/Z-Image-Turbo" });
    const onChange = vi.fn();
    render(<ModelMenu onChange={onChange} />);
    openMenu();
    expect(screen.getByTestId("model-effort-title")).toHaveTextContent("生图");
    expect(screen.queryByRole("slider")).toBeNull();
    openFamilies();
    fireEvent.click(screen.getByRole("button", { name: "生图模型" }));
    fireEvent.click(screen.getByTestId("model-menu-item-Tongyi-MAI/Z-Image-Turbo"));
    expect(onChange).toHaveBeenCalledWith("Tongyi-MAI/Z-Image-Turbo");
  });

  it("previews a hovered model with capabilities and price without selecting it", () => {
    const onChange = vi.fn();
    render(<ModelMenu onChange={onChange} />);
    openCategory("多模态模型");
    expect(screen.queryByTestId("model-preview")).toBeNull();
    expect(screen.queryByText("悬停模型查看详情")).toBeNull();
    const row = screen.getByTestId("model-menu-item-z-ai/glm-5.3-flash");
    fireEvent.mouseMove(row);
    const preview = screen.getByTestId("model-preview");
    expect(within(preview).getByText("视觉")).toBeInTheDocument();
    expect(within(preview).getByText("上下文 1M")).toBeInTheDocument();
    expect(preview).toHaveTextContent("¥0.8 / ¥0.23 / ¥2.8");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("model-submenu-use"));
    expect(onChange).toHaveBeenCalledWith("z-ai/glm-5.3-flash");
  });

  it("preserves vendor training disclosure in the model row and preview", () => {
    render(<ModelMenu />);
    openCategory("多模态模型");
    fireEvent.mouseMove(screen.getByTestId("model-menu-item-meta/muse-spark-1.3-contributor"));
    expect(screen.getAllByText("对话可能用于厂商训练")).toHaveLength(2);
  });

  it("changing families clears the old preview; hovering never opens an extra effort card", () => {
    render(<ModelMenu />);
    openCategory("多模态模型");
    fireEvent.mouseMove(screen.getByTestId("model-menu-item-mimo-v2.6-pro"));
    expect(screen.getByTestId("model-preview")).toHaveTextContent("MiMo 2.6 Pro");
    fireEvent.mouseMove(screen.getByRole("button", { name: "免费模型" }));
    expect(screen.queryByTestId("model-preview")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("preserves custom API group identity through the same levels", () => {
    useSettings.setState({ customApiGroups: [{ id: "mine", name: "我的 API", baseUrl: "https://custom.invalid/v1", apiKey: "", models: [{ id: "deepseek-chat", label: "我的 DeepSeek", thinking: true }] }] });
    const onChange = vi.fn();
    render(<ModelMenu onChange={onChange} />);
    openMenu(); openFamilies();
    fireEvent.click(screen.getByRole("button", { name: "我的 API" }));
    fireEvent.click(screen.getByTestId("model-menu-item-custom:mine:deepseek-chat"));
    expect(onChange).toHaveBeenCalledWith("custom:mine:deepseek-chat");
  });

  it.each([
    ["mimo-v2.6-pro", "xiaomi/mimo-v2.6-pro-ultraspeed"],
    ["deepseek/deepseek-v4.1-flash", "deepseek/deepseek-v4.1-flash-fast"],
  ])("toggles the actual Fast variant for %s and keeps effort", (base, fast) => {
    useSettings.setState({ selectedModelId: base });
    const onThinkingChange = vi.fn();
    render(<ModelMenu thinkingEnabled thinkingEffort="high" onThinkingChange={onThinkingChange} />);
    openMenu();
    fireEvent.click(screen.getByTestId("model-fast-toggle"));
    expect(useSettings.getState().selectedModelId).toBe(fast);
    expect(onThinkingChange).toHaveBeenLastCalledWith({ enabled: true, effort: "high" });
    expect(screen.getByTestId("model-fast-toggle")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("model-fast-toggle"));
    expect(useSettings.getState().selectedModelId).toBe(base);
  });

  it("hides Fast variants from lists and restores their selected family row", () => {
    useSettings.setState({ selectedModelId: "deepseek/deepseek-v4.1-flash-fast" });
    render(<ModelMenu />);
    openCategory("快速模型");
    expect(screen.queryByTestId("model-menu-item-deepseek/deepseek-v4.1-flash-fast")).toBeNull();
    expect(screen.queryByTestId("model-menu-item-xiaomi/mimo-v2.6-pro-ultraspeed")).toBeNull();
    expect(within(screen.getByTestId("model-menu-item-deepseek/deepseek-v4.1-flash")).getByLabelText("已选模型")).toBeInTheDocument();
    fireEvent.mouseMove(screen.getByTestId("model-menu-item-deepseek/deepseek-v4.1-flash"));
    expect(screen.getByTestId("model-preview")).toHaveTextContent("普通模式 2×");
  });

  it("disabled Fast stays disabled and required-thinking models never offer off", () => {
    useSettings.setState({ selectedModelId: "z-ai/glm-5.3-flash" });
    const onThinkingChange = vi.fn();
    render(<ModelMenu thinkingEnabled thinkingEffort="high" onThinkingChange={onThinkingChange} />);
    openMenu();
    expect(screen.getByTestId("model-fast-toggle")).toBeDisabled();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    expect(onThinkingChange).toHaveBeenLastCalledWith({ enabled: true, effort: "low" });
  });

  it("lets the slider own arrow keys and restores trigger focus on Escape", () => {
    render(<ModelMenu />); openMenu();
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(screen.queryByRole("region", { name: "模型系列" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("slider"), { key: "Escape" });
    expect(screen.queryByTestId("model-menu-panel")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("model-menu-button"));
  });

  it("mobile uses one level at a time and allows detail review before selecting", () => {
    const restore = viewport(390);
    try {
      const onChange = vi.fn();
      render(<ModelMenu onChange={onChange} />);
      openMenu();
      expect(screen.getByTestId("model-menu-panel")).toHaveAttribute("data-layout", "drilldown");
      expect(screen.getByTestId("model-menu-panel").style.width).toBe("360px");
      openFamilies();
      fireEvent.click(screen.getByRole("button", { name: "快速模型" }));
      expect(screen.queryByRole("region", { name: "模型系列" })).toBeNull();
      fireEvent.click(screen.getByTestId("model-menu-item-deepseek/deepseek-v4.1-flash"));
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByTestId("model-preview")).toHaveTextContent("DeepSeek V4.1 Flash");
      fireEvent.click(screen.getByRole("button", { name: "返回模型系列" }));
      expect(screen.getByRole("region", { name: "模型系列" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "快速模型" }));
      fireEvent.click(screen.getByTestId("model-menu-item-deepseek/deepseek-v4.1-flash"));
      fireEvent.click(screen.getByTestId("model-submenu-use"));
      expect(onChange).toHaveBeenCalledWith("deepseek/deepseek-v4.1-flash");
      expect(screen.queryByTestId("model-menu-panel")).toBeNull();
    } finally { restore(); }
  });

  it("a narrow resize collapses the desktop flyout without losing a usable back path", () => {
    const restore = viewport(1280);
    try {
      render(<ModelMenu />); openCategory("快速模型");
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
      act(() => window.dispatchEvent(new Event("resize")));
      expect(screen.getByTestId("model-menu-panel")).toHaveAttribute("data-layout", "drilldown");
      expect(screen.getByRole("region", { name: "模型系列" })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "具体模型" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "返回思考强度" }));
      expect(screen.getByRole("slider")).toBeInTheDocument();
    } finally { restore(); }
  });
});
