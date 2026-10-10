"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ChevronDown, Compass, Zap } from "lucide-react";
import { useSettings, type ThinkingEffort } from "@/lib/stores/settings";
import { AUTO_MODEL_ID, MODELS, modelsForPicker, getAllModels, getModelInfoWithCustom, CUSTOM_PREFIX, modelSupportsThinkingEffort, clampThinkingEffort, modelMenuCategories, type ModelInfo } from "@/lib/ai/models";
import { ModelIcon } from "@/components/icons/ModelBrandIcons";
import ThinkingDepthPanel, { thinkingChipLabel } from "./ThinkingDepthPanel";
import { fastModeCounterpart, isFastVariant, standardModelId, supportsFastMode } from "@/lib/ai/models/selection/fastModeRegistry";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";
import { useUiReducedMotion } from "@/lib/hooks/runtime/useUiReducedMotion";
import { useT } from "@/lib/i18n";
import { DURATION, LAYOUT_REFLOW, fadeInUpVariants, scaleInVariants } from "@/lib/motion";
import { CATEGORY_LABEL_KEYS } from "./modelMenu/metadata";
import { ModelCategories, ModelList } from "./modelMenu/ModelPickerPanels";
import { MENU_GAP, MODEL_LIST_WIDTH, useFlyoutPosition, useMenuHeight, useMenuPosition } from "./modelMenu/useMenuPosition";

type Step = "thinking" | "cats" | "models";

export default function ModelMenu({
  value, onChange, thinkingEnabled = false, thinkingEffort = "medium", onThinkingChange,
}: {
  onOpenSettings?: () => void; value?: string; onChange?: (id: string) => void;
  thinkingEnabled?: boolean; thinkingEffort?: ThinkingEffort;
  onThinkingChange?: (next: { enabled: boolean; effort: ThinkingEffort }) => void;
}) {
  const t = useT();
  const reducedMotion = useUiReducedMotion();
  const globalSelected = useSettings((s) => s.selectedModelId);
  const globalSet = useSettings((s) => s.setSelectedModelId);
  const customApiGroups = useSettings((s) => s.customApiGroups);
  const selectedId = value ?? globalSelected;
  const current = getModelInfoWithCustom(selectedId, customApiGroups);
  const standardCurrent = getModelInfoWithCustom(standardModelId(selectedId), customApiGroups);
  const chipEffort = thinkingChipLabel(current, { enabled: thinkingEnabled || !!current?.thinkingRequired, effort: thinkingEffort }, t);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("thinking");
  const [series, setSeries] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const seriesAnchor = useRef<HTMLButtonElement | null>(null);
  const focusRequest = useRef<number | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const position = useMenuPosition(open, btnRef);
  const flyout = useFlyoutPosition(open, series, position.mobile, panelRef, seriesAnchor);
  const visibleStep = position.mobile ? step : step === "thinking" ? "thinking" : "cats";
  const { height: menuHeight, reset: resetMenuHeight } = useMenuHeight(open, visibleStep, contentRef, position.maxHeight);
  const focusColumn = (level: number) => { focusRequest.current = level; setFocusNonce((n) => n + 1); };
  const close = useCallback(() => {
    setOpen(false); setSeries(null); setDetailId(null); setStep("thinking");
    resetMenuHeight();
    focusRequest.current = null; btnRef.current?.focus();
  }, [resetMenuHeight]);
  useOverlayRegistration({ id: "model-menu", open, onClose: close, priority: 45 });

  useEffect(() => {
    if (!open || focusRequest.current === null) return;
    const level = focusRequest.current;
    const selector = level === 1 ? '[data-testid="model-choose-family"]'
      : level === 3 ? '[data-testid="model-list-back"]' : ".model-picker-row";
    panelRef.current?.querySelector<HTMLButtonElement>('[data-menu-level="' + level + '"] ' + selector)?.focus();
    focusRequest.current = null;
  }, [open, step, series, focusNonce]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node) && !btnRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, close]);

  const models = series?.startsWith("category:")
    ? modelsForPicker(MODELS).filter((model) => !isFastVariant(model.id) && modelMenuCategories(model).includes(series.slice(9)))
    : series?.startsWith("custom:")
      ? getAllModels(customApiGroups.filter((group) => group.id === series.slice(7))).filter((model) => model.id.startsWith(CUSTOM_PREFIX))
      : [];
  const detail = getModelInfoWithCustom(detailId ?? "", customApiGroups);
  const categoryName = series?.startsWith("category:") ? series.slice(9) : null;
  const title = categoryName ? t(CATEGORY_LABEL_KEYS[categoryName] ?? categoryName)
    : customApiGroups.find((group) => group.id === series?.slice(7))?.name ?? t("menu.model.custom");
  const navigate = (next: string, anchor: HTMLButtonElement, focus = false) => {
    seriesAnchor.current = anchor;
    if (series !== next) { setSeries(next); setDetailId(null); }
    if (position.mobile) setStep("models");
    if (focus || position.mobile) focusColumn(3);
  };
  const back = (level: number) => {
    setSeries(null); setDetailId(null);
    if (level === 3) { setStep("cats"); focusColumn(2); }
    else { setStep("thinking"); focusColumn(1); }
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement && event.target.type === "range" && event.key !== "Escape" && event.key !== "Tab") return;
    const column = (event.target as HTMLElement).closest<HTMLElement>("[data-menu-level]");
    const level = Number(column?.dataset.menuLevel ?? 1);
    if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); close(); return; }
    const enterKey = !position.mobile && position.growLeft ? "ArrowLeft" : "ArrowRight";
    const backKey = enterKey === "ArrowLeft" ? "ArrowRight" : "ArrowLeft";
    if (event.key === backKey && level > 1) { event.preventDefault(); back(level); return; }
    if (event.key === enterKey && level < 3) {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[aria-expanded]");
      if (button) { event.preventDefault(); button.click(); focusColumn(level + 1); }
      return;
    }
    const focusables = "button:not(:disabled), input[type=range]:not(:disabled)";
    if (event.key === "Tab") {
      event.preventDefault();
      const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(focusables) ?? []);
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      const next = index + (event.shiftKey ? -1 : 1);
      if (next < 0 || next >= buttons.length) close(); else buttons[next]?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from((column ?? panelRef.current)?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault(); buttons[next]?.focus();
  };
  const pick = (model: ModelInfo, thinking?: { enabled: boolean; effort: ThinkingEffort }, keepOpen = false) => {
    (onChange ?? globalSet)(model.id);
    if (thinking) onThinkingChange?.(thinking);
    else if (modelSupportsThinkingEffort(model)) onThinkingChange?.({
      enabled: model.thinkingRequired || thinkingEnabled, effort: clampThinkingEffort(model, thinkingEffort),
    });
    if (!keepOpen) close();
  };
  const chooseFamily = () => { setStep("cats"); focusColumn(2); };
  const list = <ModelList models={models} title={title} selectedId={selectedId} detail={detail}
    mobile={position.mobile} reducedMotion={reducedMotion} onBack={() => back(3)} onPick={pick}
    onPreview={(model) => setDetailId(model ? standardModelId(selectedId) === model.id ? selectedId : model.id : null)} />;

  return <>
    <button ref={btnRef} type="button" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { if (open) close(); else { setOpen(true); focusColumn(1); } }} title={t("menu.model.choose")} data-testid="model-menu-button"
      className="press flex max-w-[220px] min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]">
      {selectedId === AUTO_MODEL_ID ? <Compass size={12} /> : <ModelIcon brand={current?.icon} size={12} decorative />}
      <span className="model-menu-label model-menu-label-full truncate">{standardCurrent?.label ?? current?.label ?? selectedId}</span>
      {isFastVariant(selectedId) ? <Zap size={12} className="model-fast-indicator shrink-0" aria-label={t("menu.modelEffort.fast")} /> : null}
      <span className="model-menu-label model-menu-label-short">{t("menu.model.short")}</span>
      {chipEffort ? <span className="model-effort-chip-level" data-testid="model-effort-level">{chipEffort}</span> : null}<ChevronDown size={12} />
    </button>
    {open ? createPortal(<div ref={panelRef} role="dialog" aria-label={t("menu.model.dialog")} onKeyDown={keyboard}
      style={{ left: position.left, bottom: position.bottom, top: position.top, width: position.width }}
      className="model-picker-anchor" data-testid="model-menu-panel" data-layout={position.mobile ? "drilldown" : "cascade"}>
      <motion.section transition={reducedMotion ? { duration: 0 } : { ...LAYOUT_REFLOW, opacity: { duration: DURATION.fast } }}
        initial={reducedMotion ? false : { opacity: 0 }} animate={{ height: menuHeight, opacity: 1 }}
        data-menu-level={visibleStep === "thinking" ? 1 : visibleStep === "cats" ? 2 : 3}
        aria-label={t(visibleStep === "thinking" ? "menu.thinking.strength" : visibleStep === "cats" ? "menu.model.series" : "menu.model.models")}
        className="model-picker-surface model-picker-primary" style={{ maxHeight: position.maxHeight }}>
        <motion.div ref={contentRef} key={visibleStep} className={visibleStep === "models" ? "model-picker-models-content" : "model-menu-scroll"}
          style={{ maxHeight: Math.max(60, position.maxHeight - 18), overflowY: "auto" }}
          variants={reducedMotion ? undefined : fadeInUpVariants} initial={reducedMotion ? false : "initial"} animate="animate">
          {visibleStep === "thinking" ? current ? <ThinkingDepthPanel model={current} selected
            modelLabel={standardCurrent?.label ?? current.label} onChooseModel={chooseFamily}
            thinkingEnabled={thinkingEnabled} thinkingEffort={thinkingEffort} onPick={(thinking) => pick(current, thinking, true)}
            fast={{ supported: supportsFastMode(current.id), active: isFastVariant(current.id), onToggle: () => {
              const target = getModelInfoWithCustom(fastModeCounterpart(current.id) ?? "", customApiGroups);
              if (target) pick(target, { enabled: thinkingEnabled || !!target.thinkingRequired, effort: clampThinkingEffort(target, thinkingEffort) }, true);
            } }} /> : <button type="button" className="model-picker-row" data-testid="model-choose-family" aria-expanded={false} onClick={chooseFamily}>{t("menu.model.choose")}</button>
          : visibleStep === "cats" ? <ModelCategories selectedId={selectedId} series={series} groups={customApiGroups}
            mobile={position.mobile} growLeft={position.growLeft} onBack={() => back(2)} onNavigate={navigate} onPick={pick} /> : list}
        </motion.div>
      </motion.section>
      {series && !position.mobile && visibleStep !== "thinking" ? <motion.section key={series} data-menu-level="3" aria-label={t("menu.model.models")}
        className="model-picker-surface model-picker-models model-picker-flyout"
        variants={reducedMotion ? undefined : scaleInVariants} initial={reducedMotion ? false : "initial"} animate="animate"
        style={{ left: position.growLeft ? -MODEL_LIST_WIDTH - MENU_GAP : position.width + MENU_GAP, top: flyout.top, width: MODEL_LIST_WIDTH, maxHeight: flyout.maxHeight }}>
        {list}
      </motion.section> : null}
    </div>, document.body) : null}
  </>;
}
