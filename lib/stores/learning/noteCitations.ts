import { create } from "zustand";
import { useWindowManager } from "@/lib/stores/workspace/windowManager";
import type { SearchHit } from "@/lib/ai/agent/toolTypes";

export const NOTE_CITATION_WINDOW_ID = "note-citation-viewer";

interface NoteCitationsState {
  hits: SearchHit[];
  activePath: string | null;
  openViewer: (hits: SearchHit[], path?: string) => void;
  setActivePath: (path: string) => void;
  closeViewer: () => void;
}

function citationWindowGeometry() {
  if (typeof window === "undefined") {
    return { pos: { x: 24, y: 64 }, size: { width: 860, height: 720 } };
  }
  const width = Math.min(920, Math.floor(window.innerWidth * 0.76));
  const height = Math.min(Math.floor(window.innerHeight * 0.9), 820);
  return {
    pos: { x: Math.max(16, Math.floor(window.innerWidth * 0.12)), y: Math.max(16, Math.floor(window.innerHeight * 0.05)) },
    size: { width, height },
  };
}

function titleOf(hits: SearchHit[], path: string | null): string {
  const hit = hits.find((item) => item.path === path) ?? hits[0];
  return hit?.title ? `引用笔记 · ${hit.title}` : "引用笔记";
}

export const useNoteCitations = create<NoteCitationsState>((set, get) => ({
  hits: [],
  activePath: null,

  openViewer: (hits, path) => {
    const activePath = path ?? hits[0]?.path ?? null;
    if (!hits.length || !activePath) return;
    const { pos, size } = citationWindowGeometry();
    useWindowManager.getState().openWindow({
      id: NOTE_CITATION_WINDOW_ID,
      type: "note-citation-viewer",
      title: titleOf(hits, activePath),
      pos,
      size,
      data: { activePath },
    });
    set({ hits, activePath });
  },

  setActivePath: (path) => {
    const { hits } = get();
    if (!hits.some((hit) => hit.path === path)) return;
    useWindowManager.getState().updateWindow(NOTE_CITATION_WINDOW_ID, { title: titleOf(hits, path) });
    set({ activePath: path });
  },

  closeViewer: () => {
    useWindowManager.getState().closeWindow(NOTE_CITATION_WINDOW_ID);
    set({ hits: [], activePath: null });
  },
}));
