import { contextRingColor, contextRingLevel } from '@/lib/context/estimateFullContext';

export type UsageProgressTone = 'risk' | 'completion';

export interface UsageProgressBarProps {
  ratio: number;
  ariaLabel: string;
  /** 剩余量语义：占比越低，风险颜色越接近红色。 */
  invertRisk?: boolean;
  /** completion：章节/任务完成度，始终用主色，不走额度风险配色。 */
  tone?: UsageProgressTone;
  height?: number;
  valueNow?: number;
  valueMax?: number;
}

export function UsageProgressBar({
  ratio,
  ariaLabel,
  invertRisk = false,
  tone = 'risk',
  height = 6,
  valueNow,
  valueMax,
}: UsageProgressBarProps) {
  const boundedRatio = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  const riskRatio = invertRisk ? 1 - boundedRatio : boundedRatio;
  const level = tone === 'completion' ? undefined : contextRingLevel(riskRatio);
  const color = tone === 'completion' ? 'var(--md-sys-color-primary)' : contextRingColor(level!);
  const ariaMax = valueMax != null && Number.isFinite(valueMax) && valueMax > 0 ? valueMax : 100;
  const ariaNow =
    valueNow != null && Number.isFinite(valueNow)
      ? valueNow
      : Math.round(boundedRatio * (ariaMax === 100 ? 100 : ariaMax));

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={ariaMax}
      aria-valuenow={ariaNow}
      data-tone={tone}
      {...(level ? { 'data-risk-level': level } : {})}
      style={{
        height,
        borderRadius: height / 2,
        background: 'var(--bg-muted)',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: `${boundedRatio * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          background: color,
          transition: 'width 0.3s ease, background 0.3s ease',
        }}
      />
    </div>
  );
}
