import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { useAgentProductPicker } from "./agentProductPicker.ts";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import { closeManagedWindow } from "@/lib/keyboard/windowActions";

beforeEach(() => {
  useAgentProductPicker.setState({ open: false, kind: "document" });
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
});

test("openPicker lists Agent documents or artifacts in a managed window", () => {
  useAgentProductPicker.getState().openPicker("document");
  const win = useWindowManager.getState().windows.find((item) => item.type === "agent-product-picker");
  assert.equal(win?.title, "导入长文本");
  assert.equal(useAgentProductPicker.getState().kind, "document");
  closeManagedWindow(win!);
  assert.equal(useAgentProductPicker.getState().open, false);
});
