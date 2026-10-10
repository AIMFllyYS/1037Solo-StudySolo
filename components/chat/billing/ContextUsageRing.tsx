import { contextRingColor, contextRingLevel } from "@/lib/context/estimateFullContext";

export function ContextUsageRing({
  ratio,
  size = 14,
  title,
}: {
  ratio: number;
  size?: number;
  title?: string;
}) {
  const RING_R = 14;
  const RING_C = 2 * Math.PI * RING_R;
  const bounded = Math.min(Math.max(Number.isFinite(ratio) ? ratio : 0, 0), 1);
  const ringColor = contextRingColor(contextRingLevel(bounded));
  const ringDash = `${Math.max(bounded, 0.02) * RING_C} ${RING_C}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ transform: "rotate(-90deg)" }}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="16" cy="16" r={RING_R} fill="none" stroke={ringColor} strokeWidth="4" strokeOpacity={0.15} />
      <circle
        cx="16"
        cy="16"
        r={RING_R}
        fill="none"
        stroke={ringColor}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={ringDash}
        style={{ transition: "stroke-dasharray 0.3s ease, stroke 0.3s ease" }}
      />
    </svg>
  );
}
