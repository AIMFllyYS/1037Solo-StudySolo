import assert from "node:assert/strict";
import { test } from "node:test";
import { compactStudyParts } from "./compactStudyParts.ts";
import { rehydrateStudyParts } from "./rehydrateStudyParts.ts";

test("rehydrateStudyParts：按 contextKey 回灌当前页与技能", () => {
  const pageText = "【概率论 > 精读 > 1.4】\n\n" + "条件概率正文".repeat(40);
  const compacted = compactStudyParts([
    {
      type: "tool-getCurrentPage",
      toolCallId: "c1",
      state: "output-available",
      input: {},
      output: { text: pageText, contextKey: "page:probability/detail/1.4" },
    },
    {
      type: "tool-useSkill",
      toolCallId: "c2",
      state: "output-available",
      input: { name: "Bayes" },
      output: { text: "【技能：Bayes】\n步骤一很长", contextKey: "skill:s1", skill: "Bayes", found: true },
    },
  ], "ui-request");

  const pageStub = (compacted[0] as { output: { text: string } }).output.text;
  assert.match(pageStub, /【已加载】/);

  const restored = rehydrateStudyParts(compacted, {
    skills: [{ id: "s1", name: "Bayes", description: "分析错因", content: "步骤一很长", pinned: false, createdAt: 1 }],
    academicYear: "freshman-2",
  });
  const page = restored[0] as { output: { text: string } };
  const skill = restored[1] as { output: { text: string } };
  assert.match(page.output.text, /【/);
  assert.ok(page.output.text.length > pageStub.length);
  assert.match(skill.output.text, /步骤一很长/);
});
