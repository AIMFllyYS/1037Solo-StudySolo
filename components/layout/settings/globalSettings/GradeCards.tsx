import { scoreGrade } from "@/lib/quiz-progress";

export function StatCard({
  icon,
  value,
  label,
  accent,
  flat = false,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  accent?: string;
  /** 桌面弹出面板里去掉卡片外壳，只留一行数字，避免菜单里再套卡片。 */
  flat?: boolean;
}) {
  if (flat) {
    return (
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5" style={{ color: accent ?? "var(--md-sys-color-primary)" }}>
          {icon}
          <span className="text-[15px] font-bold leading-none">{value}</span>
        </span>
        <span className="text-[10.5px] text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
      </div>
    );
  }
  return (
    <div
      className="flex flex-1 flex-col gap-1 rounded-[var(--md-sys-shape-corner-large,16px)] px-3.5 py-3"
      style={{
        background: "var(--md-sys-color-surface-container)",
        border: "1px solid var(--md-sys-color-outline-variant)",
      }}
    >
      <span className="flex items-center gap-1.5" style={{ color: accent ?? "var(--md-sys-color-primary)" }}>
        {icon}
        <span className="text-[20px] font-extrabold leading-none">{value}</span>
      </span>
      <span className="text-[11.5px] text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
    </div>
  );
}

export function ScoreBadge({ percent }: { percent: number }) {
  const grade = scoreGrade(percent);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums"
      style={{ color: grade.color, background: `color-mix(in srgb, ${grade.color} 14%, transparent)` }}
      title={grade.label}
    >
      {percent}
    </span>
  );
}