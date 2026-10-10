import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { processRecord } from "@/lib/review/startRecord";
import { useReviewCards } from "@/lib/stores/learning/reviewCards";

function resetReviewCards() {
  useReviewCards.setState({ byId: {}, order: [], _hasHydrated: true });
}

afterEach(() => {
  resetReviewCards();
});

test("processRecord passes AbortSignal to fetch and keeps processing state on AbortError", async () => {
  resetReviewCards();
  useReviewCards.setState({
    byId: {
      card_1: {
        id: "card_1",
        subjectId: "probability",
        categoryId: "detail",
        itemId: "01",
        sourceLabel: "概率论 / 详解 / 01",
        originalText: "样本文本",
        cardType: "qa",
        front: "",
        back: "",
        status: "saved",
        createdAt: 1,
      },
    },
    order: ["card_1"],
  });

  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    receivedSignal = init?.signal ?? undefined;
    throw new DOMException("aborted", "AbortError");
  }) as typeof fetch;

  try {
    const result = await processRecord("card_1", "excerpt", {}, undefined, controller.signal);
    assert.deepEqual(result, { ok: false, error: "aborted" });
    assert.equal(receivedSignal, controller.signal);
    const card = useReviewCards.getState().byId.card_1;
    assert.equal(card.status, "processing");
    assert.equal(card.error, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
