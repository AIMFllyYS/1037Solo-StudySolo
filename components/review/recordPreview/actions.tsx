import { BOX } from "./appearance";
export function ActionBtn({
  onClick,
  icon: Icon,
  label,
  primary,
  danger,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  primary?: boolean;
  danger?: boolean;
}) {
  const color = danger
    ? "var(--md-sys-color-error)"
    : primary
      ? "var(--md-sys-color-on-primary)"
      : "var(--ink-soft)";
  const bg = primary ? "var(--md-sys-color-primary)" : "transparent";
  const border = primary ? "none" : BOX.border;
  return (
    <button
      type="button"
      onClick={onClick}
      className="press"
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        padding: "7px 0",
        borderRadius: BOX.radius,
        border,
        background: bg,
        color,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      <Icon size={14} /> {label}
    </button>
  );
}