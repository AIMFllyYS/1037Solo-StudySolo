"use client";

import { BookText } from "lucide-react";
import PencilSparklesIcon from "@/components/icons/PencilSparklesIcon";
import SkillsManager from "./SkillsManager";
import { h3Cls } from "./_shared";
import { useT } from "@/lib/i18n";

export function SkillsSection() {
  const t = useT();
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <PencilSparklesIcon size={14} className="text-[var(--md-sys-color-primary)]" />
        <h3 className={h3Cls}>{t("settings.skills.title")}</h3>
      </div>
      <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        {t("settings.skills.descPrefix")}
        <BookText size={11} className="inline align-text-bottom" />
        {t("settings.skills.descSuffix")}
      </p>
      <SkillsManager />
    </section>
  );
}
