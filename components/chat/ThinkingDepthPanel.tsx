"use client";

import { RotateCcw, Zap } from "lucide-react";
import { THINKING_EFFORT_OPTIONS } from "@/components/chat/ThinkingMenu";
import { useSettings, type ThinkingEffort } from "@/lib/hooks/useSettings";
import { clampThinkingEffort, defaultEffortFor, type ModelInfo } from "@/lib/ai/models";
import {
  currentStopIndex,
  thinkingStopIds,
  valueForStop,
  type ThinkingStopId,
  type ThinkingValue,
} from "@/lib/ai/thinkingStops";
import { useT } from "@/lib/i18n";

type T = (key: string, params?: Record<string, string | number>) => string;

export function thinkingStopLabel(stop: ThinkingStopId, t: T): string {
  if (stop === "off") return t("menu.thinking.off.label");
  if (stop === "on") return t("menu.thinking.on.label");
  return THINKING_EFFORT_OPTIONS.find((option) => option.value === stop)?.label ?? stop;
}

function stopHint(stop: ThinkingStopId, t: T): string {
  if (stop === "off") return t("menu.thinking.off.hint");
  if (stop === "on") return t("menu.thinking.on.hint");
  const option = THINKING_EFFORT_OPTIONS.find((item) => item.value === stop);
  return option ? t(option.hintKey) : "";
}

/** 触发器胶囊上显示的当前深度文字；模型不支持思考时返回 null。 */
export function thinkingChipLabel(model: ModelInfo | undefined, value: ThinkingValue, t: T): string | null {
  const stops = thinkingStopIds(model);
  if (stops.length === 0) return null;
  const stop = stops[currentStopIndex(model, stops, value)];
  return stop ? thinkingStopLabel(stop, t) : null;
}

export interface FastModeControl {
  /** 该模型有 Fast 变体（见 lib/ai/fastModeRegistry.ts）。 */
  supported: boolean;
  /** 当前就是 Fast 变体。 */
  active: boolean;
  onToggle: () => void;
}

/**
 * 模型详情里的「思考」板块：
 * 左上闪电 = Fast 模式开关（只有注册了 Fast 变体的模型可点），中间是当前深度，右上重置；
 * 下面是随模型能力变化的档位滑杆，档位名本身也能点（对应键盘 / 读屏的单选项）。
 */
export default function ThinkingDepthPanel({
  model,
  selected,
  thinkingEnabled,
  thinkingEffort,
  onPick,
  fast,
}: {
  model: ModelInfo;
  selected: boolean;
  thinkingEnabled: boolean;
  thinkingEffort: ThinkingEffort;
  onPick: (next: ThinkingValue) => void;
  fast: FastModeControl;
}) {
  const t = useT() as T;
  const defaultThinking = useSettings((s) => s.defaultThinking);
  const defaultThinkingEffort = useSettings((s) => s.defaultThinkingEffort);
  const stops = thinkingStopIds(model);
  const value: ThinkingValue = selected
    ? { enabled: thinkingEnabled || !!model.thinkingRequired, effort: thinkingEffort }
    : { enabled: true, effort: defaultEffortFor(model) };
  const index = currentStopIndex(model, stops, value);
  const active = stops[index];
  const last = Math.max(1, stops.length - 1);
  const percent = stops.length > 1 ? (index / last) * 100 : 100;

  const reset = () =>
    onPick({
      enabled: model.thinkingRequired ? true : defaultThinking,
      effort: clampThinkingEffort(model, defaultThinkingEffort),
    });

  return (
    <div role="menu" aria-label={t("menu.thinking.strength")} data-testid="model-thinking-submenu" className="thinking-depth" data-fast-active={fast.active || undefined}>
      <div className="thinking-depth-head">
        <button
          type="button"
          className="thinking-depth-fast"
          aria-pressed={fast.active}
          disabled={!fast.supported}
          title={fast.supported ? t("menu.modelEffort.fast") : t("menu.modelEffort.fastUnsupported")}
          aria-label={fast.supported ? t("menu.modelEffort.fast") : t("menu.modelEffort.fastUnsupported")}
          data-testid="model-fast-toggle"
          data-active={fast.active ? "" : undefined}
          onClick={fast.onToggle}
        >
          <Zap size={14} aria-hidden />
        </button>
        <span className="thinking-depth-title" data-testid="model-effort-title" aria-live="polite">
          {active ? thinkingStopLabel(active, t) : t("menu.modelEffort.unsupported")}
        </span>
        <button
          type="button"
          className="thinking-depth-reset"
          aria-label={t("menu.modelEffort.reset")}
          title={t("menu.modelEffort.reset")}
          data-testid="model-effort-reset"
          onClick={reset}
        >
          <RotateCcw size={13} aria-hidden />
        </button>
      </div>
      {active ? <p className="thinking-depth-hint">{stopHint(active, t)}</p> : null}
      {stops.length > 1 ? (
        <>
          <div className="thinking-depth-slider" data-testid="model-effort-slider">
            <div className="thinking-depth-rail" aria-hidden>
              <i className="thinking-depth-fill" style={{ width: `calc(${percent}% + ${14 - percent * 0.28}px)` }} />
              <div className="thinking-depth-stops">
              {stops.map((stop, i) => (
                <b
                  key={stop}
                  className="thinking-depth-dot"
                  data-passed={i <= index ? "" : undefined}
                  style={{ left: `${(i / last) * 100}%` }}
                />
              ))}
              <span className="thinking-depth-thumb" style={{ left: `${percent}%` }} />
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={stops.length - 1}
              step={1}
              value={index}
              aria-label={t("menu.modelEffort.sliderAria")}
              aria-valuetext={active ? thinkingStopLabel(active, t) : undefined}
              data-testid="model-effort-range"
              className="thinking-depth-range"
              onChange={(event) => {
                const stop = stops[Number(event.target.value)];
                if (stop) onPick(valueForStop(stop, value));
              }}
            />
          </div>
          <div className="thinking-depth-labels">
            {stops.map((stop, i) => (
              <button
                key={stop}
                type="button"
                role="menuitemradio"
                aria-checked={selected && i === index}
                data-testid={`model-thinking-option-${stop}`}
                data-active={i === index ? "" : undefined}
                // 首尾标签改为贴边对齐：默认 translateX(-50%) 会让两端标签溢出卡片半宽。
                style={{ left: `${(i / last) * 100}%`, transform: i === 0 ? "none" : i === last ? "translateX(-100%)" : undefined }}
                onClick={() => onPick(valueForStop(stop, value))}
              >
                {thinkingStopLabel(stop, t)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="thinking-depth-note">{t("menu.modelEffort.fixedOn")}</p>
      )}
    </div>
  );
}
