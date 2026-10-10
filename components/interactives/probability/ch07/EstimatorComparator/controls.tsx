// ─── 顶部指标卡片 ─────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  color: string;
  bg: string;
  badge: string;
  badgeColor: string;
}

export function StatCard({ label, value, sub, color, bg, badge, badgeColor }: StatCardProps) {
  return (
    <div className="rounded-lg p-3 flex flex-col gap-1" style={{ background: bg }}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[var(--ink)]">{label}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: badgeColor + "33", color: badgeColor }}
        >
          {badge}
        </span>
      </div>
      <div className="text-[18px] font-extrabold font-mono" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-[var(--ink-soft)]">{sub}</div>
    </div>
  );
}