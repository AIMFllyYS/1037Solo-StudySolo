"use client";

import { useState } from "react";
import { BookmarkPlus, Brain, Boxes, Globe, Star } from "lucide-react";
import { useSettings } from "@/lib/stores/settings";
import { useT } from "@/lib/i18n";
import { MODELS, isPickerHiddenModel, getAllModels } from "@/lib/ai/models";
import { Toggle, h3Cls, labelCls } from "./_shared";
import AppSelect from "@/components/ui/AppSelect";
import SettingsDisclosure from "./SettingsDisclosure";
import SelectionAssistantPreview from "./SelectionAssistantPreview";

export function BuiltinModelsSection() {
  const defaultImageModelId = useSettings((s) => s.defaultImageModelId);
  const setDefaultImageModel = useSettings((s) => s.setDefaultImageModel);
  const [builtinExpanded, setBuiltinExpanded] = useState(false);
  const t = useT();

  const builtinImageModels = MODELS.filter((m) => m.type === "image");
  const builtinTextModels = MODELS.filter((m) => m.type !== "image" && !isPickerHiddenModel(m.id));
  const builtinVisibleCount = builtinTextModels.length + builtinImageModels.length;

  return (
      <SettingsDisclosure expanded={builtinExpanded} onToggle={() => setBuiltinExpanded((v) => !v)}
        icon={<Boxes size={14} />} title={t("settings.models.builtin.title")}
        meta={t("settings.models.builtin.meta", { count: builtinVisibleCount })}>
          <div className="flex flex-col gap-2">
            <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
              {t("settings.models.builtin.desc")}
            </p>
            <div>
              <div className={labelCls}>{t("settings.models.builtin.textModels", { count: builtinTextModels.length })}</div>
              <div className="flex flex-col gap-1.5">
                {builtinTextModels.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">
                          {m.label}
                        </span>
                        {m.thinking && (
                          <span
                            className="shrink-0 rounded px-1 text-[9px]"
                            style={{
                              background: "var(--md-sys-color-surface-container-high)",
                              color: "var(--md-sys-color-on-surface-variant)",
                            }}
                          >
                            {t("settings.models.badge.thinking")}
                          </span>
                        )}
                        {m.vision && (
                          <span
                            className="shrink-0 rounded px-1 text-[9px]"
                            style={{
                              background:
                                "color-mix(in srgb, var(--md-sys-color-tertiary) 15%, transparent)",
                              color: "var(--md-sys-color-tertiary)",
                            }}
                          >
                            {t("settings.models.badge.vision")}
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-[var(--md-sys-color-on-surface-variant)]">
                        {m.group} · {m.contextK}K{" "}
                        {m.pricing && `· ¥${m.pricing.input}/${m.pricing.output}`}
                      </div>
                      {m.vendorTrainingNotice && (
                        <div
                          className="mt-1 rounded px-1.5 py-1 text-[11px] font-medium leading-snug"
                          style={{
                            background: "color-mix(in srgb, var(--md-sys-color-error) 12%, transparent)",
                            color: "var(--md-sys-color-error)",
                          }}
                          data-testid="vendor-training-notice"
                        >
                          {m.vendorTrainingNotice}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {builtinImageModels.length > 0 && (
              <div>
                <div className={labelCls}>{t("settings.models.builtin.imageModels", { count: builtinImageModels.length })}</div>
                <div className="flex flex-col gap-1.5">
                  {builtinImageModels.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">
                            {m.label}
                          </span>
                          <span
                            className="shrink-0 rounded px-1 text-[9px]"
                            style={{
                              background:
                                "color-mix(in srgb, var(--md-sys-color-secondary) 18%, transparent)",
                              color: "var(--md-sys-color-secondary)",
                            }}
                          >
                            {t("settings.models.badge.image")}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-[var(--md-sys-color-on-surface-variant)]">
                          {m.hint}
                        </div>
                      </div>
                      <button
                        onClick={() => setDefaultImageModel(m.id)}
                        title={t(
                          defaultImageModelId === m.id
                            ? "settings.models.imageDefault.is"
                            : "settings.models.imageDefault.set",
                        )}
                        className="rounded p-1 hover:bg-[var(--md-sys-color-surface-container-high)]"
                        style={{
                          color:
                            defaultImageModelId === m.id
                              ? "var(--md-sys-color-primary)"
                              : "var(--md-sys-color-on-surface-variant)",
                        }}
                      >
                        <Star
                          size={13}
                          fill={defaultImageModelId === m.id ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
      </SettingsDisclosure>
  );
}

export function RecordAssistantSection() {
  const customApiGroups = useSettings((s) => s.customApiGroups);
  const recordModelId = useSettings((s) => s.recordModelId);
  const setRecordModelId = useSettings((s) => s.setRecordModelId);
  const floatingChatModelId = useSettings((s) => s.floatingChatModelId);
  const setFloatingChatModelId = useSettings((s) => s.setFloatingChatModelId);
  const quizModelId = useSettings((s) => s.quizModelId);
  const setQuizModelId = useSettings((s) => s.setQuizModelId);
  const selectionAssistantEnabled = useSettings((s) => s.selectionAssistantEnabled);
  const setSelectionAssistantEnabled = useSettings((s) => s.setSelectionAssistantEnabled);
  const selectionAssistantActions = useSettings((s) => s.selectionAssistantActions);
  const setSelectionAssistantAction = useSettings((s) => s.setSelectionAssistantAction);
  const blockForeignSelectionAssistants = useSettings((s) => s.blockForeignSelectionAssistants);
  const setBlockForeignSelectionAssistants = useSettings((s) => s.setBlockForeignSelectionAssistants);
  const t = useT();
  const allTextModels = getAllModels(customApiGroups).filter((m) => m.type !== "image");

  return (
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <BookmarkPlus size={14} className="text-[var(--md-sys-color-primary)]" />
          <h3 className={h3Cls}>{t("settings.models.assistant.title")}</h3>
        </div>
        <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
          {t("settings.models.assistant.desc")}
        </p>
        <div>
          <label className={labelCls}>{t("settings.models.assistant.recordModel")}</label>
          <AppSelect label={t("settings.models.assistant.recordModelAria")} value={recordModelId} onValueChange={setRecordModelId}
            options={allTextModels.map((m) => ({ value: m.id, label: `${m.label} · ${m.group}` }))} />
          <div className="mt-1 text-[10.5px] text-[var(--md-sys-color-on-surface-variant)]">
            {t("settings.models.assistant.recordModelHint")}
          </div>
        </div>
        <div>
          <label className={labelCls}>{t("settings.models.assistant.floatingModel")}</label>
          <AppSelect label={t("settings.models.assistant.floatingModelAria")} value={floatingChatModelId} onValueChange={setFloatingChatModelId}
            options={allTextModels.map((m) => ({ value: m.id, label: `${m.label} · ${m.group}` }))} />
          <div className="mt-1 text-[10.5px] text-[var(--md-sys-color-on-surface-variant)]">
            {t("settings.models.assistant.floatingModelHint")}
          </div>
        </div>
        <div>
          <label className={labelCls}>{t("settings.models.assistant.quizModel")}</label>
          <AppSelect label={t("settings.models.assistant.quizModelAria")} value={quizModelId} onValueChange={setQuizModelId}
            options={allTextModels.map((m) => ({ value: m.id, label: `${m.label} · ${m.group}` }))} />
          <div className="mt-1 text-[10.5px] text-[var(--md-sys-color-on-surface-variant)]">
            {t("settings.models.assistant.quizModelHint")}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2">
          <div>
            <div className="text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">{t("settings.models.assistant.enable")}</div>
            <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              {t("settings.models.assistant.enableDesc")}
            </div>
          </div>
          <Toggle on={selectionAssistantEnabled} onClick={() => setSelectionAssistantEnabled(!selectionAssistantEnabled)} />
        </div>

        <SelectionAssistantPreview
          actions={selectionAssistantActions}
          enabled={selectionAssistantEnabled}
          onToggle={setSelectionAssistantAction}
        />

        <div className="flex items-center justify-between rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2">
          <div className="min-w-0 pr-3">
            <div className="text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">{t("settings.models.assistant.blockForeign")}</div>
            <div className="text-[11px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
              {t("settings.models.assistant.blockForeignDesc")}
            </div>
          </div>
          <Toggle on={blockForeignSelectionAssistants} onClick={() => setBlockForeignSelectionAssistants(!blockForeignSelectionAssistants)} />
        </div>
      </section>
  );
}

export function DefaultsSection() {
  const defaultThinking = useSettings((s) => s.defaultThinking);
  const setDefaultThinking = useSettings((s) => s.setDefaultThinking);
  const defaultThinkingEffort = useSettings((s) => s.defaultThinkingEffort);
  const setDefaultThinkingEffort = useSettings((s) => s.setDefaultThinkingEffort);
  const defaultSearch = useSettings((s) => s.defaultSearch);
  const setDefaultSearch = useSettings((s) => s.setDefaultSearch);
  const t = useT();

  return (
      <section className="flex flex-col gap-2">
        <h3 className={h3Cls}>{t("settings.models.defaults.title")}</h3>
        {[
          {
            on: defaultThinking,
            set: setDefaultThinking,
            label: t("settings.models.defaults.thinking"),
            desc: t("settings.models.defaults.thinkingDesc"),
            icon: <Brain size={16} />,
          },
          {
            on: defaultSearch,
            set: setDefaultSearch,
            label: t("settings.models.defaults.search"),
            desc: t("settings.models.defaults.searchDesc"),
            icon: <Globe size={16} />,
          },
        ].map((it) => (
          <div
            key={it.label}
            className="flex items-center justify-between rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-[var(--md-sys-color-primary)]">{it.icon}</span>
              <div>
                <div className="text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">
                  {it.label}
                </div>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  {it.desc}
                </div>
              </div>
            </div>
            <Toggle on={it.on} onClick={() => it.set(!it.on)} />
          </div>
        ))}

        <div
          className={
            "flex flex-col items-stretch gap-3 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2.5 " +
            (defaultThinking ? "" : "opacity-60")
          }
        >
          <div className="flex items-center gap-2.5">
            <span className="text-[var(--md-sys-color-primary)]">
              <Brain size={16} />
            </span>
            <div>
              <div className="text-[12.5px] font-medium text-[var(--md-sys-color-on-surface)]">
                {t("settings.models.defaults.effort")}
              </div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                {t("settings.models.defaults.effortDesc")}
              </div>
            </div>
          </div>
          <div
            role="radiogroup"
            aria-label={t("settings.models.defaults.effort")}
            className="grid grid-cols-4 items-center rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-variant)] p-0.5"
          >
            {(["low", "medium", "high", "max"] as const).map((lvl) => {
              const active = defaultThinkingEffort === lvl;
              const label = lvl === "low" ? "Low" : lvl === "medium" ? "Med" : lvl === "high" ? "High" : "Max";
              const hint = lvl === "low"
                ? "~8k tokens"
                : lvl === "medium"
                ? "~16k tokens"
                : lvl === "high"
                ? "~32k tokens"
                : "~64k tokens";
              return (
                <button
                  key={lvl}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDefaultThinkingEffort(lvl)}
                  title={hint}
                  data-testid={`default-thinking-effort-${lvl}`}
                  className={
                    "px-2 py-0.5 text-[11px] font-medium rounded transition-colors " +
                    (active
                      ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                      : "text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface)]")
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </section>
  );
}
