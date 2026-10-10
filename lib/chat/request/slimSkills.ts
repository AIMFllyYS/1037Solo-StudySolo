import type { ChatMessage } from "@/lib/types/chat";
import type { Skill } from "@/lib/types/skill";
import { payloadByteSize } from "@/lib/sync/payload";
import { toolNameFromPart } from "@/lib/chat/messages/compactStudyParts";

/** 技能全文合计低于此值时整包带上，保证本轮 useSkill 能取到正文。 */
export const SKILL_CONTENT_KEEP_ALL_BYTES = 64 * 1024;

function usedSkillKeys(messages: Array<{ parts?: Array<{ type: string; state?: string; output?: unknown; input?: unknown; toolName?: string }> }>): Set<string> {
  const keys = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (toolNameFromPart(part) !== "useSkill") continue;
      const output = part.output && typeof part.output === "object" ? part.output as Record<string, unknown> : null;
      const input = part.input && typeof part.input === "object" ? part.input as Record<string, unknown> : null;
      const skill = String(output?.skill ?? input?.name ?? "");
      const key = typeof output?.contextKey === "string" ? output.contextKey : "";
      if (skill) keys.add(skill.toLowerCase());
      if (key.startsWith("skill:")) keys.add(key.slice("skill:".length));
    }
  }
  return keys;
}

function withoutContent(skill: Skill): Skill {
  if (!skill.content) return skill;
  return { ...skill, content: "" };
}

export function slimSkillsForRequest(skills: Skill[], messages: ChatMessage[] = []): Skill[] {
  if (skills.length === 0) return skills;
  if (payloadByteSize(skills) <= SKILL_CONTENT_KEEP_ALL_BYTES) return skills;
  const used = usedSkillKeys(messages);
  return skills.map((skill) => {
    const keep =
      skill.pinned ||
      used.has(skill.id) ||
      used.has(skill.name.toLowerCase());
    return keep ? skill : withoutContent(skill);
  });
}
