// 会话「脊柱」：把一条长会话按轮次（1 条 user + 后续 assistant/工具活动）切片，
// 产出只含轻量元信息的 spine 与「多少轮进一个 chunk」的持久化计划。
// 窗口化加载的全部几何关系都在这里：UI 只拿 spine 就能画定位点、算「还要不要加载更早」，
// 存储层只拿 spine 就知道一条消息落在哪个 chunk —— 两边都不需要先读消息正文。

import type { ChatMessage } from "@/lib/types/chat";
import { getMessageText } from "@/lib/chat/messages/messageParts";
import { collectSessionSourceRounds } from "@/lib/chat/sources/traceSources";
import { collectMessageImages } from "@/lib/agent/sessionImages";
import { collectSessionProducts } from "@/lib/chat/session/sessionProducts";

/** 一个持久化 chunk 装多少轮。流式 flush 只重写尾部 chunk，这个值决定单次 flush 的上界。 */
export const TURNS_PER_CHUNK = 8;
/** 会话打开时先加载的尾轮数（用户口径：最近三四次）。 */
export const INITIAL_WINDOW_TURNS = 4;
/** 「加载更早」一次往前补多少轮。 */
export const EARLIER_TURNS_BATCH = 8;

/** 一轮派生计数：顶栏徽标 / 来源列开关用它，整会话合计不必扫消息体。 */
export interface TurnDerivedCounts {
  sources: number;
  images: number;
  products: number;
}

export interface TurnSpineEntry {
  /** 0 基轮次；第一条 user 之前的孤儿消息（导入/旧数据）归进第 0 轮 prelude。 */
  turn: number;
  /** 持久化 chunk 下标 = floor(turn / TURNS_PER_CHUNK)。 */
  chunk: number;
  /** 该轮首条消息在全量消息数组里的下标。 */
  firstIndex: number;
  messageCount: number;
  firstMessageId: string;
  /** 该轮的 user 消息 id；prelude（没有 user）为 null，定位点跳过它。 */
  userMessageId: string | null;
  /** user 文本预览（定位点 hover 文案）。 */
  preview: string;
  timestamp: number;
  counts: TurnDerivedCounts;
}

export interface SessionPlan {
  spine: TurnSpineEntry[];
  /** chunks[i] = 第 i 个 chunk 的消息数组（连续切片）。 */
  chunks: ChatMessage[][];
}

/** 单轮（或一小段消息）的派生计数；store 在追加消息时增量维护 spine 也用它。 */
export function turnCountsOf(messages: ChatMessage[]): TurnDerivedCounts {
  const rounds = collectSessionSourceRounds(messages);
  return {
    sources: rounds.reduce((sum, round) => sum + round.sources.length, 0),
    images: collectMessageImages(messages.flatMap((message) => message.parts)).length,
    products: collectSessionProducts(messages).length,
  };
}

function emptyCounts(): TurnDerivedCounts {
  return { sources: 0, images: 0, products: 0 };
}

/**
 * 把一段「连续消息切片」分组为轮次并产出 spine 条目。
 * startTurn/startIndex/chunkBase 是这段切片在全量会话里的偏移——
 * 持久化层重建尾部 chunk 的 spine 时复用同一套分组逻辑，结果与全量 plan 一致。
 */
export function buildChunkSpine(
  messages: ChatMessage[],
  offset: { startTurn: number; startIndex: number; chunkIndex: number },
): TurnSpineEntry[] {
  const spine: TurnSpineEntry[] = [];
  let current: TurnSpineEntry | null = null;
  let currentMessages: ChatMessage[] = [];
  const flush = () => {
    if (!current) return;
    current.counts = turnCountsOf(currentMessages);
    spine.push(current);
    current = null;
    currentMessages = [];
  };
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    const startsTurn = message.role === "user" || current === null;
    if (startsTurn) {
      flush();
      const turn = offset.startTurn + spine.length;
      const isUser = message.role === "user";
      current = {
        turn,
        chunk: offset.chunkIndex + Math.floor(spine.length / TURNS_PER_CHUNK),
        firstIndex: offset.startIndex + i,
        messageCount: 0,
        firstMessageId: message.id,
        userMessageId: isUser ? message.id : null,
        preview: isUser ? getMessageText(message).replace(/\s+/g, " ").trim().slice(0, 80) : "",
        timestamp: typeof message.timestamp === "number" ? message.timestamp : 0,
        counts: emptyCounts(),
      };
      currentMessages = [message];
    } else {
      currentMessages.push(message);
    }
    if (current) current.messageCount += 1;
  }
  flush();
  return spine;
}

/** 全量会话 → spine + 分块。v2→v3 迁移与整段重写都走这里。 */
export function planSessionChunks(messages: ChatMessage[]): SessionPlan {
  const spine = buildChunkSpine(messages, { startTurn: 0, startIndex: 0, chunkIndex: 0 });
  const chunkCount = Math.max(1, Math.ceil(Math.max(spine.length, 1) / TURNS_PER_CHUNK));
  const chunks: ChatMessage[][] = Array.from({ length: chunkCount }, () => []);
  for (const entry of spine) {
    const end = entry.firstIndex + entry.messageCount;
    chunks[entry.chunk].push(...messages.slice(entry.firstIndex, end));
  }
  // 极端兜底：spine 为空（空会话）时 chunks = [[]]；spine 覆盖不到的消息（不应发生）并进尾块。
  const covered = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (covered < messages.length) {
    chunks[chunks.length - 1].push(...messages.slice(covered));
  }
  return { spine, chunks };
}

/** spine 的派生计数合计：顶栏徽标 / 来源列开关只需要它，不需要消息正文。 */
export function spineDerivedTotals(spine: readonly TurnSpineEntry[]): TurnDerivedCounts {
  const totals = emptyCounts();
  for (const entry of spine) {
    totals.sources += entry.counts.sources;
    totals.images += entry.counts.images;
    totals.products += entry.counts.products;
  }
  return totals;
}

/** 尾部窗口：返回覆盖最近 tailTurns 轮的轮次下界（含）。 */
export function windowStartTurn(turnCount: number, tailTurns = INITIAL_WINDOW_TURNS): number {
  return Math.max(0, turnCount - tailTurns);
}

/** 轮次区间 [fromTurn, toTurnExclusive) 对应的全局消息下标区间。 */
export function turnsToMessageRange(
  spine: readonly TurnSpineEntry[],
  messageCount: number,
  fromTurn: number,
  toTurnExclusive: number,
): { start: number; end: number } {
  const first = spine[fromTurn];
  if (!first) return { start: messageCount, end: messageCount };
  const next = spine[toTurnExclusive];
  return { start: first.firstIndex, end: next ? next.firstIndex : messageCount };
}

/**
 * 整段替换（replaceMessages / 云拉取）后的尾部窗口切片：
 * 手里已有全量数组，不必再回读存储，直接按同一套轮次几何切出窗口。
 */
export function tailWindowSlice(
  messages: ChatMessage[],
  tailTurns = INITIAL_WINDOW_TURNS,
): { messages: ChatMessage[]; startTurn: number; startIndex: number; spine: TurnSpineEntry[] } {
  const plan = planSessionChunks(messages);
  const startTurn = windowStartTurn(plan.spine.length, tailTurns);
  const { start } = turnsToMessageRange(plan.spine, messages.length, startTurn, plan.spine.length);
  return { messages: messages.slice(start), startTurn, startIndex: start, spine: plan.spine };
}

/** 定位点条目：spine 直接映射，index 用全局消息下标（窗口外为负数相对下标由调用方换算）。 */
export function dotEntriesFromSpine(spine: readonly TurnSpineEntry[]): {
  index: number;
  id: string;
  preview: string;
  turn: number;
}[] {
  return spine
    .filter((entry) => entry.userMessageId !== null)
    .map((entry) => ({
      index: entry.firstIndex,
      id: entry.userMessageId as string,
      preview: entry.preview,
      turn: entry.turn,
    }));
}
