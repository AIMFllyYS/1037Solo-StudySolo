import { create } from "zustand";

export interface NoteLocatorRequest {
  path: string;
  snippet: string;
  nonce: number;
}

interface NoteLocatorState {
  request: NoteLocatorRequest | null;
  locate: (path: string, snippet?: string) => void;
  consume: (nonce: number) => void;
}

export const useNoteLocator = create<NoteLocatorState>((set, get) => ({
  request: null,

  locate: (path, snippet = "") => {
    if (!path) return;
    set({
      request: {
        path,
        snippet,
        nonce: (get().request?.nonce ?? 0) + 1,
      },
    });
  },

  consume: (nonce) => {
    const current = get().request;
    if (current && current.nonce === nonce) set({ request: null });
  },
}));
