import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  FONT_CHOICES,
  buildAppearanceCssVars,
  contrastText,
  fontForAppearanceMode,
  normalizeAppearanceSettings,
  safeHexColor,
  serializeAppearanceSettings,
  type AppearanceSettings,
} from "./appearance.ts";

test("safeHexColor accepts six-digit hex colors and rejects unsafe values", () => {
  assert.equal(safeHexColor("#4f7cff", "#000000"), "#4f7cff");
  assert.equal(safeHexColor("#ABCDEF", "#000000"), "#abcdef");
  assert.equal(safeHexColor("4f7cff", "#000000"), "#000000");
  assert.equal(safeHexColor("red", "#000000"), "#000000");
  assert.equal(safeHexColor("url(javascript:alert(1))", "#000000"), "#000000");
});

test("normalizeAppearanceSettings recovers from invalid persisted data", () => {
  assert.equal(DEFAULT_APPEARANCE_SETTINGS.mode, "ios");
  assert.deepEqual(normalizeAppearanceSettings(null), DEFAULT_APPEARANCE_SETTINGS);
  assert.deepEqual(normalizeAppearanceSettings("not-json"), DEFAULT_APPEARANCE_SETTINGS);
  assert.deepEqual(
    normalizeAppearanceSettings({ mode: "strange", custom: { lightAccent: "red" } }),
    DEFAULT_APPEARANCE_SETTINGS,
  );
});

test("normalizeAppearanceSettings preserves valid mode, colors, and font", () => {
  const settings = normalizeAppearanceSettings({
    mode: "custom",
    custom: {
      lightBackground: "#223344",
      lightAccent: "#1188CC",
      lightText: "#101820",
      darkAccent: "#F3B65E",
      darkText: "#E8F0F8",
      selection: "#22AA77",
      font: "songti",
    },
  });

  assert.equal(settings.mode, "custom");
  assert.equal(settings.custom.lightBackground, "#223344");
  assert.equal(settings.custom.lightAccent, "#1188cc");
  assert.equal(settings.custom.lightText, "#101820");
  assert.equal(settings.custom.darkAccent, "#f3b65e");
  assert.equal(settings.custom.darkText, "#e8f0f8");
  assert.equal(settings.custom.selection, "#22aa77");
  assert.equal(settings.custom.font, "songti");
});

test("normalizeAppearanceSettings accepts the new preset modes", () => {
  for (const mode of ["default", "anthropic", "ios", "codex"] as const) {
    assert.equal(normalizeAppearanceSettings({ mode }).mode, mode);
  }
});

test("serializeAppearanceSettings writes a compact stable payload", () => {
  const settings: AppearanceSettings = {
    mode: "custom",
    custom: {
      lightBackground: "#ffffff",
      lightAccent: "#2255aa",
      lightText: "#101418",
      darkBackground: "#101418",
      darkAccent: "#c7d8ff",
      darkText: "#e2e2e9",
      selection: "#bb7722",
      font: "kaiti",
    },
  };

  assert.equal(
    serializeAppearanceSettings(settings),
    '{"mode":"custom","custom":{"lightBackground":"#ffffff","lightAccent":"#2255aa","lightText":"#101418","darkBackground":"#101418","darkAccent":"#c7d8ff","darkText":"#e2e2e9","selection":"#bb7722","font":"kaiti"}}',
  );
});

test("contrastText picks readable text for light and dark accent colors", () => {
  assert.equal(contrastText("#ffffff"), "#111318");
  assert.equal(contrastText("#000000"), "#ffffff");
  assert.equal(contrastText("#d97757"), "#111318");
  assert.equal(contrastText("#6750a4"), "#ffffff");
  assert.equal(contrastText("#007aff"), "#ffffff");
});

test("buildAppearanceCssVars exposes custom background, color, and font variables", () => {
  const vars = buildAppearanceCssVars({
    mode: "custom",
    custom: {
      lightBackground: "#faf5ea",
      lightAccent: "#2255aa",
      lightText: "#20242a",
      darkBackground: "#14171c",
      darkAccent: "#c7d8ff",
      darkText: "#e6e9ee",
      selection: "#bb7722",
      font: "songti",
    },
  });

  assert.equal(vars["--appearance-light-bg"], "#faf5ea");
  assert.equal(vars["--appearance-dark-bg"], "#14171c");
  assert.equal(vars["--appearance-light-ink"], "#20242a");
  assert.equal(vars["--appearance-dark-ink"], "#e6e9ee");
  assert.equal(vars["--appearance-light-extreme"], "#ffffff");
  assert.equal(vars["--appearance-dark-extreme"], "#000000");
  assert.equal(vars["--appearance-light-accent"], "#2255aa");
  assert.equal(vars["--appearance-dark-accent"], "#c7d8ff");
  assert.equal(vars["--appearance-light-on-accent"], "#ffffff");
  assert.equal(vars["--appearance-selection"], "#bb7722");
  assert.equal(vars["--appearance-selection-bg"], "color-mix(in srgb, #bb7722 34%, transparent)");
  assert.equal(vars["--font-sans"], FONT_CHOICES.songti.cssValue);
});

test("buildAppearanceCssVars keeps non-custom modes from overriding color tokens but applies the font", () => {
  assert.deepEqual(Object.keys(buildAppearanceCssVars(DEFAULT_APPEARANCE_SETTINGS)), ["--font-sans"]);
  assert.deepEqual(
    buildAppearanceCssVars({ mode: "anthropic", custom: { ...DEFAULT_APPEARANCE_SETTINGS.custom, font: "serif" } }),
    { "--font-sans": FONT_CHOICES.serif.cssValue },
  );
});

test("each preset theme switches to its signature font; custom keeps the user's font", () => {
  assert.equal(fontForAppearanceMode("codex", "system"), "mono");
  assert.equal(fontForAppearanceMode("anthropic", "system"), "serif");
  assert.equal(fontForAppearanceMode("default", "mono"), "system");
  assert.equal(fontForAppearanceMode("custom", "kaiti"), "kaiti");
});
