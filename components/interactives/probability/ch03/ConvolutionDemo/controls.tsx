import { DIST_CONFIGS } from "@/lib/learning/probability/joint/convolution";
import type { DistParams, DistType } from "@/lib/learning/probability/joint/convolution";
// ─── 分布选择器与参数滑块 ────────────────────────────────────────
interface DistPanelProps {
  label: string;
  color: string;
  dist: DistParams;
  onChange: (d: DistParams) => void;
}

export function DistPanel({ label, color, dist, onChange }: DistPanelProps) {
  const cfg = DIST_CONFIGS[dist.type];
  const types: DistType[] = ["normal", "uniform", "exponential", "bernoulli"];

  function setType(t: DistType) {
    const defaults: Record<DistType, DistParams> = {
      normal: { type: "normal", p1: 0, p2: 1 },
      uniform: { type: "uniform", p1: -1, p2: 1 },
      exponential: { type: "exponential", p1: 1, p2: 0 },
      bernoulli: { type: "bernoulli", p1: 0.5, p2: 2 },
    };
    onChange(defaults[t]);
  }

  function setParam(key: "p1" | "p2", val: number) {
    onChange({ ...dist, [key]: val });
  }

  // Guard: uniform needs b > a
  const safeP2 =
    dist.type === "uniform"
      ? Math.max(dist.p1 + 0.5, dist.p2)
      : dist.p2;

  const mean = cfg.mean(dist);
  const variance = cfg.variance({ ...dist, p2: safeP2 });

  return (
    <div
      className="flex-1 rounded-lg p-3 space-y-3"
      style={{ background: color + "18", border: `1.5px solid ${color}44` }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full flex-shrink-0"
          style={{ background: color }}
        />
        <span className="font-semibold text-[13px]" style={{ color }}>
          {label}
        </span>
      </div>

      {/* 分布类型选择 */}
      <div className="flex flex-wrap gap-1">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className="rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors"
            style={
              dist.type === t
                ? { background: color, color: "#fff" }
                : {
                    background: "var(--bg-muted)",
                    color: "var(--ink-soft)",
                  }
            }
          >
            {t === "normal"
              ? "正态"
              : t === "uniform"
              ? "均匀"
              : t === "exponential"
              ? "指数"
              : "伯努利"}
          </button>
        ))}
      </div>

      {/* 参数滑块 */}
      {cfg.params.map(([name, key, min, max, step]) => {
        const paramKey = key as "p1" | "p2";
        const currentVal = paramKey === "p2" ? safeP2 : dist[paramKey];
        return (
          <div key={key} className="space-y-0.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--ink-soft)]">{name}</span>
              <span
                className="font-mono font-bold"
                style={{ color }}
              >
                {currentVal.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={currentVal}
              onChange={(e) => setParam(paramKey, Number(e.target.value))}
              className="w-full h-1.5 cursor-pointer"
              style={{ accentColor: color }}
            />
          </div>
        );
      })}

      {/* 均值/方差 */}
      <div className="flex gap-3 text-[11px] text-[var(--ink-soft)]">
        <span>
          E = <b style={{ color }} className="font-mono">{mean.toFixed(3)}</b>
        </span>
        <span>
          Var = <b style={{ color }} className="font-mono">{variance.toFixed(3)}</b>
        </span>
      </div>
    </div>
  );
}