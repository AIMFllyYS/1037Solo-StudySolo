import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRequestSettings, type RequestSettingsInput } from "./resolveRequestSettings.ts";

const settings = (partial: Partial<RequestSettingsInput> = {}): RequestSettingsInput => ({
  selectedModelId: "z-ai/glm-5.3-flash",
  customApiGroups: [],
  defaultThinkingEffort: "medium",
  ...partial,
});

test("resolveRequestSettings：ovModelId 覆盖选中模型", () => {
  const resolved = resolveRequestSettings(settings(), undefined, undefined, "Tongyi-MAI/Z-Image-Turbo");
  assert.equal(resolved.effectiveModelId, "Tongyi-MAI/Z-Image-Turbo");
  assert.equal(resolved.model?.thinking, false);
});

test("resolveRequestSettings：无思考能力的模型即使请求思考也不开", () => {
  const resolved = resolveRequestSettings(
    settings({ selectedModelId: "Tongyi-MAI/Z-Image-Turbo" }),
    { enableThinking: true, thinkingEffort: "high" },
    undefined,
  );
  assert.equal(resolved.enableThinking, false);
  assert.equal(resolved.thinkingEffort, undefined);
});

test("resolveRequestSettings：思考力度 sendOptions > options > settings", () => {
  const fromSend = resolveRequestSettings(
    settings(),
    { enableThinking: true, thinkingEffort: "low" },
    { enableThinking: true, thinkingEffort: "max" },
  );
  assert.equal(fromSend.enableThinking, true);
  assert.equal(fromSend.thinkingEffort, "max");

  const fromOptions = resolveRequestSettings(settings(), { enableThinking: true, thinkingEffort: "low" }, { enableThinking: true });
  assert.equal(fromOptions.thinkingEffort, "low");

  const fromSettings = resolveRequestSettings(settings({ defaultThinkingEffort: "high" }), { enableThinking: true }, { enableThinking: true });
  assert.equal(fromSettings.thinkingEffort, "high");
});

test("resolveRequestSettings：搜索与上下文模式", () => {
  const resolved = resolveRequestSettings(settings(), { enableSearch: true, contextMode: "semantic" }, undefined);
  assert.equal(resolved.enableSearch, true);
  assert.equal(resolved.contextMode, "semantic");
  assert.equal(resolveRequestSettings(settings(), undefined, undefined).contextMode, "full");
});
