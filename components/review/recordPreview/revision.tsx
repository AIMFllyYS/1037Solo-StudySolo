import { Wand2 } from "lucide-react";

import { BOX } from "./appearance";
/** ready 态的优化输入。 */
export function ReviseInput({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const disabled = busy || !value.trim();
  return (
    <div data-no-drag style={{ display: "flex", gap: 6 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="优化这张卡…（如：答案更详细 / 挖空挖错了）"
        disabled={busy}
        style={{
          flex: 1,
          minWidth: 0,
          height: 34,
          padding: "0 10px",
          borderRadius: BOX.radius,
          border: BOX.border,
          background: "var(--md-sys-color-surface-container-lowest)",
          color: "var(--ink)",
          fontSize: 12.5,
          outline: "none",
        }}
      />
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="press"
        title="让 AI 优化这张卡"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "0 12px",
          height: 34,
          borderRadius: BOX.radius,
          border: "none",
          background: "var(--md-sys-color-primary)",
          color: "var(--md-sys-color-on-primary)",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.55 : 1,
          whiteSpace: "nowrap",
        }}
      >
        <Wand2 size={14} /> 优化
      </button>
    </div>
  );
}