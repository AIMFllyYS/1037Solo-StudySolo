import { Y_LABELS, X_LABELS } from "@/lib/learning/probability/marginalDistributions";

import { ACCENT, TEAL, TEAL_LIGHT, GRAY_BG, ORANGE, ORANGE_LIGHT, ACCENT_MID } from "./appearance";
import { MiniHeat } from "./plot";
import { fmt4 } from "./formatters";
export interface CounterexamplePanelProps {
  pA: number[][];
  pXA: number[];
  pYA: number[];
  pB: number[][];
  pXB: number[];
  pYB: number[];
  marginalsMatch: boolean;
}

export function CounterexamplePanel({ pA, pXA, pYA, pB, pXB, pYB, marginalsMatch }: CounterexamplePanelProps) {
  return (
        <div className="space-y-4">
          <div className="rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed"
            style={{ borderColor: `${ORANGE}40`, background: ORANGE_LIGHT, color: ORANGE }}>
            <span className="font-bold">关键洞察：</span>
            知道边缘分布 P(X) 和 P(Y)，<b>不能</b>唯一确定联合分布 P(X,Y)！
            下面两个联合分布完全不同，但它们的边缘分布却完全一致。
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:gap-6 justify-center">
            {/* 联合分布 A */}
            <div className="flex flex-col items-center gap-3">
              <MiniHeat p={pA} label="联合分布 A" />
              <div className="text-[11px] text-[var(--ink-soft)] text-center">
                <div className="font-semibold text-[var(--ink)] mb-1">边缘分布（A）</div>
                <div className="flex gap-2 mb-1">
                  {pXA.map((v, i) => (
                    <div key={i} className="text-center">
                      <div className="text-[10px]">{X_LABELS[i]}</div>
                      <div className="font-mono font-bold" style={{ color: ACCENT }}>{fmt4(v)}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  {pYA.map((v, j) => (
                    <div key={j} className="text-center">
                      <div className="text-[10px]">{Y_LABELS[j]}</div>
                      <div className="font-mono font-bold" style={{ color: ACCENT_MID }}>{fmt4(v)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 分隔符 */}
            <div className="flex items-center justify-center">
              <div className="flex flex-col items-center gap-1">
                <div className="text-2xl font-bold" style={{ color: ORANGE }}>≠</div>
                <div className="text-[11px] text-[var(--ink-soft)] text-center">联合<br/>不同</div>
              </div>
            </div>

            {/* 联合分布 B */}
            <div className="flex flex-col items-center gap-3">
              <MiniHeat p={pB} label="联合分布 B" />
              <div className="text-[11px] text-[var(--ink-soft)] text-center">
                <div className="font-semibold text-[var(--ink)] mb-1">边缘分布（B）</div>
                <div className="flex gap-2 mb-1">
                  {pXB.map((v, i) => (
                    <div key={i} className="text-center">
                      <div className="text-[10px]">{X_LABELS[i]}</div>
                      <div className="font-mono font-bold" style={{ color: ACCENT }}>{fmt4(v)}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  {pYB.map((v, j) => (
                    <div key={j} className="text-center">
                      <div className="text-[10px]">{Y_LABELS[j]}</div>
                      <div className="font-mono font-bold" style={{ color: ACCENT_MID }}>{fmt4(v)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 边缘相同确认 */}
          <div
            className="rounded-lg border px-4 py-3 text-center"
            style={{
              borderColor: marginalsMatch ? `${TEAL}40` : `${ORANGE}40`,
              background: marginalsMatch ? TEAL_LIGHT : ORANGE_LIGHT,
            }}
          >
            <div
              className="text-[14px] font-bold"
              style={{ color: marginalsMatch ? TEAL : ORANGE }}
            >
              {marginalsMatch ? "边缘分布完全相同" : "边缘分布有差异"}
            </div>
            <div className="text-[12px] mt-1" style={{ color: marginalsMatch ? TEAL : ORANGE }}>
              {marginalsMatch
                ? "两个截然不同的联合分布，投影到 X 轴或 Y 轴后得到的边缘分布一模一样！"
                : "（请检查反例数据设置）"}
            </div>
          </div>

          {/* 对比：X 边缘 */}
          <div className="rounded-lg p-3" style={{ background: GRAY_BG }}>
            <div className="text-[12px] font-semibold text-[var(--ink)] mb-2">X 边缘分布对比（A vs B）</div>
            <div className="space-y-1.5">
              {pXA.map((vA, i) => {
                const vB = pXB[i];
                const match = Math.abs(vA - vB) < 0.001;
                return (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <span className="text-[var(--ink-soft)] w-4">{X_LABELS[i]}</span>
                    <span className="font-mono" style={{ color: ACCENT }}>{fmt4(vA)}</span>
                    <span className="text-[var(--ink-soft)]">vs</span>
                    <span className="font-mono" style={{ color: ACCENT_MID }}>{fmt4(vB)}</span>
                    <span className="ml-1 text-[11px] font-bold" style={{ color: match ? TEAL : ORANGE }}>
                      {match ? "相同" : "不同"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 结论 */}
          <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-2.5 text-[12px] text-[var(--ink-soft)] leading-relaxed">
            <span className="font-semibold text-[var(--ink)]">结论：</span>
            边缘分布是联合分布的{'"影子"'}——它丢失了 X 与 Y 之间的<b className="text-[var(--ink)]">相关结构</b>（协方差、独立性信息等）。
            只有当 X 与 Y <b className="text-[var(--ink)]">相互独立</b>时，边缘分布才能完全恢复联合分布（此时
            <span className="font-mono ml-1">p(xᵢ,yⱼ) = P(X=xᵢ)·P(Y=yⱼ)</span>）。
          </div>
        </div>
      );
}
