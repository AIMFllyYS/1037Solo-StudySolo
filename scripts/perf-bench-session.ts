/**
 * 长会话加载/写放大合成基准 —— 性能审查 Phase B 实测工具。
 * 运行: npx tsx scripts/perf-bench-session.ts
 *
 * 模拟三条真实路径的成本:
 * 1. loadSessionMessages 读路径 = JSON.parse + normalizeStoredMessages + compactStudyMessages
 *    (lib/storage/chatStorage.ts:183-196)
 * 2. saveSessionMessages 写路径 = compactStudyMessages + JSON.stringify
 *    (lib/storage/chatStorage.ts:198-204, 每次 IDB flush 全量执行)
 * 3. updateMessage 每 60ms tick 的 prev.map 全数组复制
 *    (lib/stores/chatHistory.ts:459-488)
 */
import { serializeSessionMessages } from "../lib/storage/chatStorage";
import { normalizeStoredMessages } from "../lib/chat/messages/messageParts";
import { compactStudyMessages } from "../lib/chat/messages/compactStudyParts";
import type { ChatMessage } from "../lib/types/chat";

const TEXT =
  "细胞内膜系统包括内质网、高尔基体、溶酶体、内体和分泌泡等结构。信号肽识别颗粒(SRP)是核糖核蛋白复合物,由 7SL RNA 和 6 个多肽组成,能识别新生多肽链 N 端的信号肽序列,使翻译暂时停滞,并将整个核糖体-新生肽复合物引导至内质网膜上的 SRP 受体。随后 SRP 释放,GTP 水解供能,核糖体被移交给 Sec61 转位子通道,翻译恢复,新生肽链边合成边进入内质网腔。";
const REASONING =
  "用户问的是信号肽与 SRP 的关系。需要先区分 SRP 与 SRP 受体:SRP 结合信号肽并暂停翻译,SRP 受体位于 ER 膜上负责对接。还要提到 GTP 水解驱动释放,以及 Sec61 转位子的作用。";

function userMsg(i: number): ChatMessage {
  return {
    id: `u-${i}`,
    role: "user",
    parts: [{ type: "text", text: `${i}. 请解释${TEXT.slice(0, 40)}……(第${i}问)` }],
    timestamp: 1700000000000 + i * 60000,
  } as unknown as ChatMessage;
}

function assistantMsg(i: number, withTool: boolean): ChatMessage {
  const parts: unknown[] = [{ type: "reasoning", text: REASONING.repeat(3) }];
  if (withTool) {
    parts.push(
      {
        type: "tool-searchNotes",
        toolCallId: `call-${i}`,
        state: "output-available",
        input: { query: "信号肽 SRP" },
        output: {
          hits: Array.from({ length: 5 }, (_, k) => ({
            title: `命中${k}`,
            snippet: TEXT.slice(0, 80),
            id: `n-${k}`,
          })),
        },
      },
      { type: "step-start" },
    );
  }
  parts.push({ type: "text", text: TEXT.repeat(8) });
  return {
    id: `a-${i}`,
    role: "assistant",
    parts,
    metadata: { modelId: "m-1", durationMs: 8000, stepDurationsMs: { s1: 300, s2: 1200 } },
    timestamp: 1700000000000 + i * 60000 + 30000,
    followUpQuestions: ["SRP 由什么组成?", "Sec61 是什么?"],
  } as unknown as ChatMessage;
}

function buildSession(nMessages: number): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (let i = 0; i < nMessages / 2; i++) {
    msgs.push(userMsg(i));
    msgs.push(assistantMsg(i, i % 3 === 0));
  }
  return msgs;
}

function bench(label: string, fn: () => unknown, iters = 5): void {
  fn(); // warmup
  const times: number[] = [];
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  console.log(`  ${label}: avg=${avg.toFixed(1)}ms min=${min.toFixed(1)}ms (${iters} iters)`);
}

for (const n of [200, 500, 1000, 2000]) {
  const session = buildSession(n);
  const bytes = Buffer.byteLength(serializeSessionMessages(session), "utf8");
  console.log(`\n=== ${n} 条消息 (${(bytes / 1024 / 1024).toFixed(2)}MB JSON) ===`);

  // 写路径: 每次 updateMessage → saveSessionMessages → flush 的成本
  bench("serialize(compact+stringify,每次flush)", () => serializeSessionMessages(session));

  // 读路径: loadSessionMessages 的三阶段
  const raw = JSON.stringify(session);
  bench("JSON.parse(整blob)", () => JSON.parse(raw));
  const parsed = JSON.parse(raw) as unknown[];
  bench("normalizeStoredMessages", () => normalizeStoredMessages(parsed));
  const normalized = normalizeStoredMessages(parsed);
  bench("compactStudyMessages(persist)", () => compactStudyMessages(normalized, "persist"));
  bench("读路径合计(parse+normalize+compact)", () => {
    const p = JSON.parse(raw) as unknown[];
    compactStudyMessages(normalizeStoredMessages(p), "persist");
  });

  // updateMessage 每 tick: prev.map 全数组 + 目标消息新对象
  const targetId = session[session.length - 1].id;
  bench(
    "updateMessage map(O(n)/tick,16次/s流式)",
    () => {
      const updated = { ...session[session.length - 1] };
      session.map((m) => (m.id === targetId ? updated : m));
    },
    20,
  );
}

// ── 重度变体: 大工具输出/文档附件 —— 真实会话常见(webSearch/读笔记全文回传几十KB) ──
const BIG = TEXT.repeat(40); // ~12KB 单条工具输出
for (const n of [200, 500, 1000]) {
  const session = buildSession(n).map((m) =>
    m.role === "assistant"
      ? ({
          ...m,
          parts: [
            ...(m.parts as unknown[]).slice(0, -1),
            { type: "tool-webSearch", toolCallId: `ws-${m.id}`, state: "output-available", input: { q: "x" }, output: { results: Array.from({ length: 8 }, () => ({ title: TEXT.slice(0, 30), snippet: BIG, url: "https://x" })) } },
            { type: "tool-readNotes", toolCallId: `rn-${m.id}`, state: "output-available", input: {}, output: { text: BIG.repeat(3) } },
            (m.parts as unknown[]).at(-1),
          ],
        } as unknown as ChatMessage)
      : m,
  );
  const bytes = Buffer.byteLength(serializeSessionMessages(session), "utf8");
  console.log(`\n=== 重度 ${n} 条消息 (${(bytes / 1024 / 1024).toFixed(2)}MB JSON) ===`);
  bench("serialize(compact+stringify,每次flush)", () => serializeSessionMessages(session));
  const raw = JSON.stringify(session);
  bench("读路径合计(parse+normalize+compact)", () => {
    const p = JSON.parse(raw) as unknown[];
    compactStudyMessages(normalizeStoredMessages(p), "persist");
  });
}

console.log("\n完成。");
