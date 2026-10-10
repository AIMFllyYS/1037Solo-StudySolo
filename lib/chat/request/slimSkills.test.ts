import assert from "node:assert/strict";
import { test } from "node:test";
import { slimSkillsForRequest } from "./slimSkills.ts";
import type { ChatMessage } from "@/lib/types/chat";
import type { Skill } from "@/lib/types/skill";

function skill(id: string, pinned = false, content = "正文"): Skill {
  return { id, name: id, description: "d", content, pinned, createdAt: 1 };
}

test("slimSkillsForRequest：小包保留全文，过大时只留固定与已用", () => {
  const small = [skill("a"), skill("b")];
  assert.equal(slimSkillsForRequest(small)[0]?.content, "正文");

  const huge = Array.from({ length: 8 }, (_, i) => skill(`s${i}`, i === 0, "x".repeat(12_000)));
  const used: ChatMessage[] = [{
    id: "m",
    role: "assistant",
    timestamp: 1,
    parts: [{
      type: "tool-useSkill",
      toolCallId: "c1",
      state: "output-available",
      input: { name: "s2" },
      output: { text: "【已加载】", contextKey: "skill:s2", skill: "s2", found: true },
    } as ChatMessage["parts"][number]],
  }];
  const slim = slimSkillsForRequest(huge, used);
  assert.ok((slim[0]?.content.length ?? 0) > 0);
  assert.ok((slim[2]?.content.length ?? 0) > 0);
  assert.equal(slim[1]?.content, "");
});
