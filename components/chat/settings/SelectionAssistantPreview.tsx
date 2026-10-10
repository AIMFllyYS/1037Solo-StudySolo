"use client";

import {
  SELECTION_ASSISTANT_ACTIONS,
  SELECTION_ASSISTANT_ACTION_LABELS,
  type SelectionAssistantAction,
  type SelectionAssistantActions,
} from "@/lib/notes/selection/selectionAssistant";
import {
  SELECTION_ACTION_ICONS,
  SelectionPopBtn,
  SelectionPopIconBtn,
  SelectionPopoverCard,
  SelectionPopoverDivider,
} from "@/components/notes/selectionPopoverChrome";
import { useT } from "@/lib/i18n";
import { labelCls } from "./_shared";

const MID_ACTIONS = ["explain", "record", "note", "ask"] as const satisfies readonly SelectionAssistantAction[];

export default function SelectionAssistantPreview({
  actions,
  enabled,
  onToggle,
}: {
  actions: SelectionAssistantActions;
  enabled: boolean;
  onToggle: (action: SelectionAssistantAction, visible: boolean) => void;
}) {
  const t = useT();
  const copyOn = actions.copy !== false;
  const quoteOn = actions.quote !== false;

  return (
    <div
      className={enabled ? "flex flex-col gap-2" : "flex flex-col gap-2 opacity-60"}
      data-testid="selection-assistant-preview"
    >
      <div className={labelCls}>{t("settings.selectionPreview.title")}</div>
      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
        {t("settings.selectionPreview.desc")}
      </p>
      <div
        className="flex justify-center overflow-x-auto rounded-xl px-3 py-4"
        style={{
          background: "var(--md-sys-color-surface-container-lowest)",
          border: "1px solid var(--md-sys-color-outline-variant)",
        }}
      >
        <div className="origin-center scale-[0.86]">
          <SelectionPopoverCard>
            <SelectionPopIconBtn
              onClick={() => onToggle("copy", !copyOn)}
              icon={SELECTION_ACTION_ICONS.copy}
              title={t(SELECTION_ASSISTANT_ACTION_LABELS.copy)}
              active={copyOn}
              disabled={!enabled}
              testId="selection-action-copy"
            />
            <SelectionPopoverDivider />
            {MID_ACTIONS.map((action) => (
              <SelectionPopBtn
                key={action}
                onClick={() => onToggle(action, actions[action] === false)}
                icon={SELECTION_ACTION_ICONS[action]}
                label={t(SELECTION_ASSISTANT_ACTION_LABELS[action])}
                active={actions[action] !== false}
                disabled={!enabled}
                testId={`selection-action-${action}`}
              />
            ))}
            <SelectionPopoverDivider />
            <SelectionPopBtn
              onClick={() => onToggle("quote", !quoteOn)}
              icon={SELECTION_ACTION_ICONS.quote}
              label={t(SELECTION_ASSISTANT_ACTION_LABELS.quote)}
              active={quoteOn}
              disabled={!enabled}
              testId="selection-action-quote"
            />
          </SelectionPopoverCard>
        </div>
      </div>
      <p className="text-[10.5px] text-[var(--md-sys-color-on-surface-variant)]">
        {enabled
          ? t("settings.selectionPreview.count", {
              visible: SELECTION_ASSISTANT_ACTIONS.filter((action) => actions[action] !== false).length,
              total: SELECTION_ASSISTANT_ACTIONS.length,
            })
          : t("settings.selectionPreview.disabled")}
      </p>
    </div>
  );
}
