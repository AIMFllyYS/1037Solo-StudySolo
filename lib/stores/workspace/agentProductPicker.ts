import { create } from "zustand";
import { useWindowManager, type AgentProductKind } from "@/lib/stores/workspace/windowManager";
import { AGENT_PRODUCT_PICKER_WINDOW_ID } from "@/lib/notes/userNote";
import { translateNow, type I18nKey } from "@/lib/i18n/index";

interface AgentProductPickerState {
  open: boolean;
  kind: AgentProductKind;
  openPicker: (kind: AgentProductKind) => void;
  closePicker: () => void;
}

/**
 * 窗口标题的文案 key（值见 panel.addMenu.document / artifact，与右栏「＋」菜单同一批入口）。
 * 标题要经 windowManager 的通用窗口 chrome 渲染（任务栏 / 标签条都直接读 win.title），
 * 所以这里在开窗时就把 key 翻成当前语言，而不是让 chrome 每个渲染点各 t() 一次。
 */
function pickerTitleKey(kind: AgentProductKind): I18nKey {
  return kind === "document" ? "panel.addMenu.document" : "panel.addMenu.artifact";
}

function pickerWindowGeometry() {
  if (typeof window === "undefined") {
    return { pos: { x: 36, y: 68 }, size: { width: 780, height: 580 } };
  }
  const width = Math.min(820, Math.floor(window.innerWidth * 0.66));
  const height = Math.min(640, Math.floor(window.innerHeight * 0.8));
  return {
    pos: {
      x: Math.max(16, Math.floor(window.innerWidth * 0.16)),
      y: Math.max(16, Math.floor(window.innerHeight * 0.1)),
    },
    size: { width, height },
  };
}

export const useAgentProductPicker = create<AgentProductPickerState>((set) => ({
  open: false,
  kind: "document",

  openPicker: (kind) => {
    const { pos, size } = pickerWindowGeometry();
    useWindowManager.getState().openWindow({
      id: AGENT_PRODUCT_PICKER_WINDOW_ID,
      type: "agent-product-picker",
      title: translateNow(pickerTitleKey(kind)),
      pos,
      size,
      data: { kind },
    });
    set({ open: true, kind });
  },

  closePicker: () => {
    useWindowManager.getState().closeWindow(AGENT_PRODUCT_PICKER_WINDOW_ID);
    set({ open: false });
  },
}));
