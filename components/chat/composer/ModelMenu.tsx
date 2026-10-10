"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Check, Compass, Zap, Plug, Server } from "lucide-react";
import { submenuTop } from '@/lib/chat/composer/modelMenuPosition';
import { useSettings, type ThinkingEffort } from "@/lib/stores/settings";
import { AUTO_MODEL_ID, AUTO_MODEL_INFO, MODELS, modelsForPicker, getAllModels, getModelInfoWithCustom, CUSTOM_PREFIX, modelSupportsThinkingEffort, clampThinkingEffort, modelMenuCategories, type ModelInfo } from "@/lib/ai/models";
import { ModelIcon } from "@/components/icons/ModelBrandIcons";
import { thinkingStopIds } from "@/lib/ai/models/selection/thinkingStops";
import ThinkingDepthPanel, { thinkingChipLabel } from "@/components/chat/composer/ThinkingDepthPanel";
import { fastModeCounterpart, isFastVariant, standardModelId, supportsFastMode } from "@/lib/ai/models/selection/fastModeRegistry";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";
import { useT } from "@/lib/i18n/index";
import { CATEGORY_LABEL_KEYS, CATEGORY_ICONS, CATEGORIES, CATEGORY_COLORS } from "./modelMenu/metadata";
import { ModelDetails, CategoryBrandDots, ModelTraitDots } from "./modelMenu/presentation";
const COLUMN_WIDTHS = [232, 250, 230];
const GAP = 12;

export default function ModelMenu({
  value, onChange, thinkingEnabled = false, thinkingEffort = "medium", onThinkingChange,
}: {
  onOpenSettings?: () => void; value?: string; onChange?: (id: string) => void;
  thinkingEnabled?: boolean; thinkingEffort?: ThinkingEffort;
  onThinkingChange?: (next: { enabled: boolean; effort: ThinkingEffort }) => void;
}) {
  const t = useT();
  const globalSelected = useSettings((s) => s.selectedModelId);
  const globalSet = useSettings((s) => s.setSelectedModelId);
  const customApiGroups = useSettings((s) => s.customApiGroups);
  const selectedId = value ?? globalSelected;
  const current = getModelInfoWithCustom(selectedId, customApiGroups);
  const standardCurrent = getModelInfoWithCustom(standardModelId(selectedId), customApiGroups);
  const chipEffort = thinkingChipLabel(current, { enabled: thinkingEnabled || !!current?.thinkingRequired, effort: thinkingEffort }, t);
  const [open, setOpen] = useState(false);
  const [series, setSeries] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: 8, bottom: 8, maxHeight: 380, mobile: false, growLeft: true });
  // 移动端逐级展开：一级=思考强度、二级=模型分类、三级=模型列表（桌面三栏同显）。
  const [mobileStep, setMobileStep] = useState<"thinking" | "cats" | "models">("thinking");
  const focusRequest = useRef<number | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const focusColumn = (level: number) => { focusRequest.current = level; setFocusNonce((n) => n + 1); };
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const seriesAnchor = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => {
    setOpen(false); setSeries(null); setDetailId(null); setMobileStep("thinking"); focusRequest.current = null; btnRef.current?.focus();
  }, []);
  useOverlayRegistration({ id: "model-menu", open, onClose: close, priority: 45 });
  const models = series?.startsWith("category:")
    ? modelsForPicker(MODELS).filter((model) => !isFastVariant(model.id) && modelMenuCategories(model).includes(series.slice(9)))
    : series?.startsWith("custom:")
      ? getAllModels(customApiGroups.filter((group) => group.id === series.slice(7))).filter((model) => model.id.startsWith(CUSTOM_PREFIX))
      : [];
  const detail = getModelInfoWithCustom(detailId ?? "", customApiGroups);
  // 可见栏数：一级（思考强度）+ 二级（分类）恒显，三级（模型列表）随分类展开。
  const count = 2 + (series ? 1 : 0);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const width = viewport?.width ?? window.innerWidth;
      const top = viewport?.offsetTop ?? 0;
      const mobile = width < 768;
      const totalWidth = mobile ? Math.min(300, width - 16) : COLUMN_WIDTHS.slice(0, count).reduce((a, b) => a + b, 0) + GAP * (count - 1);
      const growLeft = rect.right > width / 2;
      setPosition({
        left: Math.max(8, Math.min(growLeft ? rect.right - totalWidth : rect.left, width - totalWidth - 8)),
        bottom: mobile ? Math.max(8, window.innerHeight - top - height + 8) : Math.max(8, window.innerHeight - rect.top + 6),
        maxHeight: Math.max(120, Math.min(mobile ? 520 : 380, mobile ? height * 0.75 : rect.top - top - 16)),
        mobile, growLeft,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open, count]);
  useLayoutEffect(() => {
    if (!open) return;
    const root = panelRef.current;
    if (!root) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const rootRect = root.getBoundingClientRect();
      const viewport = window.visualViewport;
      for (const [level, anchor] of [[3, seriesAnchor.current]] as const) {
        const column = root.querySelector<HTMLElement>(`[data-menu-level="${level}"]`);
        if (!column) continue;
        if (position.mobile) { column.style.top = ''; continue; }
        if (!anchor?.isConnected) continue;
        const top = submenuTop(anchor.getBoundingClientRect().top, column.offsetHeight, viewport?.offsetTop ?? 0, viewport?.height ?? window.innerHeight);
        column.style.top = `${top - rootRect.top}px`;
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    for (const child of Array.from(root.children)) observer?.observe(child);
    root.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); root.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule); };
  }, [open, series, detailId, position]);
  useEffect(() => {
    if (open) btnRef.current?.blur();
  }, [open]);
  useEffect(() => {
    if (!open || focusRequest.current === null) return;
    panelRef.current?.querySelector<HTMLButtonElement>(`[data-menu-level="${focusRequest.current}"] button`)?.focus();
    focusRequest.current = null;
  }, [open, focusNonce, series, detailId]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node) && !btnRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, close]);
  const navigate = (next: string, anchor: HTMLButtonElement, focus = false) => {
    seriesAnchor.current = anchor;
    if (series !== next) { setSeries(next); setDetailId(null); }
    if (position.mobile) setMobileStep("models");
    if (focus || position.mobile) focusColumn(3);
  };
  const back = (level: number) => {
    if (level === 3) { setSeries(null); setDetailId(null); setMobileStep("cats"); focusColumn(2); }
    else { setMobileStep("thinking"); focusColumn(1); }
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    // 原生滑杆独占方向键 / Home / End，菜单不能把它们截走用于切栏。
    if (event.target instanceof HTMLInputElement && event.target.type === "range" && event.key !== "Escape" && event.key !== "Tab") return;
    const column = (event.target as HTMLElement).closest<HTMLElement>("[data-menu-level]");
    const level = Number(column?.dataset.menuLevel ?? 1);
    if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); close(); return; }
    const enterKey = !position.mobile && position.growLeft ? 'ArrowLeft' : 'ArrowRight';
    const backKey = enterKey === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === backKey && level > 1) { event.preventDefault(); back(level); return; }
    if (event.key === enterKey && level < 3) {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[aria-expanded]");
      if (button) { event.preventDefault(); button.click(); focusColumn(level + 1); }
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input[type=range]:not(:disabled)") ?? []);
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
  const rowClass = "flex w-full items-center gap-2 rounded-md text-left text-[var(--ink)] hover:bg-[var(--bg-muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)] " +
    (position.mobile ? "min-h-11 px-3 py-2 text-[13px]" : "min-h-8 px-2 py-1.5 text-[12px]");
  const columnClass = "model-menu-scroll min-w-0 overflow-y-auto overscroll-contain rounded-xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--bg-panel)_96%,transparent)] p-1.5 shadow-lg backdrop-blur-md animate-[dropdown-in_160ms_var(--ease-out)_both]";
  const columnStyle = (index: number) => ({
    width: position.mobile ? "min(300px, calc(100vw - 16px))" : COLUMN_WIDTHS[index],
    maxHeight: position.maxHeight,
    animationDelay: `${index * 35}ms`,
    ...(!position.mobile && index > 0 ? { position: 'absolute' as const, left: position.growLeft
      ? -(COLUMN_WIDTHS.slice(1, index + 1).reduce((a, b) => a + b, 0) + GAP * index)
      : COLUMN_WIDTHS.slice(0, index).reduce((a, b) => a + b, 0) + GAP * index } : {}),
  });
  const categoryName = series?.startsWith("category:") ? series.slice(9) : null;
  const categoryKey = categoryName ? CATEGORY_LABEL_KEYS[categoryName] : undefined;
  const title = categoryName ? (categoryKey ? t(categoryKey) : categoryName)
    : customApiGroups.find((group) => group.id === series?.slice(7))?.name ?? t("menu.model.custom");
  const TitleIcon = categoryName ? CATEGORY_ICONS[categoryName] : Plug;
  const builtinPickerModels = modelsForPicker(MODELS).filter((model) => !isFastVariant(model.id));
  const categoryCount = (name: string) =>
    builtinPickerModels.filter((model) => modelMenuCategories(model).includes(name)).length;
  /** 分类行右侧的品牌图标圆点：按注册表顺序取该分类内去重品牌，附模型名 tooltip。 */
  const categoryBrands = (name: string) => {
    const brands = new Map<string, string[]>();
    for (const model of builtinPickerModels) {
      if (!modelMenuCategories(model).includes(name)) continue;
      const key = model.icon ?? "default";
      if (!brands.has(key)) brands.set(key, []);
      brands.get(key)!.push(model.label);
    }
    return [...brands.entries()].map(([brand, labels]) => ({ brand, labels }));
  };
  // 一级栏展示的模型：三级列表里悬停选中的优先，否则当前使用中的。
  const focusModel = detail ?? current;
  const details = focusModel ? <>
    <ModelDetails model={focusModel} onUse={() => pick(focusModel)} />
    {focusModel.thinking && (thinkingStopIds(focusModel).length > 1 || supportsFastMode(focusModel.id)) ? <ThinkingDepthPanel model={focusModel} selected={selectedId === focusModel.id} thinkingEnabled={thinkingEnabled} thinkingEffort={thinkingEffort} onPick={(thinking) => pick(focusModel, thinking, true)}
      fast={{ supported: supportsFastMode(focusModel.id), active: isFastVariant(focusModel.id), onToggle: () => {
        const target = getModelInfoWithCustom(fastModeCounterpart(focusModel.id) ?? "", customApiGroups);
        if (!target) return;
        setDetailId(target.id);
        pick(target, { enabled: thinkingEnabled || !!target.thinkingRequired, effort: clampThinkingEffort(target, thinkingEffort) }, true);
      } }} /> : null}
  </> : null;

  return <>
    <button ref={btnRef} type="button" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { if (open) close(); else { setOpen(true); focusColumn(1); } }} title={t("menu.model.choose")} data-testid="model-menu-button"
      className="press flex max-w-[180px] min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]">
      {selectedId === AUTO_MODEL_ID ? <Compass size={12} /> : <ModelIcon brand={current?.icon} size={12} decorative />}
      <span className="model-menu-label model-menu-label-full truncate">{standardCurrent?.label ?? current?.label ?? selectedId}</span>
      {isFastVariant(selectedId) ? <Zap size={12} className="model-fast-indicator shrink-0" aria-label={t("menu.modelEffort.fast")} /> : null}
      <span className="model-menu-label model-menu-label-short">{t("menu.model.short")}</span>{chipEffort ? <span className="model-effort-chip-level" data-testid="model-effort-level">{chipEffort}</span> : null}<ChevronDown size={12} />
    </button>
    {open ? createPortal(<div ref={panelRef} role="dialog" aria-label={t("menu.model.dialog")} onKeyDown={keyboard}
      style={{ left: position.left + (!position.mobile && position.growLeft ? COLUMN_WIDTHS.slice(1, count).reduce((a, b) => a + b, 0) + GAP * (count - 1) : 0), bottom: position.bottom, gap: GAP }}
      className="fixed z-[9999] flex items-end" data-testid="model-menu-panel" data-layout={position.mobile ? "drilldown" : "cascade"}>
      {/* 一级：思考强度。默认展示当前模型，三级列表悬停可预览其它模型。 */}
      {(!position.mobile || mobileStep === "thinking") ? <section data-menu-level="1" aria-label={t("menu.model.details")} data-testid="model-submenu" className={columnClass} style={columnStyle(0)}>
        {details}
        {position.mobile ? <button type="button" className={rowClass} onClick={() => { setMobileStep("cats"); focusColumn(2); }}
          data-testid="model-menu-mobile-next">
          <ChevronRight aria-hidden size={14} className="shrink-0 text-[var(--ink-soft)]" />
          <span className="min-w-0 flex-1">{t("menu.model.choose")}</span>
        </button> : null}
      </section> : null}
      {/* 二级：模型分类（原一级栏）。 */}
      {(!position.mobile || mobileStep === "cats") ? <section data-menu-level="2" aria-label={t("menu.model.series")} className={columnClass} style={columnStyle(1)}>
        <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold text-[var(--ink-faint)]">
          {position.mobile ? <button type="button" aria-label={t("menu.model.backToSeries")} onClick={() => back(2)} className="-ml-1 rounded p-2"><ChevronLeft size={14} /></button> : null}
          {t("menu.model.builtin")}
        </div>
        <button type="button" className={rowClass} onClick={() => pick(AUTO_MODEL_INFO)} data-testid="model-menu-item-auto"><Compass aria-hidden size={14} className="shrink-0 text-[var(--accent-ink)]" /><span className="flex-1">{t("menu.model.auto")}</span>{selectedId === AUTO_MODEL_ID ? <Check size={12} /> : null}</button>
        {CATEGORIES.map((name) => { const Icon = CATEGORY_ICONS[name]; const labelKey = CATEGORY_LABEL_KEYS[name]; const active = series === "category:" + name; return <button type="button" key={name} className={rowClass + (active ? " bg-[var(--accent-weak)]" : "")}
          aria-expanded={active} onMouseEnter={(event) => { if (!position.mobile) navigate("category:" + name, event.currentTarget); }} onClick={(event) => navigate("category:" + name, event.currentTarget)}>
          {!position.mobile && position.growLeft ? <ChevronLeft data-branch-side="left" aria-hidden size={12} className="shrink-0 opacity-60" /> : null}
          <Icon aria-hidden size={14} className="shrink-0" style={{ color: CATEGORY_COLORS[name] }} />
          <span className="min-w-0 flex-1 truncate whitespace-nowrap">{labelKey ? t(labelKey) : name}</span>
          <CategoryBrandDots brands={categoryBrands(name)} />
          <span aria-hidden className="model-cat-count shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none"
            style={{ background: active ? "color-mix(in srgb, " + CATEGORY_COLORS[name] + " 16%, transparent)" : "var(--bg-muted)", color: active ? CATEGORY_COLORS[name] : "var(--ink-faint)" }}
            data-count={categoryCount(name)} />
          {position.mobile || !position.growLeft ? <ChevronRight data-branch-side="right" aria-hidden size={12} className="shrink-0 opacity-60" /> : null}
        </button>; })}
        {customApiGroups.length ? <div className="mt-1 flex items-center gap-2 border-t border-[var(--line)] px-2 py-2 text-[10px] text-[var(--ink-faint)]"><Plug aria-hidden size={13} />{t("menu.model.customHeading")}</div> : null}
        {customApiGroups.map((group) => <button type="button" key={group.id} className={rowClass} aria-expanded={series === "custom:" + group.id}
          onMouseEnter={(event) => { if (!position.mobile) navigate("custom:" + group.id, event.currentTarget); }} onClick={(event) => navigate("custom:" + group.id, event.currentTarget)}>
          {!position.mobile && position.growLeft ? <ChevronLeft data-branch-side="left" aria-hidden size={12} className="shrink-0 opacity-60" /> : null}
          <Server aria-hidden size={14} className="shrink-0 text-[var(--ink-soft)]" /><span className="min-w-0 flex-1 truncate">{group.name}</span>
          <span aria-hidden className="model-cat-count shrink-0 rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[9px] font-semibold leading-none text-[var(--ink-faint)]" data-count={group.models.length} />
          {position.mobile || !position.growLeft ? <ChevronRight data-branch-side="right" aria-hidden size={12} className="shrink-0 opacity-60" /> : null}
        </button>)}
      </section> : null}
      {/* 三级：模型列表（原二级栏）。悬停更新一级栏预览，点击直接选用。 */}
      {series && (!position.mobile || mobileStep === "models") ? <section data-menu-level="3" aria-label={t("menu.model.models")} className={columnClass} style={columnStyle(2)}>
        <div className="flex items-center gap-1.5 px-1 py-1 text-[10px] font-medium text-[var(--ink-faint)]">
          {position.mobile ? <button type="button" aria-label={t("menu.model.backToSeries")} onClick={() => back(3)} className="rounded p-2"><ChevronLeft size={14} /></button> : null}
          <TitleIcon aria-hidden size={11} style={categoryName ? { color: CATEGORY_COLORS[categoryName] } : undefined} />
          {title}
        </div>
        {models.map((model) => <div key={model.id}>
          <button type="button" className={rowClass + (detailId === model.id ? " bg-[var(--accent-weak)]" : "")}
            data-testid={`model-menu-item-${model.id}`}
            onMouseEnter={() => { if (!position.mobile) setDetailId(standardModelId(selectedId) === model.id ? selectedId : model.id); }}
            onClick={() => pick(model)}>
            <ModelIcon brand={model.icon} size={14} decorative /><span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-1"><span className="truncate">{model.label}</span><ModelTraitDots model={model} /></span>
            {model.vendorTrainingNotice ? <span className="block text-[10px] text-[var(--md-sys-color-error)]">{model.vendorTrainingNotice}</span> : null}</span>
            {standardModelId(selectedId) === model.id ? <Check aria-label={t("menu.model.selected")} size={12} className="shrink-0" /> : null}
          </button>
        </div>)}
      </section> : null}
    </div>, document.body) : null}
  </>;
}