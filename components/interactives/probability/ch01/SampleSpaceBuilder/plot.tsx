import type { DiceFace, Membership } from "@/lib/learning/probability/foundations/sampleSpace";
import { MEMBERSHIP_COLORS, MEMBERSHIP_LABEL, DICE_DOTS, NONE_COLOR } from "./appearance";
// ─────────────────────────────────────────────────────────────────────────────
// 骰子 SVG（单个）
// ─────────────────────────────────────────────────────────────────────────────
export function DieFace({
  face,
  membership,
  onClick,
}: {
  face: DiceFace;
  membership: Membership;
  onClick: () => void;
}) {
  const borderColor = MEMBERSHIP_COLORS[membership];
  const bgColor =
    membership === "none"
      ? "var(--bg-muted)"
      : membership === "A"
      ? "#ede9fe"
      : membership === "B"
      ? "#ccfbf1"
      : "#fef3c7";

  return (
    <button
      onClick={onClick}
      title={`点击切换归属（当前：${MEMBERSHIP_LABEL[membership]}）`}
      style={{ outline: "none" }}
      className="group relative focus:outline-none"
    >
      <svg
        viewBox="0 0 100 100"
        width={72}
        height={72}
        style={{
          borderRadius: 14,
          border: `2.5px solid ${borderColor}`,
          background: bgColor,
          boxShadow:
            membership !== "none"
              ? `0 0 0 3px ${borderColor}33`
              : "0 1px 3px rgba(0,0,0,0.08)",
          transition: "all 0.18s ease",
          cursor: "pointer",
          display: "block",
        }}
      >
        {DICE_DOTS[face].map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={9}
            fill={membership !== "none" ? MEMBERSHIP_COLORS[membership] : "var(--ink-soft)"}
            opacity={membership !== "none" ? 0.85 : 0.7}
          />
        ))}
      </svg>
      {/* 面点数标签 */}
      <span
        style={{
          position: "absolute",
          bottom: -18,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 11,
          color: MEMBERSHIP_COLORS[membership],
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {face}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 集合花括号展示
// ─────────────────────────────────────────────────────────────────────────────
export function SetDisplay({
  label,
  elements,
  color,
  subscript,
}: {
  label: string;
  elements: number[];
  color: string;
  subscript?: string;
}) {
  const content =
    elements.length === 0
      ? "∅"
      : "{" + elements.map(String).join(", ") + "}";

  return (
    <div className="flex items-start gap-1.5 text-[13px]">
      <span style={{ color, fontWeight: 700, minWidth: 48, flexShrink: 0 }}>
        {label}
        {subscript && (
          <sub style={{ fontSize: 10 }}>{subscript}</sub>
        )}
        &nbsp;=
      </span>
      <span
        className="rounded-md px-2 py-0.5 font-mono"
        style={{
          background: elements.length === 0 ? "var(--bg-muted)" : `${color}18`,
          color: elements.length === 0 ? NONE_COLOR : color,
          border: `1px solid ${elements.length === 0 ? "var(--line)" : `${color}40`}`,
          minWidth: 40,
          display: "inline-block",
        }}
      >
        {content}
      </span>
    </div>
  );
}