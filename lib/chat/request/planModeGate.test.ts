import assert from "node:assert/strict";
import { test } from "node:test";
import { readPlanModeGate, resolvePlanMode } from "./planModeGate.ts";

test("planModeGate：缺省允许且不强制；设置代理可关/可强制", () => {
  assert.deepEqual(readPlanModeGate({}), { allowed: true, forced: false, defaultOn: false });
  assert.deepEqual(readPlanModeGate(undefined), { allowed: true, forced: false, defaultOn: false });
  assert.equal(readPlanModeGate({ planModeAllowed: false }).allowed, false);
  assert.equal(readPlanModeGate({ allowPlanMode: false }).allowed, false);
  assert.equal(readPlanModeGate({ planModeForced: true }).forced, true);
  assert.equal(readPlanModeGate({ forcePlanMode: true }).defaultOn, true);
  assert.equal(readPlanModeGate({ planMode: true }).defaultOn, true);
  assert.equal(readPlanModeGate({ agentPlanMode: { allowed: false, forced: true } }).forced, false);
  assert.equal(readPlanModeGate({ agentPlanMode: { allowed: true, forced: true } }).forced, true);
  assert.equal(resolvePlanMode(true, { planModeAllowed: false }), false);
  assert.equal(resolvePlanMode(false, { planModeForced: true }), true);
  assert.equal(resolvePlanMode(true, {}), true);
});
