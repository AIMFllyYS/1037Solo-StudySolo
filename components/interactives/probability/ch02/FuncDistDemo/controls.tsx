import { ACCENT } from "./appearance";
// ─── 选项卡按钮 ──────────────────────────────────────────────
interface TabBtnProps {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}

export function TabBtn({ active, onClick, color = ACCENT, children }: TabBtnProps) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors"
      style={
        active
          ? { background: color, color: "#fff" }
          : { background: "var(--bg-muted)", color: "var(--ink-soft)" }
      }
    >
      {children}
    </button>
  );
}