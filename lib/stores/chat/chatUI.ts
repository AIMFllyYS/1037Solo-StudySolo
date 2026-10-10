import { create } from 'zustand';

// 聊天区轻量 UI 态。划词的「解释/举例/追问」浮窗已迁到多开系统 useFloatingChats；
// 这里保留「引用到输入框」的选区文本（ChatInput 消费），以及按笔记隔离的引用槽
// （笔记窗内嵌「笔记对话」用——全局 quotedText 会串进主对话，不能共用）。
interface ChatUIState {
  quotedText: string | null;
  setQuotedText: (text: string) => void;
  clearQuotedText: () => void;
  /** 笔记内嵌 Agent 的引用槽：key = noteId，由笔记划词工具栏「引用」写入。 */
  noteQuotes: Record<string, string>;
  setNoteQuote: (noteId: string, text: string) => void;
  clearNoteQuote: (noteId: string) => void;
}

export const useChatUI = create<ChatUIState>((set) => ({
  quotedText: null,
  setQuotedText: (text) => set({ quotedText: text }),
  clearQuotedText: () => set({ quotedText: null }),
  noteQuotes: {},
  setNoteQuote: (noteId, text) =>
    set((s) => ({ noteQuotes: { ...s.noteQuotes, [noteId]: text } })),
  clearNoteQuote: (noteId) =>
    set((s) => {
      if (!(noteId in s.noteQuotes)) return s;
      const next = { ...s.noteQuotes };
      delete next[noteId];
      return { noteQuotes: next };
    }),
}));
