"use client";

import { memo, useState } from "react";
import { INIT_COMPONENTS, calcSeries, calcParallel } from "@/lib/learning/probability/foundations/reliability";
import type { Mode, Component } from "@/lib/learning/probability/foundations/reliability";
import { reliabilityColor, COLOR_OK, COLOR_FAIL, ACCENT } from "./ReliabilityExplorer/appearance";
import { SeriesCircuit, ParallelCircuit } from "./ReliabilityExplorer/plot";
// ─── 主组件 ─────────────────────────────────────────────────────────────────

function ReliabilityExplorerBase() {
  const [mode, setMode] = useState<Mode>("series");
  const [components, setComponents] = useState<Component[]>(INIT_COMPONENTS);
  const [simResult, setSimResult] = useState<{
    compOk: boolean[];
    sysOk: boolean;
  } | null>(null);
  const [simCount, setSimCount] = useState(0);
  const [simSuccess, setSimSuccess] = useState(0);

  const ps = components.map((c) => c.p);
  const sysR = mode === "series" ? calcSeries(ps) : calcParallel(ps);

  function updateP(id: number, newP: number) {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, p: Math.round(newP * 100) / 100 } : c))
    );
    setSimResult(null);
  }

  function runOnce() {
    const compOk = components.map((c) => Math.random() < c.p);
    const sysOk =
      mode === "series" ? compOk.every(Boolean) : compOk.some(Boolean);
    setSimResult({ compOk, sysOk });
    setSimCount((n) => n + 1);
    setSimSuccess((n) => n + (sysOk ? 1 : 0));
  }

  function runMany(k: number) {
    let sc = simCount;
    let ss = simSuccess;
    let last: { compOk: boolean[]; sysOk: boolean } | null = null;
    for (let i = 0; i < k; i++) {
      const compOk = components.map((c) => Math.random() < c.p);
      const sysOk =
        mode === "series" ? compOk.every(Boolean) : compOk.some(Boolean);
      sc++;
      if (sysOk) ss++;
      last = { compOk, sysOk };
    }
    setSimResult(last);
    setSimCount(sc);
    setSimSuccess(ss);
  }

  function resetSim() {
    setSimResult(null);
    setSimCount(0);
    setSimSuccess(0);
  }

  const simFreq = simCount > 0 ? simSuccess / simCount : null;
  const rCol = reliabilityColor(sysR);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4">
      {/* 标题 + 模式切换 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-[15px] font-semibold text-[var(--ink)]">可靠性系统探索</h3>
        <div className="flex gap-1.5">
          {(["series", "parallel"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); resetSim(); }}
              className={
                "rounded-lg px-3 py-1 text-[13px] font-medium transition-colors " +
                (mode === m
                  ? "bg-[var(--accent)] text-[var(--md-sys-color-on-primary)]"
                  : "bg-[var(--bg-muted)] text-[var(--ink-soft)] hover:bg-[var(--accent-weak)]")
              }
            >
              {m === "series" ? "串联" : "并联"}
            </button>
          ))}
        </div>
      </div>

      {/* 电路图 */}
      <div className="rounded-lg bg-[var(--bg-muted)] p-2 mb-3">
        {mode === "series" ? (
          <SeriesCircuit
            components={components}
            sysOk={simResult ? simResult.sysOk : null}
            compOk={simResult ? simResult.compOk : null}
          />
        ) : (
          <ParallelCircuit
            components={components}
            sysOk={simResult ? simResult.sysOk : null}
            compOk={simResult ? simResult.compOk : null}
          />
        )}
      </div>

      {/* 元件可靠度滑块 */}
      <div className="space-y-2.5 mb-3">
        {components.map((comp, i) => {
          const ok = simResult ? simResult.compOk[i] : null;
          return (
            <div key={comp.id} className="flex items-center gap-3">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                style={{
                  background:
                    ok === null ? "var(--bg-muted)" : ok ? "#dcfce7" : "#fee2e2",
                  color:
                    ok === null ? "var(--ink-soft)" : ok ? "#15803d" : "#b91c1c",
                  border: `1.5px solid ${ok === null ? "var(--line)" : ok ? COLOR_OK : COLOR_FAIL}`,
                }}
              >
                {comp.label}
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(comp.p * 100)}
                onChange={(e) => updateP(comp.id, Number(e.target.value) / 100)}
                className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: ACCENT }}
              />
              <span className="w-10 text-right font-mono text-[13px] font-semibold text-[var(--ink)]">
                {(comp.p * 100).toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* 系统可靠度展示 */}
      <div className="rounded-lg border border-[var(--line)] px-3 py-2.5 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[var(--ink-soft)] mb-0.5">
              系统可靠度
              <span className="ml-1.5 font-mono text-[10px] bg-[var(--bg-muted)] px-1.5 py-0.5 rounded text-[var(--ink-soft)]">
                {mode === "series"
                  ? `R = ${components.map((c) => `${(c.p * 100).toFixed(0)}%`).join(" × ")}`
                  : `R = 1 − ${components.map((c) => `(1−${(c.p * 100).toFixed(0)}%)`).join("×")}`}
              </span>
            </p>
            <p className="text-[22px] font-bold font-mono" style={{ color: rCol }}>
              {(sysR * 100).toFixed(2)}%
            </p>
          </div>
          {/* 可靠度条形 */}
          <div className="w-28 h-3 rounded-full bg-[var(--bg-muted)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${sysR * 100}%`, background: rCol }}
            />
          </div>
        </div>

        {/* 对比提示 */}
        <div className="mt-1.5 text-[11px] text-[var(--ink-soft)]">
          {mode === "series" ? (
            <span>
              串联：系统可靠度 <b className="text-[var(--ink)]">低于</b> 最弱元件（
              {Math.min(...ps.map((p) => p * 100)).toFixed(0)}%），元件越多越脆弱。
            </span>
          ) : (
            <span>
              并联：系统可靠度 <b className="text-[var(--ink)]">高于</b> 最强元件（
              {Math.max(...ps.map((p) => p * 100)).toFixed(0)}%），冗余提升可靠性。
            </span>
          )}
        </div>
      </div>

      {/* 蒙特卡洛模拟 */}
      <div className="rounded-lg bg-[var(--bg-muted)] px-3 py-2.5">
        <p className="text-[12px] font-semibold text-[var(--ink-soft)] mb-2">
          Monte Carlo 模拟（验证理论值）
        </p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button
            onClick={runOnce}
            className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[12px] font-medium text-[var(--md-sys-color-on-primary)] hover:opacity-90"
          >
            运行 1 次
          </button>
          {[100, 1000].map((k) => (
            <button
              key={k}
              onClick={() => runMany(k)}
              className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[12px] font-medium text-[var(--md-sys-color-on-primary)] hover:opacity-90"
            >
              运行 {k} 次
            </button>
          ))}
          <button
            onClick={resetSim}
            className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--line)] px-2.5 py-1 text-[12px] font-medium text-[var(--ink-soft)] hover:bg-[var(--line)]"
          >
            重置
          </button>
        </div>

        {simCount > 0 ? (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
            <span className="text-[var(--ink-soft)]">
              已运行 <b className="text-[var(--ink)]">{simCount}</b> 次
            </span>
            <span className="text-[var(--ink-soft)]">
              成功 <b className="text-[var(--ink)]">{simSuccess}</b> 次
            </span>
            <span className="text-[var(--ink-soft)]">
              频率{" "}
              <b className="font-mono" style={{ color: reliabilityColor(simFreq!) }}>
                {((simFreq ?? 0) * 100).toFixed(2)}%
              </b>
            </span>
            <span className="text-[var(--ink-soft)]">
              理论{" "}
              <b className="font-mono text-[var(--ink)]">
                {(sysR * 100).toFixed(2)}%
              </b>
            </span>
            {simResult && (
              <span
                className="font-semibold"
                style={{ color: simResult.sysOk ? COLOR_OK : COLOR_FAIL }}
              >
                最近一次：{simResult.sysOk ? "[OK] 系统正常" : "[X] 系统失效"}
              </span>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-[var(--ink-soft)] italic">
            点击按钮随机模拟各元件工作/失效，观察频率收敛到理论值。
          </p>
        )}

        {/* 频率与理论对比条 */}
        {simCount >= 10 && simFreq !== null && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--ink-soft)]">
            <span className="w-8">模拟</span>
            <div className="flex-1 h-2 rounded-full bg-[var(--bg-elevated)] border border-[var(--line)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${simFreq * 100}%`,
                  background: reliabilityColor(simFreq),
                }}
              />
            </div>
            <span className="w-8">理论</span>
            <div className="flex-1 h-2 rounded-full bg-[var(--bg-elevated)] border border-[var(--line)] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${sysR * 100}%`, background: rCol }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 公式说明 */}
      <div className="mt-3 rounded-lg border border-[var(--line)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-soft)]">
        {mode === "series" ? (
          <>
            <b className="text-[var(--ink)]">串联系统</b>：各元件独立，系统正常当且仅当所有元件均正常。
            由独立事件乘法定理：{" "}
            <code className="bg-[var(--bg-muted)] px-1 rounded text-[var(--accent)]">
              R = p₁ × p₂ × … × pₙ
            </code>
            ，可靠度严格低于最小分量。
          </>
        ) : (
          <>
            <b className="text-[var(--ink)]">并联系统</b>：至少一个元件正常即可。系统失效概率
            = 所有元件同时失效，故{" "}
            <code className="bg-[var(--bg-muted)] px-1 rounded text-[var(--accent)]">
              R = 1 − (1−p₁)(1−p₂)…(1−pₙ)
            </code>
            ，冗余显著提升可靠性。
          </>
        )}
      </div>
    </div>
  );
}

export default memo(ReliabilityExplorerBase);