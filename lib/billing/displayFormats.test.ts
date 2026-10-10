import assert from "node:assert/strict";
import { test } from "node:test";
import { calcCost, fmtCost, fmtMoneyPair, fmtTokens } from "./displayFormats";

test("usage estimates keep cached and uncached token prices separate", () => {
  assert.equal(calcCost(100, 20, 40, { input: 2, cachedInput: 0.5, output: 4 }), 0.00022);
  assert.equal(calcCost(100, 20, 40), 0);
  assert.equal(calcCost(0, 0, 0, { input: 2, cachedInput: 0.5, output: 4 }), 0);
});

test("dashboard presentation preserves small costs and explicit exchange-rate conversion", () => {
  assert.equal(fmtCost(0), "¥0");
  assert.equal(fmtCost(0.0002), "¥0.0002");
  assert.equal(fmtMoneyPair(7, 7), "¥7.00 / $1.00");
  assert.equal(fmtTokens(999), "999");
  assert.equal(fmtTokens(1500), "1.5K");
  assert.equal(fmtTokens(1500000), "1.5M");
});
