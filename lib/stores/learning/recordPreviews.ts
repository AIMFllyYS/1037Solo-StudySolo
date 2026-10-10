import { create } from "zustand";
import { translateNow } from "@/lib/i18n/index";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";

export interface RecordPreview {
  id: string;
  cardId: string;
}

const WIDTH = 420;
const HEIGHT = 520;
const genId = () => Math.random().toString(36).slice(2, 11);

interface RecordPreviewsState {
  previews: RecordPreview[];
  open: (cardId: string, anchor: { x: number; y: number }) => string;
  close: (id: string) => void;
}

function initialGeometry(anchor: { x: number; y: number }, existingCount: number) {
  const offset = (existingCount % 6) * 30;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const x = Math.max(16, Math.min(anchor.x + 16 + offset, vw - WIDTH - 16));
  const y = Math.max(16, Math.min(anchor.y - 40 + offset, vh - HEIGHT - 16));
  return { pos: { x, y }, size: { width: WIDTH, height: HEIGHT } };
}

export const useRecordPreviews = create<RecordPreviewsState>((set, get) => ({
  previews: [],

  open: (cardId, anchor) => {
    const id = genId();
    const { pos, size } = initialGeometry(anchor, get().previews.length);
    const card = useReviewCards.getState().byId[cardId];
    useWindowManager.getState().openWindow({
      id,
      type: "record-preview",
      // 与右键菜单那条「记录到复习板」同名（menu.contextMenu.record），有来源卡名时缀在后面。
      title: `${translateNow("menu.contextMenu.record")}${card?.sourceLabel ? ` · ${card.sourceLabel}` : ""}`,
      pos,
      size,
      data: { cardId },
    });
    set((state) => ({ previews: [...state.previews, { id, cardId }] }));
    return id;
  },

  close: (id) => {
    useWindowManager.getState().closeWindow(id);
    set((state) => ({ previews: state.previews.filter((preview) => preview.id !== id) }));
  },
}));


