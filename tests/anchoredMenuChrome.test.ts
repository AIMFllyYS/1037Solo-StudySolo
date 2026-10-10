import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import { APP_MENU_Z_INDEX } from "@/lib/ui/anchoredMenuPosition";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("AnchoredMenu waits for layout and uses the shared stacking constant", () => {
  const menu = readWorkspaceFile("components/ui/AnchoredMenu.tsx");
  const css = readWorkspaceFile("app/styles/prose.css");
  const select = readWorkspaceFile("components/ui/AppSelect.tsx");
  const palette = readWorkspaceFile("components/chat/composer/ComposerPalette.tsx");

  assert.match(menu, /from "@\/lib\/ui\/anchoredMenuPosition"/);
  assert.match(menu, /data-placed=\{box \? "true" : "false"\}/);
  assert.match(menu, /isUsableAnchorRect/);
  assert.doesNotMatch(menu, /left:\s*8,\s*top:\s*8/);
  assert.match(palette, /from "@\/lib\/ui\/anchoredMenuPosition"/);
  assert.match(palette, /data-placed=\{box \? "true" : "false"\}/);
  assert.match(palette, /isUsableAnchorRect/);
  assert.match(palette, /createPortal/);
  assert.match(palette, /document\.body/);
  assert.doesNotMatch(palette, /left:\s*8,\s*top:\s*8/);
  assert.match(css, /\.app-menu\s*\{[^}]*z-index:\s*12000/);
  assert.match(css, /\.app-menu:not\(\[data-placed="true"\]\)/);
  assert.match(css, /\.agent-settings-overlay\s*\{[^}]*z-index:\s*10000/);
  assert.match(css, /\.app-dialog-backdrop\s*\{[^}]*z-index:\s*10020/);
  assert.ok(APP_MENU_Z_INDEX > 10000);
  assert.ok(APP_MENU_Z_INDEX > 10020);
  assert.match(select, /from "\.\/AnchoredMenu"/);
  assert.doesNotMatch(select, /createPortal/);
});

test("settings and shared pickers go through AnchoredMenu", () => {
  const files = [
    "components/layout/settings/AppearanceSettingsControls.tsx",
    "components/chat/settings/ModelSection.tsx",
    "components/chat/settings/ImageSection.tsx",
    "components/chat/settings/ModelForm.tsx",
    "components/chat/settings/CapabilityEndpointsSection.tsx",
    "components/chat/composer/ThinkingMenu.tsx",
    "components/notes/SubjectPickerMenu.tsx",
    "components/search/GlobalSearchFilterMenu.tsx",
    "components/review/recordPreview/moreMenu.tsx",
    "components/layout/navigation/ModeSwitcher.tsx",
  ];
  for (const path of files) {
    const source = readWorkspaceFile(path);
    assert.match(
      source,
      /from "@\/components\/ui\/(?:AppSelect|AnchoredMenu)"/,
      `${path} should reuse AppSelect or AnchoredMenu`,
    );
  }
});
