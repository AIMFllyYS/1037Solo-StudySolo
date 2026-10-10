"use client";

import { Keyboard } from "lucide-react";
import { SHORTCUTS, SHORTCUT_CATEGORIES } from "@/lib/keyboard/shortcuts";
import { formatShortcut } from "@/lib/keyboard/format";
import { useKeyboardSettings } from "@/lib/keyboard/useKeyboardSettings";
import { useShortcutHelp } from "@/lib/keyboard/useShortcutHelp";
import { useT, type I18nKey } from "@/lib/i18n/index";

function ShortcutSwitch({
  id,
  labelKey,
  descriptionKey,
}: {
  id: string;
  labelKey: I18nKey;
  descriptionKey: I18nKey;
}) {
  const enabled = useKeyboardSettings((s) => s.isEnabled(id));
  const setEnabled = useKeyboardSettings((s) => s.setEnabled);
  const t = useT();
  const label = t(labelKey);

  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-[var(--md-sys-color-surface-container-high)]">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">{label}</div>
        <div className="text-[11.5px] text-[var(--md-sys-color-on-surface-variant)]">{t(descriptionKey)}</div>
      </div>
      <kbd className="hidden shrink-0 rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--md-sys-color-on-surface-variant)] sm:inline">
        {formatShortcut(id)}
      </kbd>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(id, e.target.checked)}
        className="h-4 w-4 shrink-0 accent-[var(--md-sys-color-primary)]"
        aria-label={t("settings.keyboard.enableAria", { label })}
      />
    </label>
  );
}

export default function KeyboardShortcutsSettings() {
  const disabledCount = useKeyboardSettings((s) => s.disabledShortcuts.length);
  const enableAll = useKeyboardSettings((s) => s.enableAll);
  const disableAll = useKeyboardSettings((s) => s.disableAll);
  const setHelpOpen = useShortcutHelp((s) => s.setOpen);
  const total = SHORTCUTS.length;
  const enabledCount = total - disabledCount;
  const t = useT();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
          {t("settings.keyboard.enabled", { enabled: enabledCount, total })}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={enableAll}
            className="rounded-full px-2.5 py-1 text-[11.5px] font-medium text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary-container)]"
          >
            {t("settings.keyboard.enableAll")}
          </button>
          <button
            type="button"
            onClick={disableAll}
            className="rounded-full px-2.5 py-1 text-[11.5px] font-medium text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]"
          >
            {t("settings.keyboard.disableAll")}
          </button>
        </div>
      </div>

      {SHORTCUT_CATEGORIES.map((cat) => {
        const items = SHORTCUTS.filter((s) => s.category === cat.id);
        if (items.length === 0) return null;
        return (
          <div key={cat.id}>
            <div className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
              {t(cat.labelKey)}
            </div>
            <div className="flex flex-col">
              {items.map((item) => (
                <ShortcutSwitch
                  key={item.id}
                  id={item.id}
                  labelKey={item.labelKey}
                  descriptionKey={item.descriptionKey}
                />
              ))}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        className="press flex items-center justify-center gap-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] py-2.5 text-[12.5px] font-medium text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary-container)]"
      >
        <Keyboard size={14} />
        {t("settings.keyboard.openReference")}
        <kbd className="rounded border border-[var(--md-sys-color-outline-variant)] px-1.5 py-0.5 font-mono text-[10px]">
          {formatShortcut("global.shortcutHelp")}
        </kbd>
      </button>
    </div>
  );
}
