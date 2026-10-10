"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { motion } from "framer-motion";
import { ChevronRight, RotateCcw, Zap } from "lucide-react";
import { ModelIcon } from "@/components/icons/ModelBrandIcons";
import { THINKING_EFFORT_OPTIONS } from "./ThinkingMenu";
import { useSettings, type ThinkingEffort } from "@/lib/stores/settings";
import { clampThinkingEffort, defaultEffortFor, type ModelInfo } from "@/lib/ai/models";
import { currentStopIndex, thinkingStopIds, valueForStop, type ThinkingStopId, type ThinkingValue } from "@/lib/ai/models/selection/thinkingStops";
import { useUiReducedMotion } from "@/lib/hooks/runtime/useUiReducedMotion";
import { DURATION, LAYOUT_REFLOW } from "@/lib/motion";
import { useT } from "@/lib/i18n";

type T = (key: string, params?: Record<string, string | number>) => string;
const THUMB_INSET = 15;

export function thinkingStopLabel(stop: ThinkingStopId, t: T): string {
  if (stop === "off") return t("menu.thinking.off.label");
  if (stop === "on") return t("menu.thinking.on.label");
  return THINKING_EFFORT_OPTIONS.find((option) => option.value === stop)?.label ?? stop;
}
export function thinkingChipLabel(model: ModelInfo | undefined, value: ThinkingValue, t: T): string | null {
  const stops = thinkingStopIds(model);
  if (stops.length === 0) return null;
  const stop = stops[currentStopIndex(model, stops, value)];
  return stop ? thinkingStopLabel(stop, t) : null;
}
export interface FastModeControl {
  supported: boolean;
  active: boolean;
  onToggle: () => void;
}

/** A compact effort control. Model navigation and reasoning depth remain independent actions. */
export default function ThinkingDepthPanel({
  model, modelLabel, selected, thinkingEnabled, thinkingEffort, onPick, fast, onChooseModel,
}: {
  model: ModelInfo; modelLabel: string; selected: boolean;
  thinkingEnabled: boolean; thinkingEffort: ThinkingEffort;
  onPick: (next: ThinkingValue) => void; fast: FastModeControl; onChooseModel: () => void;
}) {
  const t = useT() as T;
  const reducedMotion = useUiReducedMotion();
  const defaultThinking = useSettings((s) => s.defaultThinking);
  const defaultThinkingEffort = useSettings((s) => s.defaultThinkingEffort);
  const stops = thinkingStopIds(model);
  const value: ThinkingValue = selected
    ? { enabled: thinkingEnabled || !!model.thinkingRequired, effort: thinkingEffort }
    : { enabled: true, effort: defaultEffortFor(model) };
  const index = currentStopIndex(model, stops, value);
  const active = stops[index];
  const last = Math.max(1, stops.length - 1);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const pointer = useRef<number | null>(null);
  const lastPicked = useRef(index);
  const percent = (dragProgress ?? index / last) * 100;
  const transition = reducedMotion ? { duration: 0 } : LAYOUT_REFLOW;
  const pickIndex = (next: number) => {
    const stop = stops[next];
    if (stop) onPick(valueForStop(stop, value));
  };
  const movePointer = (event: PointerEvent<HTMLInputElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (event.clientX - rect.left - THUMB_INSET) / Math.max(1, rect.width - THUMB_INSET * 2)));
    setDragProgress(progress);
    const next = Math.round(progress * last);
    if (next !== lastPicked.current) { lastPicked.current = next; pickIndex(next); }
  };
  const finishPointer = () => { pointer.current = null; setDragProgress(null); };
  const title = active ? thinkingStopLabel(active, t)
    : t(model.type === "image" ? "menu.model.badge.image" : "menu.model.auto");

  return <div role="group" aria-label={t("menu.thinking.strength")} data-testid="model-thinking-submenu"
    className="thinking-depth" data-fast-active={fast.active || undefined}>
    <div className="thinking-depth-head">
      <motion.button type="button" className="thinking-depth-fast" aria-pressed={fast.active} disabled={!fast.supported}
        title={t(fast.supported ? "menu.modelEffort.fast" : "menu.modelEffort.fastUnsupported")}
        aria-label={t(fast.supported ? "menu.modelEffort.fast" : "menu.modelEffort.fastUnsupported")}
        data-testid="model-fast-toggle" data-active={fast.active || undefined}
        whileTap={reducedMotion ? undefined : { scale: 0.86 }} onClick={fast.onToggle}>
        <motion.span animate={reducedMotion ? undefined : { scale: fast.active ? [0.8, 1.2, 1] : 1, rotate: fast.active ? [-12, 6, 0] : 0 }}
          transition={{ duration: DURATION.slow }}><Zap size={17} aria-hidden /></motion.span>
      </motion.button>
      <div className="thinking-depth-heading">
        <span className="thinking-depth-title" data-testid="model-effort-title" aria-live="polite">{title}</span>
        <button type="button" className="thinking-depth-model" data-testid="model-choose-family"
          aria-label={t("menu.modelEffort.switchModel") + ": " + modelLabel} aria-expanded={false} onClick={onChooseModel}>
          <ModelIcon brand={model.icon} size={13} decorative />
          <span>{modelLabel}</span><ChevronRight size={12} aria-hidden />
        </button>
      </div>
      <button type="button" className="thinking-depth-reset" disabled={stops.length === 0}
        aria-label={t("menu.modelEffort.reset")} title={t("menu.modelEffort.reset")} data-testid="model-effort-reset"
        onClick={() => onPick({ enabled: model.thinkingRequired ? true : defaultThinking, effort: clampThinkingEffort(model, defaultThinkingEffort) })}>
        <RotateCcw size={15} aria-hidden />
      </button>
    </div>
    {stops.length > 1 ? <div className="thinking-depth-slider" data-testid="model-effort-slider" data-dragging={dragProgress !== null || undefined}>
      <div className="thinking-depth-rail" aria-hidden>
        <div className="thinking-depth-track">
          <motion.i className="thinking-depth-fill" initial={false} animate={{ width: percent + "%" }} transition={transition} />
          {fast.active && !reducedMotion ? <span className="thinking-depth-flow">
            {Array.from({ length: 7 }, (_, i) => <i key={i} className="thinking-depth-particle" style={{
              "--particle-y": `${20 + (i * 17) % 65}%`,
              "--particle-delay": `${i * -0.27}s`,
              "--particle-duration": `${1.05 + (i % 3) * 0.19}s`,
              "--particle-width": `${i % 2 ? 4 : 2}px`,
            } as CSSProperties} />)}
          </span> : null}
        </div>
        <div className="thinking-depth-stops">
          {stops.map((stop, i) => <b key={stop} className="thinking-depth-dot" data-passed={i < index || undefined}
            style={{ left: (i / last) * 100 + "%" }} />)}
          <motion.span className="thinking-depth-thumb" initial={false} animate={{ left: percent + "%" }} transition={transition} />
        </div>
      </div>
      <input type="range" min={0} max={stops.length - 1} step={1} value={index}
        aria-label={t("menu.modelEffort.sliderAria")} aria-valuetext={title}
        data-testid="model-effort-range" className="thinking-depth-range"
        onChange={(event) => pickIndex(Number(event.target.value))}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
          pointer.current = event.pointerId; lastPicked.current = index;
          event.currentTarget.setPointerCapture(event.pointerId); movePointer(event);
        }}
        onPointerMove={(event) => { if (pointer.current === event.pointerId) movePointer(event); }}
        onPointerUp={(event) => { if (pointer.current === event.pointerId) { movePointer(event); finishPointer(); } }}
        onPointerCancel={finishPointer} onLostPointerCapture={finishPointer} onBlur={finishPointer}
      />
    </div> : null}
  </div>;
}
