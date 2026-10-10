"use client";

import { Globe } from "lucide-react";
import { useSettings } from "@/lib/stores/settings";
import { h3Cls, inputCls } from "./_shared";
import { useT } from "@/lib/i18n";

export function ContextSection() {
  const globalContext = useSettings((s) => s.globalContext);
  const setGlobalContext = useSettings((s) => s.setGlobalContext);
  const t = useT();

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Globe size={14} className="text-[var(--md-sys-color-primary)]" />
        <h3 className={h3Cls}>{t("settings.context.title")}</h3>
      </div>
      <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        {t("settings.context.desc")}
      </p>
      <textarea
        value={globalContext}
        onChange={(e) => setGlobalContext(e.target.value)}
        placeholder={t("settings.context.placeholder")}
        rows={4}
        className={inputCls + " resize-y leading-relaxed"}
      />
      <div className="self-end text-[10.5px] text-[var(--md-sys-color-on-surface-variant)]">
        {t("settings.context.count", { count: globalContext.length })}
      </div>
    </section>
  );
}
