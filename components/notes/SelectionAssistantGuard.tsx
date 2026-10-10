"use client";

import { useEffect } from "react";
import { useSettings } from "@/lib/stores/settings";
import {
  applyForeignSelectionBlockAttr,
  shouldPreventForeignSelectionMenu,
} from "@/lib/notes/selectionAssistant";

/** 全站挂载：按设置给 html 打标，并尽量拦截系统/浏览器划词菜单。 */
export default function SelectionAssistantGuard() {
  const blockForeign = useSettings((s) => s.blockForeignSelectionAssistants);

  useEffect(() => {
    applyForeignSelectionBlockAttr(document.documentElement, blockForeign);
    if (!blockForeign) return;

    const block = (e: Event) => {
      if (!shouldPreventForeignSelectionMenu(true, window.getSelection())) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", block, true);
    document.addEventListener("dragstart", block, true);
    return () => {
      document.removeEventListener("contextmenu", block, true);
      document.removeEventListener("dragstart", block, true);
      applyForeignSelectionBlockAttr(document.documentElement, false);
    };
  }, [blockForeign]);

  return null;
}
