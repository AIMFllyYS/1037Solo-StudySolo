"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useSettings } from "@/lib/stores/settings";
import { getAllModels } from "@/lib/ai/models";
import { labelCls } from "./_shared";
import AppSelect from "@/components/ui/AppSelect";
import { useT } from "@/lib/i18n";
import SettingsDisclosure from "./SettingsDisclosure";

export function ImageSection() {
  const customApiGroups = useSettings((s) => s.customApiGroups);
  const defaultImageModelId = useSettings((s) => s.defaultImageModelId);
  const setDefaultImageModel = useSettings((s) => s.setDefaultImageModel);
  const imageModeTextModel = useSettings((s) => s.imageModeTextModel);
  const setImageModeTextModel = useSettings((s) => s.setImageModeTextModel);
  const imageModeTextModelFallback = useSettings((s) => s.imageModeTextModelFallback);
  const setImageModeTextModelFallback = useSettings((s) => s.setImageModeTextModelFallback);
  const [imageGenExpanded, setImageGenExpanded] = useState(true);
  const t = useT();
  const allTextModels = getAllModels(customApiGroups).filter((m) => m.type !== "image");

  return (
    <SettingsDisclosure expanded={imageGenExpanded} onToggle={() => setImageGenExpanded((v) => !v)}
      icon={<Sparkles size={14} />} title={t("settings.image.title")} meta={t("settings.image.meta")}>
        <div className="flex flex-col gap-2.5">
          <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
            {t("settings.image.desc")}
          </p>
          <div className="flex items-center justify-between rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2">
            <div className="text-[12.5px] text-[var(--md-sys-color-on-surface)]">
              {t("settings.image.current")}
            </div>
            <div className="text-[11.5px] text-[var(--md-sys-color-primary)]">
              {defaultImageModelId ?? t("settings.image.fallback")}
            </div>
          </div>
          {defaultImageModelId && (
            <button
              onClick={() => setDefaultImageModel(null)}
              className="press self-start rounded-lg border border-[var(--md-sys-color-outline-variant)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--md-sys-color-on-surface-variant)]"
            >
              {t("settings.image.clear")}
            </button>
          )}
          <div>
            <label className={labelCls}>{t("settings.image.textModel")}</label>
            <AppSelect label={t("settings.image.textModelAria")} value={imageModeTextModel} onValueChange={setImageModeTextModel}
              options={allTextModels.map((m) => ({ value: m.id, label: `${m.label} · ${m.group}` }))} />
          </div>
          <div>
            <label className={labelCls}>{t("settings.image.fallbackModel")}</label>
            <AppSelect label={t("settings.image.fallbackModelAria")} value={imageModeTextModelFallback} onValueChange={setImageModeTextModelFallback}
              options={allTextModels.map((m) => ({ value: m.id, label: `${m.label} · ${m.group}` }))} />
          </div>
        </div>
    </SettingsDisclosure>
  );
}
