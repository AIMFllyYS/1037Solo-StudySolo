"use client";

import { Check, ChevronLeft, ChevronRight, Compass, Plug, Server } from "lucide-react";
import { AUTO_MODEL_ID, AUTO_MODEL_INFO, MODELS, modelsForPicker, modelMenuCategories, type ModelInfo, type CustomApiGroup } from "@/lib/ai/models";
import { isFastVariant, standardModelId } from "@/lib/ai/models/selection/fastModeRegistry";
import { ModelIcon } from "@/components/icons/ModelBrandIcons";
import { useT } from "@/lib/i18n";
import AnimatedCollapse from "@/components/ui/AnimatedCollapse";
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABEL_KEYS, CATEGORIES } from "./metadata";
import { CategoryBrandDots, ModelDetails, ModelTraitDots } from "./presentation";

const pickerModels = modelsForPicker(MODELS).filter((model) => !isFastVariant(model.id));

export function ModelCategories({ selectedId, series, groups, growLeft, onBack, onNavigate, onPick, mobile }: {
  selectedId: string; series: string | null; groups: CustomApiGroup[]; growLeft: boolean; mobile: boolean;
  onBack: () => void; onNavigate: (id: string, anchor: HTMLButtonElement, focus?: boolean) => void; onPick: (model: ModelInfo) => void;
}) {
  const t = useT();
  const Arrow = growLeft && !mobile ? ChevronLeft : ChevronRight;
  // Mouse movement, not synthetic enter after the card morph, opens a flyout.
  return <>
    <div className="model-picker-heading">
      <button type="button" aria-label={t("menu.model.backToEffort")} onClick={onBack}><ChevronLeft size={16} /></button>
      <span>{t("menu.model.choose")}</span>
    </div>
    <button type="button" className="model-picker-row" onClick={() => onPick(AUTO_MODEL_INFO)} data-testid="model-menu-item-auto">
      <Compass size={18} className="text-[var(--accent-ink)]" aria-hidden />
      <span className="model-picker-name">{t("menu.model.auto")}</span>
      {selectedId === AUTO_MODEL_ID ? <Check size={15} aria-hidden /> : null}
    </button>
    {CATEGORIES.map((name) => {
      const Icon = CATEGORY_ICONS[name];
      const active = series === `category:${name}`;
      const models = pickerModels.filter((model) => modelMenuCategories(model).includes(name));
      const brands = new Map<string, string[]>();
      for (const model of models) {
        const brand = model.icon ?? "default";
        brands.set(brand, [...(brands.get(brand) ?? []), model.label]);
      }
      return <button type="button" key={name} className="model-picker-row" data-active={active || undefined} aria-expanded={active}
        onMouseMove={(event) => { if (!mobile && !active) onNavigate(`category:${name}`, event.currentTarget); }}
        onClick={(event) => onNavigate(`category:${name}`, event.currentTarget, true)}>
        <Icon size={18} style={{ color: CATEGORY_COLORS[name] }} aria-hidden />
        <span className="model-picker-name">{t(CATEGORY_LABEL_KEYS[name])}</span>
        <CategoryBrandDots brands={[...brands].map(([brand, labels]) => ({ brand, labels }))} />
        <Arrow size={14} data-branch-side={growLeft && !mobile ? "left" : "right"} aria-hidden />
      </button>;
    })}
    {groups.length > 0 ? <div className="model-picker-divider"><Plug size={12} />{t("menu.model.customHeading")}</div> : null}
    {groups.map((group) => <button type="button" key={group.id} className="model-picker-row" aria-expanded={series === `custom:${group.id}`}
      onMouseMove={(event) => { if (!mobile && series !== `custom:${group.id}`) onNavigate(`custom:${group.id}`, event.currentTarget); }}
      onClick={(event) => onNavigate(`custom:${group.id}`, event.currentTarget, true)}>
      <Server size={17} aria-hidden /><span className="model-picker-name">{group.name}</span><Arrow size={14} aria-hidden />
    </button>)}
  </>;
}

export function ModelList({ models, title, selectedId, detail, onPreview, onPick, onBack, mobile, reducedMotion }: {
  models: ModelInfo[]; title: string; selectedId: string; detail?: ModelInfo; mobile: boolean; reducedMotion: boolean;
  onPreview: (model: ModelInfo | null) => void; onPick: (model: ModelInfo) => void; onBack: () => void;
}) {
  const t = useT();
  return <>
    <div className="model-picker-heading">
      <button type="button" data-testid="model-list-back" aria-label={t("menu.model.backToSeries")} onClick={onBack}><ChevronLeft size={16} /></button>
      <span>{title}</span>
    </div>
    <div className="model-menu-scroll model-picker-list" onMouseLeave={(event) => {
      if (!mobile && !event.currentTarget.contains(document.activeElement)) onPreview(null);
    }}>
      {models.map((model) => {
        const expanded = standardModelId(detail?.id ?? "") === model.id;
        const previewModel = expanded && detail ? detail : model;
        const preview = <div className="model-picker-row-details" data-testid={expanded ? "model-preview" : undefined} aria-hidden={!expanded} inert={!expanded}>
          <ModelDetails model={previewModel} onUse={() => onPick(previewModel)} />
        </div>;
        return <div key={model.id} className="model-picker-entry"
          onMouseMove={() => { if (!mobile && !expanded) onPreview(model); }}>
          <button type="button" className="model-picker-row" data-preview={expanded || undefined}
            data-testid={`model-menu-item-${model.id}`} aria-expanded={expanded}
            onFocus={() => onPreview(model)}
            onClick={() => { if (mobile) onPreview(model); else onPick(model); }}>
            <ModelIcon brand={model.icon} size={20} decorative />
            <span className="model-picker-name"><span className="model-picker-label"><span className="model-picker-label-text">{model.label}</span><ModelTraitDots model={model} maxShown={5} /></span>
              {model.vendorTrainingNotice ? <span className="model-picker-notice">{model.vendorTrainingNotice}</span> : null}
            </span>
            {standardModelId(selectedId) === model.id ? <Check aria-label={t("menu.model.selected")} size={15} /> : null}
          </button>
          {reducedMotion ? expanded ? preview : null : <AnimatedCollapse isOpen={expanded}>{preview}</AnimatedCollapse>}
        </div>;
      })}
    </div>
  </>;
}
