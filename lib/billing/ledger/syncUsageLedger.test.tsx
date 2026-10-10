import { afterEach, describe, expect, it, vi } from "vitest";
import { createBillingRecord, useBillingStore } from "@/lib/stores/billing";
import { summarizeSessionLedger, toUsageLedgerViewRow } from "./ledgerView";
import { refreshBillingFromLedger } from "./syncUsageLedger";

vi.mock("@/lib/storage/idbStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/idbStorage")>();
  return {
    ...actual,
    idbStorage: {
      getItem: vi.fn(async () => null),
      setItem: vi.fn(),
      setItemLazy: vi.fn(),
      removeItem: vi.fn(async () => {}),
    },
  };
});

const MIMO = "mimo-v2.5";
const MIMO_PRO = "mimo-v2.5-pro";

function ledgerJson(over: Record<string, unknown> = {}) {
  return toUsageLedgerViewRow({
    id: "11111111-1111-1111-1111-111111111111",
    occurred_at: "2026-09-12T00:00:00.000Z",
    session_id: "s1",
    kind: "llm",
    selected_model_id: MIMO,
    actual_model_id: MIMO,
    prompt_tokens: 1_000,
    completion_tokens: 500,
    cached_tokens: 0,
    image_count: 0,
    cost_cny: 0.002,
    route: "/api/chat",
    ...over,
  });
}

afterEach(() => {
  useBillingStore.setState({ records: [] });
});

describe("refreshBillingFromLedger", () => {
  it("用已落库 cost_cny 替换本地按当前模型重算的金额，看板与账本一致", async () => {
    const local = createBillingRecord({
      type: "chat",
      modelId: MIMO_PRO,
      sessionId: "s1",
      customGroups: [],
      usage: { promptTokens: 1_000, completionTokens: 500, cachedTokens: 0, totalTokens: 1_500 },
    });
    useBillingStore.setState({ records: [local] });
    const ok = await refreshBillingFromLedger(async () => Response.json({ records: [ledgerJson()] }));
    expect(ok).toBe(true);
    const stored = useBillingStore.getState().records;
    expect(stored).toHaveLength(1);
    expect(stored[0].cost).toBe(0.002);
    expect(stored[0].sessionId).toBe("s1");
    const dash = summarizeSessionLedger(stored, "s1");
    const book = stored.filter((r) => r.sessionId === "s1").reduce((n, r) => n + r.cost, 0);
    expect(dash.costCny).toBe(book);
  });

  it("切会话刷新时保留尚未回读的乐观行", async () => {
    useBillingStore.setState({
      records: [{
        id: "optimistic",
        timestamp: 50,
        modelId: MIMO,
        modelLabel: MIMO,
        providerCategory: "mimo",
        type: "chat",
        promptTokens: 80,
        completionTokens: 20,
        cachedTokens: 0,
        totalTokens: 100,
        cost: 0.01,
        sessionId: "s1",
      }],
    });
    const ok = await refreshBillingFromLedger(async () => Response.json({ records: [ledgerJson()] }));
    expect(ok).toBe(true);
    const stored = useBillingStore.getState().records;
    expect(stored.some((r) => r.id === "optimistic")).toBe(true);
    expect(stored.find((r) => r.promptTokens === 1_000)?.cost).toBe(0.002);
  });

  it("未登录或失败时不动 store", async () => {
    const keep = createBillingRecord({
      type: "chat",
      modelId: MIMO,
      sessionId: "s1",
      customGroups: [],
      usage: { promptTokens: 10, completionTokens: 5, cachedTokens: 0, totalTokens: 15 },
    });
    useBillingStore.setState({ records: [keep] });
    const denied = await refreshBillingFromLedger(async () => new Response("{}", { status: 401 }));
    expect(denied).toBe(false);
    expect(useBillingStore.getState().records[0].id).toBe(keep.id);
  });
});
