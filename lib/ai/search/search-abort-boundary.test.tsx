// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ search: vi.fn(), billable: vi.fn() }));
vi.mock("@/lib/ai/search/searchService", () => ({
  localSearchAvailability: () => true,
  searchLocalIndex: f.search,
  localVectorModel: () => "synthetic-model",
  localIndexBuiltAt: () => "fixture-built-at",
}));
vi.mock("@/lib/ai/embedding", () => ({ getQueryEmbeddingClient: () => ({ embed: async () => [0.1, 0.2] }) }));
vi.mock("@/lib/billing/settlement/billableFetch", () => ({ billableJsonFetch: f.billable }));

import { hybridSearchWithDiagnostics } from "./hybridSearch";

const previousMode = process.env.AI_SEARCH_MODE;
const previousFallbackKey = process.env.ZHIPU_API_KEY;
afterEach(() => {
  if (previousMode === undefined) delete process.env.AI_SEARCH_MODE; else process.env.AI_SEARCH_MODE = previousMode;
  if (previousFallbackKey === undefined) delete process.env.ZHIPU_API_KEY; else process.env.ZHIPU_API_KEY = previousFallbackKey;
  f.search.mockReset(); f.billable.mockReset();
});

it("an aborted rerank never starts the fallback provider", async () => {
  process.env.AI_SEARCH_MODE = "vector";
  process.env.ZHIPU_API_KEY = "synthetic-fallback-key";
  const controller = new AbortController();
  f.search.mockResolvedValue([{ id: "a#0", path: "probability/detail/a", subjectId: "probability", subjectName: "概率论", categoryId: "detail", itemId: "a", title: "条件概率", chunkIndex: 0, text: "贝叶斯公式", score: 1 }]);
  f.billable.mockImplementation(async () => { controller.abort(); throw new DOMException("cancelled", "AbortError"); });
  await expect(hybridSearchWithDiagnostics("贝叶斯公式", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(f.billable).toHaveBeenCalledTimes(1);
  expect(f.search).toHaveBeenCalledTimes(1);
});
