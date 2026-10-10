import { subjectLabel, type NoteLibraryIntent } from "@/lib/notes/userNote";

export function stickyNoteGeometry(anchor?: { x: number; y: number }) {
  const width = 360;
  const height = 328;
  if (typeof window === "undefined") {
    return { pos: { x: 48, y: 80 }, size: { width, height } };
  }
  const x = anchor
    ? Math.min(Math.max(Math.round(anchor.x - width / 2), 16), window.innerWidth - width - 16)
    : Math.max(16, Math.floor(window.innerWidth * 0.18));
  const y = anchor
    ? Math.min(Math.max(Math.round(anchor.y + 10), 16), window.innerHeight - height - 16)
    : Math.max(16, Math.floor(window.innerHeight * 0.16));
  return { pos: { x, y }, size: { width, height } };
}

/** Review-origin classroom notes use the full workspace; other classroom notes remain sticky. */
export function reviewSelectionNoteGeometry(anchor?: { x: number; y: number }) {
  if (typeof window === "undefined") {
    return { pos: { x: 40, y: 48 }, size: { width: 1120, height: 760 } };
  }
  const width = Math.max(240, Math.min(1240, window.innerWidth - 32));
  const height = Math.max(240, Math.min(820, window.innerHeight - 32));
  const x = anchor
    ? Math.min(Math.max(Math.round(anchor.x - width / 2), 16), Math.max(16, window.innerWidth - width - 16))
    : Math.max(16, Math.floor((window.innerWidth - width) / 2));
  const y = anchor
    ? Math.min(Math.max(Math.round(anchor.y - height * 0.42), 16), Math.max(16, window.innerHeight - height - 16))
    : Math.max(16, Math.floor((window.innerHeight - height) / 2));
  return { pos: { x, y }, size: { width, height } };
}

export function editorWindowGeometry(openCount: number) {
  if (typeof window === "undefined") {
    return { pos: { x: 40, y: 72 }, size: { width: 900, height: 680 } };
  }
  const width = Math.min(960, Math.floor(window.innerWidth * 0.72));
  const height = Math.min(760, Math.floor(window.innerHeight * 0.86));
  const offset = (openCount % 6) * 26;
  return {
    pos: {
      x: Math.max(16, Math.floor(window.innerWidth * 0.1) + offset),
      y: Math.max(16, Math.floor(window.innerHeight * 0.06) + offset),
    },
    size: { width, height },
  };
}

export function libraryWindowGeometry() {
  if (typeof window === "undefined") {
    return { pos: { x: 32, y: 64 }, size: { width: 860, height: 640 } };
  }
  const width = Math.min(880, Math.floor(window.innerWidth * 0.7));
  const height = Math.min(720, Math.floor(window.innerHeight * 0.84));
  return {
    pos: {
      x: Math.max(16, Math.floor(window.innerWidth * 0.14)),
      y: Math.max(16, Math.floor(window.innerHeight * 0.08)),
    },
    size: { width, height },
  };
}

export function libraryTitle(intent: NoteLibraryIntent, subjectId: string | null): string {
  if (intent === "cite") return "选择笔记";
  return subjectId ? `笔记 · ${subjectLabel(subjectId)}` : "笔记";
}