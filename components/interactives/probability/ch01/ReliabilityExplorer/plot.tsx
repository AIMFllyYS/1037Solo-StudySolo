import type { Component, Mode } from "@/lib/learning/probability/foundations/reliability";
import { SVG_H, SVG_W, COLOR_WIRE, COLOR_WIRE_OK, COLOR_WIRE_FAIL, COLOR_FAIL, ACCENT, COLOR_OK } from "./appearance";
// ─── SVG：串联电路 ──────────────────────────────────────────────────────────

interface CircuitProps {
  components: Component[];
  sysOk: boolean | null;
  compOk: boolean[] | null;
  mode: Mode;
}

export function SeriesCircuit({ components, sysOk, compOk }: Omit<CircuitProps, "mode">) {
  const n = components.length;
  const BOX_W = 52;
  const BOX_H = 34;
  const CY = SVG_H / 2;
  const totalBoxW = n * BOX_W + (n - 1) * 20; // gap=20
  const startX = (SVG_W - totalBoxW) / 2;

  const wireColor = (ok: boolean | null) =>
    ok === null ? COLOR_WIRE : ok ? COLOR_WIRE_OK : COLOR_WIRE_FAIL;
  const sysWire = wireColor(sysOk);

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ maxHeight: 130 }}>
      {/* 左端输入导线 */}
      <line x1={8} y1={CY} x2={startX} y2={CY} stroke={sysWire} strokeWidth={2.4} />
      {/* 电源符号 */}
      <circle cx={8} cy={CY} r={5} fill={sysOk === false ? COLOR_FAIL : ACCENT} />

      {components.map((comp, i) => {
        const boxX = startX + i * (BOX_W + 20);
        const ok = compOk ? compOk[i] : null;
        const boxColor = ok === null ? "var(--bg-elevated)" : ok ? "#dcfce7" : "#fee2e2";
        const strokeCol = ok === null ? "var(--line)" : ok ? COLOR_OK : COLOR_FAIL;
        const textCol = ok === null ? "var(--ink-soft)" : ok ? "#15803d" : "#b91c1c";

        // 左连接线
        const leftWire = i === 0 ? startX : startX + i * (BOX_W + 20);
        const prevOk = i === 0 ? sysOk : compOk ? compOk[i - 1] : null;

        return (
          <g key={comp.id}>
            {/* 元件间导线 */}
            {i > 0 && (
              <line
                x1={startX + (i - 1) * (BOX_W + 20) + BOX_W}
                y1={CY}
                x2={leftWire}
                y2={CY}
                stroke={wireColor(prevOk)}
                strokeWidth={2.4}
              />
            )}
            {/* 元件矩形 */}
            <rect
              x={boxX}
              y={CY - BOX_H / 2}
              width={BOX_W}
              height={BOX_H}
              rx={6}
              fill={boxColor}
              stroke={strokeCol}
              strokeWidth={1.8}
            />
            {/* 标签 */}
            <text x={boxX + BOX_W / 2} y={CY - 4} textAnchor="middle" fontSize={13} fontWeight={700} fill={textCol}>
              {comp.label}
            </text>
            {/* 可靠度 */}
            <text x={boxX + BOX_W / 2} y={CY + 11} textAnchor="middle" fontSize={10} fill={textCol}>
              {(comp.p * 100).toFixed(0)}%
            </text>
            {/* 状态图标 */}
            {ok !== null && (
              <text x={boxX + BOX_W - 6} y={CY - BOX_H / 2 + 12} textAnchor="middle" fontSize={10} fill={strokeCol}>
                {ok ? "OK" : "X"}
              </text>
            )}
          </g>
        );
      })}

      {/* 右端导线 */}
      <line
        x1={startX + (n - 1) * (BOX_W + 20) + BOX_W}
        y1={CY}
        x2={SVG_W - 8}
        y2={CY}
        stroke={wireColor(sysOk)}
        strokeWidth={2.4}
      />
      {/* 负载符号 */}
      <circle cx={SVG_W - 8} cy={CY} r={5} fill={sysOk === false ? COLOR_FAIL : ACCENT} />
      <text x={SVG_W / 2} y={SVG_H - 8} textAnchor="middle" fontSize={11} fill="var(--ink-faint)">
        ← 串联：全部正常系统才正常 →
      </text>
    </svg>
  );
}

export function ParallelCircuit({ components, sysOk, compOk }: Omit<CircuitProps, "mode">) {
  const n = components.length;
  const BOX_W = 52;
  const BOX_H = 28;
  const branchGap = 36;
  const totalH = n * BOX_H + (n - 1) * branchGap;
  const svgH = totalH + 40;
  const CY = svgH / 2;

  const wireColor = (ok: boolean | null) =>
    ok === null ? COLOR_WIRE : ok ? COLOR_WIRE_OK : COLOR_WIRE_FAIL;
  const sysWire = wireColor(sysOk);

  const branchY = (i: number) => CY - ((n - 1) / 2) * (BOX_H + branchGap) + i * (BOX_H + branchGap);
  const boxX = SVG_W / 2 - BOX_W / 2;
  const junctionL = boxX - 28;
  const junctionR = boxX + BOX_W + 28;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${svgH}`} className="w-full" style={{ maxHeight: svgH }}>
      {/* 左端总线 */}
      <line x1={8} y1={CY} x2={junctionL} y2={CY} stroke={sysWire} strokeWidth={2.4} />
      <circle cx={8} cy={CY} r={5} fill={sysOk === false ? COLOR_FAIL : ACCENT} />
      {/* 右端总线 */}
      <line x1={junctionR} y1={CY} x2={SVG_W - 8} y2={CY} stroke={sysWire} strokeWidth={2.4} />
      <circle cx={SVG_W - 8} cy={CY} r={5} fill={sysOk === false ? COLOR_FAIL : ACCENT} />

      {/* 左右汇流竖线 */}
      {n > 1 && (
        <>
          <line
            x1={junctionL}
            y1={branchY(0)}
            x2={junctionL}
            y2={branchY(n - 1)}
            stroke={COLOR_WIRE}
            strokeWidth={2}
          />
          <line
            x1={junctionR}
            y1={branchY(0)}
            x2={junctionR}
            y2={branchY(n - 1)}
            stroke={COLOR_WIRE}
            strokeWidth={2}
          />
        </>
      )}

      {components.map((comp, i) => {
        const by = branchY(i);
        const ok = compOk ? compOk[i] : null;
        const boxColor = ok === null ? "var(--bg-elevated)" : ok ? "#dcfce7" : "#fee2e2";
        const strokeCol = ok === null ? "var(--line)" : ok ? COLOR_OK : COLOR_FAIL;
        const textCol = ok === null ? "var(--ink-soft)" : ok ? "#15803d" : "#b91c1c";
        const branchWire = wireColor(ok);

        return (
          <g key={comp.id}>
            {/* 左分支线 */}
            <line x1={junctionL} y1={by} x2={boxX} y2={by} stroke={branchWire} strokeWidth={2.2} />
            {/* 右分支线 */}
            <line x1={boxX + BOX_W} y1={by} x2={junctionR} y2={by} stroke={branchWire} strokeWidth={2.2} />
            {/* 元件矩形 */}
            <rect
              x={boxX}
              y={by - BOX_H / 2}
              width={BOX_W}
              height={BOX_H}
              rx={6}
              fill={boxColor}
              stroke={strokeCol}
              strokeWidth={1.8}
            />
            <text x={boxX + BOX_W / 2} y={by - 2} textAnchor="middle" fontSize={13} fontWeight={700} fill={textCol}>
              {comp.label}
            </text>
            <text x={boxX + BOX_W / 2} y={by + 11} textAnchor="middle" fontSize={10} fill={textCol}>
              {(comp.p * 100).toFixed(0)}%
            </text>
            {ok !== null && (
              <text x={boxX + BOX_W - 4} y={by - BOX_H / 2 + 11} textAnchor="middle" fontSize={10} fill={strokeCol}>
                {ok ? "OK" : "X"}
              </text>
            )}
          </g>
        );
      })}

      <text x={SVG_W / 2} y={svgH - 6} textAnchor="middle" fontSize={11} fill="var(--ink-faint)">
        ← 并联：任一正常系统即正常 →
      </text>
    </svg>
  );
}