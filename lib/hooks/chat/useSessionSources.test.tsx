import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSessionSourceRounds } from "./useSessionSources";
import { useChatHistory } from "../../stores/chat/chatHistory";
import type { ChatMessage, ChatMessagePart } from "@/lib/types/chat";

function searchNotesPart(query: string, path: string, title: string) {
  return {
    type: "tool-searchNotes",
    toolCallId: `n-${path}`,
    state: "output-available",
    input: { query },
    output: { text: "ok", hits: [{ title, path, snippet: "" }] },
  };
}

function assistantMessage(id: string, parts: ChatMessagePart[]): ChatMessage {
  return { id, role: "assistant", parts, timestamp: 1 };
}

const messageA = assistantMessage("a1", [searchNotesPart("贝叶斯", "p1", "贝叶斯")] as ChatMessagePart[]);
const messageB = assistantMessage("a2", [searchNotesPart("全概率", "p2", "全概率")] as ChatMessagePart[]);

function setSessions(sessions: Record<string, ChatMessage[]>, activeSessionId: string | null) {
  useChatHistory.setState({ messagesById: sessions, activeSessionId });
}

beforeEach(() => {
  setSessions({}, null);
});

afterEach(() => {
  cleanup();
  setSessions({}, null);
});

describe("useSessionSourceRounds", () => {
  it("returns the active session's rounds, flat sources and total", () => {
    setSessions({ s1: [messageA, messageB] }, "s1");
    const { result } = renderHook(() => useSessionSourceRounds());

    expect(result.current.rounds.map((round) => round.query)).toEqual(["贝叶斯", "全概率"]);
    expect(result.current.sources.map((source) => (source.kind === "note" ? source.path : ""))).toEqual(["p1", "p2"]);
    expect(result.current.total).toBe(2);
    // 扁平数组与 rounds 共用同一批对象：来源面板靠 sources.indexOf(source) 反查下标。
    expect(result.current.sources[0]).toBe(result.current.rounds[0].sources[0]);
    expect(result.current.sources[1]).toBe(result.current.rounds[1].sources[0]);
  });

  it("返回稳定引用：同一批消息重复渲染拿到同一个对象", () => {
    setSessions({ s1: [messageA] }, "s1");
    const { result, rerender } = renderHook(() => useSessionSourceRounds());
    const first = result.current;

    rerender();
    rerender();

    expect(result.current).toBe(first);
    expect(result.current.rounds).toBe(first.rounds);
    expect(result.current.sources).toBe(first.sources);
  });

  it("没有来源时也是稳定引用（空结果是同一个对象）", () => {
    setSessions({ s1: [assistantMessage("a3", [{ type: "text", text: "没有工具" }])] }, "s1");
    const { result, rerender } = renderHook(() => useSessionSourceRounds());
    const first = result.current;

    rerender();

    expect(first.total).toBe(0);
    expect(result.current).toBe(first);
  });

  it("换一批消息 / 换对话都会给出新的引用与数据", () => {
    setSessions({ s1: [messageA], s2: [messageB] }, "s1");
    const { result } = renderHook(() => useSessionSourceRounds());
    const first = result.current;
    expect(first.total).toBe(1);

    act(() => setSessions({ s1: [messageA, messageB], s2: [messageB] }, "s1"));
    const second = result.current;
    expect(second).not.toBe(first);
    expect(second.total).toBe(2);

    act(() => setSessions({ s1: [messageA, messageB], s2: [messageB] }, "s2"));
    const third = result.current;
    expect(third).not.toBe(second);
    expect(third.rounds.map((round) => round.query)).toEqual(["全概率"]);
  });

  it("可以显式指定对话 id，不受 activeSessionId 影响", () => {
    setSessions({ s1: [messageA], s2: [messageB] }, "s1");
    const { result } = renderHook(() => useSessionSourceRounds("s2"));

    expect(result.current.total).toBe(1);
    expect(result.current.rounds[0].query).toBe("全概率");
  });
});
