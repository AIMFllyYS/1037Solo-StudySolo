import { BookOpenText, PencilLine, FileQuestion, Settings2 } from "lucide-react";

import type { RecordMode } from "@/lib/review/types";

import { BOX, BOX_HOVER_BG } from "./appearance";
export const MODE_DEFS: { mode: RecordMode; label: string; icon: typeof BookOpenText }[] = [
  { mode: "excerpt", label: "摘录", icon: BookOpenText },
  { mode: "cloze", label: "挖空", icon: PencilLine },
  { mode: "quiz", label: "出题", icon: FileQuestion },
  { mode: "custom", label: "自定义", icon: Settings2 },
];

/** 4 个模式按钮 — 图标 + 文字，等分一行，填充背景。 */
export function ModeButtons({ onPick, onCustomClick, disabled }: { onPick: (mode: RecordMode) => void; onCustomClick?: () => void; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {MODE_DEFS.map(({ mode, label, icon: Icon }) => (
        <button
          key={mode}
          data-no-drag
          disabled={disabled}
          className="press"
          onClick={() => mode === "custom" ? onCustomClick?.() : onPick(mode)}
          title={label}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "10px 4px",
            borderRadius: BOX.radius,
            border: BOX.border,
            background: BOX.bg,
            color: "var(--md-sys-color-on-surface-variant)",
            fontSize: 12,
            fontWeight: 600,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.5 : 1,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = BOX_HOVER_BG; }}
          onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = BOX.bg; }}
        >
          <Icon size={18} style={{ color: "var(--md-sys-color-primary)" }} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** 自定义模式输入框。 */
export function CustomInput({ value, onChange, onSubmit, onCancel }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div data-no-drag style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: BOX.radius, background: BOX.bg, border: BOX.border }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onSubmit(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        placeholder="输入你的处理要求…（如：把公式推导过程写详细）"
        autoFocus
        style={{
          width: "100%", height: 32, padding: "0 10px",
          borderRadius: BOX.radius, border: BOX.border,
          background: "var(--md-sys-color-surface-container-lowest)", color: "var(--ink)", fontSize: 12.5,
          outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          className="press"
          style={{
            padding: "5px 14px", borderRadius: BOX.radius, border: BOX.border,
            background: "transparent", color: "var(--ink-soft)", fontSize: 12.5, cursor: "pointer",
          }}
        >
          取消
        </button>
        <button
          onClick={onSubmit}
          disabled={!value.trim()}
          className="press"
          style={{
            padding: "5px 14px", borderRadius: BOX.radius, border: "none",
            background: "var(--md-sys-color-primary)", color: "var(--md-sys-color-on-primary)",
            fontSize: 12.5, fontWeight: 600, cursor: value.trim() ? "pointer" : "default",
            opacity: value.trim() ? 1 : 0.5,
          }}
        >
          提交
        </button>
      </div>
    </div>
  );
}