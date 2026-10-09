"use client";

import type { Skill } from "@/lib/types/skill";
import {
  COMPOSER_COMPACT_LABEL,
  COMPOSER_PLAN_LABEL,
  FORCED_COMPOSER_TOOLS,
  FORCED_TOOL_LABELS,
  type ComposerForcedTool,
  type ForcedComposerTool,
  skillForcedTool,
} from "@/lib/chat/composerIntent";
import { useT } from "@/lib/i18n";
import { CompactContextIcon, ForcedToolIcon, PlanModeIcon, SkillIcon } from "./ComposerIcons";

export type ComposerCommandId = "plan" | "compact" | ComposerForcedTool;

export interface ComposerToggle {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

export interface ComposerCommandPanelProps {
  planMode: boolean;
  planAllowed: boolean;
  forcedTool?: ComposerForcedTool;
  skills: Skill[];
  query?: string;
  activeIndex?: number;
  /** 顶部开关区（深度思考 / 联网搜索）：只在从「+」打开且没有输入过滤词时显示。 */
  toggles?: ComposerToggle[];
  onSelectPlan: () => void;
  onSelectCompact: () => void;
  onSelectTool: (tool: ForcedComposerTool) => void;
  onSelectSkill: (skill: Skill) => void;
}

export function listComposerCommands(input: {
  planAllowed: boolean;
  skills: Skill[];
  query?: string;
}): Array<{ id: ComposerCommandId; kind: "plan" | "compact" | "tool" | "skill"; skill?: Skill }> {
  const query = input.query?.trim().toLowerCase() ?? "";
  const match = (label: string) => !query || label.toLowerCase().includes(query);
  const items: Array<{ id: ComposerCommandId; kind: "plan" | "compact" | "tool" | "skill"; skill?: Skill }> = [];
  if (input.planAllowed && match(COMPOSER_PLAN_LABEL)) items.push({ id: "plan", kind: "plan" });
  if (match(COMPOSER_COMPACT_LABEL)) items.push({ id: "compact", kind: "compact" });
  for (const tool of FORCED_COMPOSER_TOOLS) {
    if (match(FORCED_TOOL_LABELS[tool]) || match(tool)) items.push({ id: tool, kind: "tool" });
  }
  for (const skill of input.skills) {
    if (match(skill.name) || match(skill.description)) {
      items.push({ id: skillForcedTool(skill.id), kind: "skill", skill });
    }
  }
  return items;
}

export default function ComposerCommandPanel({
  planMode,
  planAllowed,
  forcedTool,
  skills,
  query,
  activeIndex = 0,
  toggles,
  onSelectPlan,
  onSelectCompact,
  onSelectTool,
  onSelectSkill,
}: ComposerCommandPanelProps) {
  const t = useT();
  const items = listComposerCommands({ planAllowed, skills, query });
  const showPlan = items.some((item) => item.kind === "plan");
  const showCompact = items.some((item) => item.kind === "compact");
  const tools = items.filter((item) => item.kind === "tool");
  const skillItems = items.filter((item) => item.kind === "skill");
  const selectedId = items[activeIndex]?.id;
  const showToggles = Boolean(toggles?.length) && !query?.trim();

  return (
    <div className="composer-command-panel" data-testid="composer-command-panel" role="listbox" aria-label={t("menu.composer.aria")}>
      {showToggles ? (
        <div className="composer-toggle-group" data-testid="composer-toggles">
          {toggles!.map((toggle) => (
            <button
              key={toggle.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={toggle.on}
              disabled={toggle.disabled}
              data-testid={`composer-toggle-${toggle.id}`}
              className="app-menu-item composer-toggle-row"
              onClick={toggle.onToggle}
            >
              <span className="app-menu-check">{toggle.icon}</span>
              <span className="composer-toggle-text">
                {toggle.label}
                {toggle.hint ? <small>{toggle.hint}</small> : null}
              </span>
              <span className="composer-switch" data-on={toggle.on || undefined} aria-hidden="true"><i /></span>
            </button>
          ))}
          <div className="app-menu-separator" />
        </div>
      ) : null}
      {showPlan && (
        <button
          type="button"
          role="option"
          aria-selected={selectedId === "plan"}
          className="app-menu-item"
          onClick={onSelectPlan}
        >
          <span className="app-menu-check"><PlanModeIcon /></span>
          <span>{t("menu.composer.plan")}</span>
          {planMode ? <span className="composer-command-on">{t("menu.composer.on")}</span> : null}
        </button>
      )}
      {showCompact && (
        <button
          type="button"
          role="option"
          aria-selected={selectedId === "compact"}
          className="app-menu-item"
          onClick={onSelectCompact}
        >
          <span className="app-menu-check"><CompactContextIcon /></span>
          <span>{t("menu.composer.compact")}</span>
        </button>
      )}
      {(showPlan || showCompact) && tools.length > 0 ? <div className="app-menu-separator" /> : null}
      {tools.length > 0 ? <div className="app-menu-heading">{t("menu.composer.toolsHeading")}</div> : null}
      {tools.map((item) => {
        const tool = item.id as ForcedComposerTool;
        return (
          <button
            key={tool}
            type="button"
            role="option"
            aria-selected={selectedId === tool}
            className="app-menu-item"
            onClick={() => onSelectTool(tool)}
          >
            <span className="app-menu-check"><ForcedToolIcon tool={tool} /></span>
            <span>{t(`menu.composer.tool.${tool}`)}</span>
            {forcedTool === tool ? <span className="composer-command-on">{t("menu.composer.selected")}</span> : null}
          </button>
        );
      })}
      {skillItems.length > 0 ? <div className="app-menu-separator" /> : null}
      {skillItems.length > 0 ? <div className="app-menu-heading">{t("menu.composer.skillsHeading")}</div> : null}
      {skillItems.map((item) => (
        <button
          key={item.skill!.id}
          type="button"
          role="option"
          aria-selected={selectedId === skillForcedTool(item.skill!.id)}
          className="app-menu-item"
          onClick={() => onSelectSkill(item.skill!)}
        >
          <span className="app-menu-check"><SkillIcon /></span>
          <span>{item.skill!.name}</span>
          {forcedTool === skillForcedTool(item.skill!.id) ? <span className="composer-command-on">{t("menu.composer.selected")}</span> : null}
        </button>
      ))}
      {items.length === 0 ? <div className="app-menu-heading">{t("menu.composer.empty")}</div> : null}
    </div>
  );
}
