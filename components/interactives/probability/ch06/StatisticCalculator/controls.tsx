import { ACCENT_LIGHT, ACCENT } from "./appearance";
// ─── 步骤展示卡 ───────────────────────────────────────────────
interface StepCardProps {
  step: number;
  title: string;
  children: React.ReactNode;
}

export function StepCard({ step, title, children }: StepCardProps) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: ACCENT_LIGHT }}
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-[var(--md-sys-color-on-primary)] flex-shrink-0"
          style={{ background: ACCENT }}
        >
          {step}
        </span>
        <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>
          {title}
        </span>
      </div>
      <div className="px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
        {children}
      </div>
    </div>
  );
}