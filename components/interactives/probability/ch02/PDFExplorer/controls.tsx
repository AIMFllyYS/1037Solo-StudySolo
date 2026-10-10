import { useState } from "react";
import { ACCENT, TEAL, ORANGE } from "./appearance";
// ─── 滑块子组件 ──────────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  color?: string;
}

export function SliderRow({ label, value, min, max, step, onChange, fmt, color }: SliderRowProps) {
  const display = fmt ? fmt(value) : value.toFixed(2);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-right text-[12px] text-[var(--ink-soft)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 cursor-pointer"
        style={{ accentColor: color ?? ACCENT }}
      />
      <span
        className="w-14 shrink-0 rounded px-1 py-0.5 text-center text-[12px] font-mono font-bold"
        style={{ background: (color ?? ACCENT) + "22", color: color ?? ACCENT }}
      >
        {display}
      </span>
    </div>
  );
}

// ─── 无记忆性验证面板 ─────────────────────────────────────────────
interface MemorylessProps {
  lam: number;
}

export function MemorylessPanel({ lam }: MemorylessProps) {
  const [s, setS] = useState(1.0);
  const [t, setT] = useState(2.0);

  // P(X > s+t | X > s) = P(X > t)
  const pXgts = Math.exp(-lam * s);
  const pXgtsPlusT = Math.exp(-lam * (s + t));
  const conditional = pXgts > 0 ? pXgtsPlusT / pXgts : 0;
  const pXgtt = Math.exp(-lam * t);
  const match = Math.abs(conditional - pXgtt) < 1e-9;

  return (
    <div className="mt-3 rounded-lg border border-[var(--line)] bg-emerald-500/10 p-3 space-y-3">
      <div className="text-[12px] font-semibold text-[#0f766e]">无记忆性验证</div>
      <p className="text-[11px] text-[var(--ink-soft)] leading-relaxed">
        指数分布有「无记忆性」：已知 X &gt; s，额外再等 t 的概率，等同于从头等 t。
        即 P(X &gt; s+t | X &gt; s) = P(X &gt; t)。
      </p>
      <div className="grid grid-cols-2 gap-2">
        <SliderRow label="s =" value={s} min={0.1} max={5} step={0.1} onChange={setS} fmt={(v) => v.toFixed(1)} color={TEAL} />
        <SliderRow label="t =" value={t} min={0.1} max={5} step={0.1} onChange={setT} fmt={(v) => v.toFixed(1)} color={ORANGE} />
      </div>
      <div className="rounded bg-[var(--bg-elevated)] px-3 py-2 text-[12px] space-y-1 font-mono">
        <div>
          P(X &gt; s) = e<sup>−λs</sup> ={" "}
          <span style={{ color: TEAL }}>{pXgts.toFixed(6)}</span>
        </div>
        <div>
          P(X &gt; s+t) = e<sup>−λ(s+t)</sup> ={" "}
          <span style={{ color: ACCENT }}>{pXgtsPlusT.toFixed(6)}</span>
        </div>
        <div className="border-t border-[var(--line)] pt-1 mt-1">
          P(X &gt; s+t | X &gt; s) = {pXgtsPlusT.toFixed(6)} / {pXgts.toFixed(6)}{" "}
          ={" "}<span className="font-bold" style={{ color: ORANGE }}>{conditional.toFixed(6)}</span>
        </div>
        <div>
          P(X &gt; t) = e<sup>−λt</sup> ={" "}
          <span className="font-bold" style={{ color: ORANGE }}>{pXgtt.toFixed(6)}</span>
        </div>
        <div
          className="rounded px-2 py-1 text-center font-bold"
          style={{ background: match ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)", color: match ? "var(--color-success)" : "var(--md-sys-color-error)" }}
        >
          {match ? "[OK] 两者完全相等，无记忆性成立！" : "数值偏差过大"}
        </div>
      </div>
    </div>
  );
}