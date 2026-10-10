"use client";

import { AgentCheckIcon, AgentLoopIcon } from "@/components/icons/AgentIcons";
import type { ThinkingEffort } from "@/lib/hooks/useSettings";
import AnchoredMenu from "@/components/ui/AnchoredMenu";
import { useT } from "@/lib/i18n/index";

/** 档位代号（Low/Med/High/Max）中英一致，不进词典；说明文案走 hintKey。 */
export const THINKING_EFFORT_OPTIONS: { value: ThinkingEffort; label: string; hintKey: string }[] = [
  { value: "low", label: "Low", hintKey: "menu.thinking.hint.low" },
  { value: "medium", label: "Med", hintKey: "menu.thinking.hint.medium" },
  { value: "high", label: "High", hintKey: "menu.thinking.hint.high" },
  { value: "max", label: "Max", hintKey: "menu.thinking.hint.max" },
];

export interface ThinkingMenuButtonProps {
  enabled: boolean;
  effort: ThinkingEffort;
  onChange: (next: { enabled: boolean; effort: ThinkingEffort }) => void;
  supported: boolean;
  disabled?: boolean;
  levels?: ThinkingEffort[];
  allowOff?: boolean;
}

/** Wide toolbar and compact overflow share the same capability-aware choices. */
export function ThinkingMenuItems({ enabled, effort, onChange, levels, allowOff = true, disabled }: ThinkingMenuButtonProps) {
  const t = useT();
  const options = THINKING_EFFORT_OPTIONS.filter((option) => !levels || levels.includes(option.value));
  const choices = [
    ...(allowOff ? [{ id: "off", label: t("menu.thinking.off.label"), hint: t("menu.thinking.off.hint"), active: !enabled, next: { enabled: false, effort } }] : []),
    ...(options.length ? options.map((option) => ({ id: option.value, label: option.label, hint: t(option.hintKey),
      active: enabled && effort === option.value, next: { enabled: true, effort: option.value } }))
      : [{ id: "on", label: t("menu.thinking.on.label"), hint: t("menu.thinking.on.hint"), active: enabled, next: { enabled: true, effort } }]),
  ];
  return <div role="group" aria-label={t("menu.thinking.title")}>
    <div className="app-menu-heading">{t("menu.thinking.title")}{!allowOff && <span>{t("menu.thinking.required")}</span>}</div>
    {choices.map((choice) => <button key={choice.id} type="button" role="menuitemradio" aria-checked={choice.active}
      disabled={disabled} className="app-menu-item" data-testid={`thinking-menu-option-${choice.id}`} onClick={() => onChange(choice.next)}>
      <span className="app-menu-check">{choice.active && <AgentCheckIcon size={12} />}</span>
      <span><span>{choice.label}</span><small>{choice.hint}</small></span>
    </button>)}
  </div>;
}

export default function ThinkingMenuButton(props: ThinkingMenuButtonProps) {
  const t = useT();
  const options = THINKING_EFFORT_OPTIONS.filter((option) => !props.levels || props.levels.includes(option.value));
  const current = options.find((option) => option.value === props.effort) ?? options[0];
  const activeLabel = props.enabled ? (current?.label ?? t("menu.thinking.active")) : null;
  return <AnchoredMenu label={t("menu.thinking.title")} disabled={props.disabled || !props.supported} placement="top" width={240}
    testId="thinking-menu-button" triggerData={{ "data-enabled": props.enabled && props.supported ? "1" : "0", "data-effort": activeLabel ? props.effort : "" }}
    className={`chat-input-toggle chat-input-toggle-thinking ${props.enabled ? "chat-input-toggle-thinking-active" : ""}`}
    trigger={<><AgentLoopIcon size={12} /><span className="chat-input-toggle-text">{activeLabel ? t("menu.thinking.trigger", { level: activeLabel }) : t("menu.thinking.title")}</span></>}>
    {(close) => <ThinkingMenuItems {...props} onChange={(next) => { props.onChange(next); close(); }} />}
  </AnchoredMenu>;
}
