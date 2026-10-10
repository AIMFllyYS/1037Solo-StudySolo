import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { DEFAULT_APPEARANCE_SETTINGS } from "@/lib/theme/appearance";
import { useTheme } from "./theme";


const THEME_KEY = "gailvlun-theme";
const APPEARANCE_KEY = "gailvlun-appearance-v1";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-appearance");
    document.documentElement.removeAttribute("data-font");
    document.documentElement.removeAttribute("style");
    useTheme.setState({
      theme: "dark",
      hydrated: false,
      appearance: DEFAULT_APPEARANCE_SETTINGS,
    });
  });

  it("keeps the existing light/dark API and persists the legacy theme key", () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme("light"));
    expect(result.current.theme).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    act(() => result.current.toggle());
    expect(result.current.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("hydrates theme and appearance from DOM and localStorage", () => {
    localStorage.setItem(THEME_KEY, "light");
    localStorage.setItem(
      APPEARANCE_KEY,
      JSON.stringify({
        mode: "custom",
        custom: {
          lightAccent: "#2355aa",
          darkAccent: "#ccddff",
          selection: "#229977",
          font: "songti",
        },
      }),
    );
    document.documentElement.setAttribute("data-theme", "light");

    const { result } = renderHook(() => useTheme());
    act(() => result.current.hydrate());

    expect(result.current.hydrated).toBe(true);
    expect(result.current.theme).toBe("light");
    expect(result.current.appearance.mode).toBe("custom");
    expect(document.documentElement).toHaveAttribute("data-appearance", "custom");
    expect(document.documentElement.style.getPropertyValue("--appearance-light-accent")).toBe("#2355aa");
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toContain("Songti SC");
  });

  it("applies colorful mode without writing custom CSS variables", () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setAppearanceMode("colorful"));

    expect(result.current.appearance.mode).toBe("colorful");
    expect(document.documentElement).toHaveAttribute("data-appearance", "colorful");
    expect(document.documentElement.style.getPropertyValue("--appearance-light-accent")).toBe("");
    expect(JSON.parse(localStorage.getItem(APPEARANCE_KEY) || "{}").mode).toBe("colorful");
  });

  it("applies custom colors and font as CSS variables", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setAppearanceMode("custom");
      result.current.setCustomAppearance({
        lightAccent: "#1166aa",
        darkAccent: "#dde8ff",
        selection: "#aa7733",
        font: "kaiti",
      });
    });

    expect(result.current.appearance.custom.lightAccent).toBe("#1166aa");
    expect(result.current.appearance.custom.darkAccent).toBe("#dde8ff");
    expect(result.current.appearance.custom.selection).toBe("#aa7733");
    expect(result.current.appearance.custom.font).toBe("kaiti");
    expect(document.documentElement.style.getPropertyValue("--appearance-selection")).toBe("#aa7733");
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toContain("KaiTi");
  });

  it("resetAppearance restores default mode and removes inline custom variables", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setAppearanceMode("custom");
      result.current.setCustomAppearance({ lightAccent: "#1166aa" });
      result.current.resetAppearance();
    });

    expect(result.current.appearance).toEqual(DEFAULT_APPEARANCE_SETTINGS);
    expect(document.documentElement).toHaveAttribute("data-appearance", "ios");
    expect(document.documentElement.style.getPropertyValue("--appearance-light-accent")).toBe("");
    expect(localStorage.getItem(APPEARANCE_KEY)).toContain('"mode":"ios"');
  });
});
