import { describe, it, expect, beforeEach } from "vitest";
import { useChatUI } from "./chatUI";


describe("useChatUI", () => {
  beforeEach(() => {
    useChatUI.getState().clearQuotedText();
  });

  it("初始状态 quotedText 为 null", () => {
    expect(useChatUI.getState().quotedText).toBeNull();
  });

  it("setQuotedText 设置引用文本", () => {
    useChatUI.getState().setQuotedText("这是一段引用");
    expect(useChatUI.getState().quotedText).toBe("这是一段引用");
  });

  it("clearQuotedText 清空引用文本", () => {
    useChatUI.getState().setQuotedText("测试引用");
    useChatUI.getState().clearQuotedText();
    expect(useChatUI.getState().quotedText).toBeNull();
  });

  it("setQuotedText 覆盖之前的值", () => {
    useChatUI.getState().setQuotedText("第一段");
    useChatUI.getState().setQuotedText("第二段");
    expect(useChatUI.getState().quotedText).toBe("第二段");
  });

  describe("noteQuotes（笔记内嵌 Agent 的引用槽）", () => {
    beforeEach(() => {
      useChatUI.setState({ noteQuotes: {} });
    });

    it("setNoteQuote 按笔记写入引用", () => {
      useChatUI.getState().setNoteQuote("n1", "选中的原文");
      expect(useChatUI.getState().noteQuotes.n1).toBe("选中的原文");
    });

    it("不同笔记的引用互相隔离", () => {
      useChatUI.getState().setNoteQuote("n1", "甲笔记");
      useChatUI.getState().setNoteQuote("n2", "乙笔记");
      expect(useChatUI.getState().noteQuotes).toEqual({ n1: "甲笔记", n2: "乙笔记" });
    });

    it("clearNoteQuote 只清指定笔记", () => {
      useChatUI.getState().setNoteQuote("n1", "甲笔记");
      useChatUI.getState().setNoteQuote("n2", "乙笔记");
      useChatUI.getState().clearNoteQuote("n1");
      expect(useChatUI.getState().noteQuotes).toEqual({ n2: "乙笔记" });
    });

    it("清除不存在的笔记不会误建键", () => {
      useChatUI.getState().clearNoteQuote("ghost");
      expect(useChatUI.getState().noteQuotes).toEqual({});
    });

    it("与全局 quotedText 互不干扰", () => {
      useChatUI.getState().setNoteQuote("n1", "笔记内引用");
      useChatUI.getState().setQuotedText("主对话引用");
      expect(useChatUI.getState().quotedText).toBe("主对话引用");
      expect(useChatUI.getState().noteQuotes.n1).toBe("笔记内引用");
    });
  });
});
