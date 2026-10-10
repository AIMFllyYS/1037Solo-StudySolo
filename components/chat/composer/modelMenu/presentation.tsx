"use client";

import { MoreHorizontal } from "lucide-react";

import { type ModelInfo } from "@/lib/ai/models";
import { ModelIcon } from "@/components/icons/ModelBrandIcons";

import { useT } from "@/lib/i18n/index";
import { modelTraits, MAX_TRAIT_DOTS, TRAIT_META, MAX_BRAND_DOTS, formatContextWindow } from "./metadata";
import type { ModelTrait } from "./metadata";
/**
 * 模型名右侧紧贴的特征图标簇：每个小 SVG = 一个分类归属 / 能力标签（无圆框）。
 * 最多铺 3 个，超出收敛为一个「⋯」；悬停任一看全部标签。
 * 颜色全部走主题 token（CATEGORY_COLORS / TRAIT_META），随外观切换自动适配。
 */
export function ModelTraitDots({ model, maxShown = MAX_TRAIT_DOTS }: { model: ModelInfo; maxShown?: number }) {
  const t = useT();
  const traits = modelTraits(model);
  if (traits.length === 0) return null;
  const shown = traits.slice(0, maxShown);
  const hidden = traits.slice(maxShown);
  const label = (key: ModelTrait) => t(TRAIT_META[key].labelKey);
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center gap-[3px]">
      {shown.map((key) => {
        const meta = TRAIT_META[key];
        const Icon = meta.icon;
        return (
          <span key={key} title={label(key)} className="grid shrink-0 place-items-center">
            <Icon size={11} strokeWidth={2.25} aria-hidden className="opacity-80" style={{ color: meta.color }} />
          </span>
        );
      })}
      {hidden.length > 0 ? (
        <span title={traits.map(label).join(" · ")} className="grid shrink-0 place-items-center text-[var(--ink-faint)]">
          <MoreHorizontal size={11} aria-hidden />
        </span>
      ) : null}
    </span>
  );
}
export function CategoryBrandDots({ brands }: { brands: { brand: string; labels: string[] }[] }) {
  if (brands.length === 0) return null;
  const shown = brands.slice(0, MAX_BRAND_DOTS);
  const hidden = brands.slice(MAX_BRAND_DOTS);
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center -space-x-[3px]">
      {shown.map(({ brand, labels }) => (
        <span key={brand} title={labels.join(" · ")}
          className="model-brand-dot grid place-items-center rounded-full border border-[var(--line)] bg-[var(--bg-elevated)]">
          <ModelIcon brand={brand === "default" ? undefined : brand} size={10} decorative />
        </span>
      ))}
      {hidden.length > 0 ? (
        <span title={hidden.flatMap((b) => b.labels).join(" · ")}
          className="model-brand-dot grid place-items-center rounded-full border border-[var(--line)] bg-[var(--bg-muted)] text-[var(--ink-faint)]">
          <MoreHorizontal size={9} aria-hidden />
        </span>
      ) : null}
    </span>
  );
}

export function ModelDetails({
  model,
  onUse,
}: {
  model: ModelInfo;
  onUse: () => void;
}) {
  const t = useT();
  const ctx = formatContextWindow(model.contextK);
  const badges: { key: string; label: string; className: string }[] = [];
  if (model.vision) {
    badges.push({
      key: "vision",
      label: t("menu.model.badge.vision"),
      className: "bg-[color-mix(in_srgb,var(--md-sys-color-tertiary)_15%,transparent)] text-[var(--md-sys-color-tertiary)]",
    });
  }
  if (ctx) {
    badges.push({
      key: "ctx",
      label: t("menu.model.badge.context", { window: ctx }),
      className: "bg-[var(--bg-muted)] text-[var(--ink-soft)]",
    });
  }
  if (model.thinking) {
    badges.push({
      key: "think",
      label: model.thinkingRequired ? t("menu.model.badge.thinkingRequired") : t("menu.model.badge.thinking"),
      className: "bg-[var(--bg-muted)] text-[var(--ink-soft)]",
    });
  }
  if (model.type === "image") {
    badges.push({
      key: "image",
      label: t("menu.model.badge.image"),
      className: "bg-[color-mix(in_srgb,var(--md-sys-color-secondary)_18%,transparent)] text-[var(--md-sys-color-secondary)]",
    });
  }

  return (
    <>
      <div className="px-2 pb-2">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1 break-words text-[13px] font-semibold text-[var(--ink)]">{model.label}</div>
          <ModelTraitDots model={model} />
        </div>
        <div className="mt-2 text-[12px] leading-relaxed text-[var(--ink-soft)]">{model.hint}</div>
        {model.vendorTrainingNotice && (
          <div
            className="mt-1.5 rounded-md px-2 py-1.5 text-[11.5px] font-semibold leading-snug"
            style={{
              background: "color-mix(in srgb, var(--md-sys-color-error) 12%, transparent)",
              color: "var(--md-sys-color-error)",
            }}
            data-testid="vendor-training-notice"
          >
            {model.vendorTrainingNotice}
          </div>
        )}
        {badges.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span key={b.key} className={`rounded px-1 py-0.5 text-[9px] ${b.className}`}>
                {b.label}
              </span>
            ))}
          </div>
        )}
        {model.pricing && model.type !== "image" ? <div className="model-preview-price">
          <span>{t("menu.model.pricing")}</span>
          <strong>¥{model.pricing.input} / ¥{model.pricing.cachedInput} / ¥{model.pricing.output}</strong>
        </div> : null}
      </div>
      <button
        type="button"
        data-testid="model-submenu-use"
        onClick={onUse}
        className="mb-1 flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[12.5px] font-medium text-[var(--ink)] hover:bg-[var(--bg-muted)]"
      >
        {t("menu.model.use")}
      </button>
    </>
  );
}
