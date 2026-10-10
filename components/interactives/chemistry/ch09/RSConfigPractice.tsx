"use client";

import { memo, useState } from "react";
import { EXAMPLES, rankedSubstituents } from "@/lib/learning/chemistry/stereochemistry/configuration";
import type { Config } from "@/lib/learning/chemistry/stereochemistry/configuration";
import { PRIORITY_COLORS, PRIORITY_TAGS } from "./RSConfigPractice/appearance";
import { describeArc } from "./RSConfigPractice/geometry";

type Step = 0 | 1 | 2 | 3;
function RSConfigPracticeBase() {
  const [exIndex, setExIndex] = useState<number>(0);
  const [step, setStep] = useState<Step>(0);
  const [guess, setGuess] = useState<Config | null>(null);

  const example = EXAMPLES[exIndex];
  const ranked = rankedSubstituents(example);
  // 排好序后：ranked[0]=a, ranked[1]=b, ranked[2]=c, ranked[3]=d(最小，朝后)

  function selectExample(i: number) {
    setExIndex(i);
    setStep(0);
    setGuess(null);
  }

  function nextStep() {
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  }
  function prevStep() {
    setStep((s) => (s > 0 ? ((s - 1) as Step) : s));
  }

  const isCorrect = guess !== null && guess === example.answer;

  /* ---------- SVG 四面体几何 ----------
   * 中心碳在画布中央。三个键朝前/侧（a,b,c），第四个键(d)朝后用虚线表示。
   * 我们把 a,b,c 放在围绕中心的三个角，d 画在中心后方（虚线 + 小标记）。
   */
  const CX = 170;
  const CY = 150;
  // a, b, c 三个顶点（围成三角，便于看顺/逆时针）
  const vertices: { x: number; y: number }[] = [
    { x: CX, y: CY - 90 }, // 顶部 — a
    { x: CX + 88, y: CY + 60 }, // 右下 — b
    { x: CX - 88, y: CY + 60 }, // 左下 — c
  ];
  // d 朝后（虚线，指向中心斜后方）
  const dVertex = { x: CX, y: CY + 105 };

  function vertexHighlighted(idx: number): boolean {
    // step3 高亮 a,b,c 的旋转方向；step0 高亮全部按优先级；step1 高亮 a；step2 高亮 d
    if (step === 0) return true;
    if (step === 1) return idx === 0; // 强调 a 是最高优先级（顺带说明排序完成）
    if (step === 2) return false; // 第二步强调 d 朝后（在 d 标记里高亮）
    return true; // step3 看 a→b→c
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4">
      <h3 className="text-lg font-semibold text-[var(--ink)]">
        R / S 构型判定练习
      </h3>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">
        选一个手性分子，按顺序规则给四个基团排优先级 a&gt;b&gt;c&gt;d，把最小基团
        d 朝后，再看 a→b→c 是顺时针（R）还是逆时针（S）。
      </p>

      {/* 实例选择 */}
      <div className="mt-4 flex flex-wrap gap-2">
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => selectExample(i)}
            className={
              "rounded-lg border px-3 py-1.5 text-sm transition-colors " +
              (i === exIndex
                ? "border-transparent bg-[var(--primary,#2563eb)] text-white"
                : "border-[var(--line)] bg-[var(--bg-muted)] text-[var(--ink)] hover:border-[var(--ink-soft)]")
            }
          >
            {ex.name}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* 左：SVG 四面体 */}
        <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] p-2">
          <svg
            viewBox="0 0 340 300"
            className="h-auto w-full"
            role="img"
            aria-label={`${example.name} 的手性碳四面体示意`}
          >
            {/* 朝后的 d 键：虚线 */}
            <line
              x1={CX}
              y1={CY}
              x2={dVertex.x}
              y2={dVertex.y}
              stroke="var(--ink-soft)"
              strokeWidth={2}
              strokeDasharray="5 4"
            />
            {/* a,b,c 三个键 */}
            {vertices.map((v, idx) => (
              <line
                key={`bond-${idx}`}
                x1={CX}
                y1={CY}
                x2={v.x}
                y2={v.y}
                stroke={
                  vertexHighlighted(idx)
                    ? PRIORITY_COLORS[idx]
                    : "var(--line)"
                }
                strokeWidth={vertexHighlighted(idx) ? 3.5 : 2}
              />
            ))}

            {/* step3：a→b→c 旋转方向箭头（弧线） */}
            {step === 3 && (
              <g>
                <path
                  d={describeArc(CX, CY, 58, example.answer)}
                  fill="none"
                  stroke="var(--primary,#2563eb)"
                  strokeWidth={3}
                  markerEnd="url(#arrowHead)"
                />
                <defs>
                  <marker
                    id="arrowHead"
                    markerWidth="8"
                    markerHeight="8"
                    refX="4"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8 Z" fill="var(--primary,#2563eb)" />
                  </marker>
                </defs>
              </g>
            )}

            {/* 中心碳 */}
            <circle
              cx={CX}
              cy={CY}
              r={16}
              fill="var(--bg-elevated)"
              stroke="var(--ink)"
              strokeWidth={2}
            />
            <text
              x={CX}
              y={CY + 4}
              textAnchor="middle"
              fontSize={13}
              fontWeight={600}
              fill="var(--ink)"
            >
              C
            </text>

            {/* a,b,c 顶点标签 */}
            {vertices.map((v, idx) => {
              const sub = ranked[idx];
              const on = vertexHighlighted(idx);
              return (
                <g key={`v-${idx}`}>
                  <circle
                    cx={v.x}
                    cy={v.y}
                    r={18}
                    fill={on ? PRIORITY_COLORS[idx] : "var(--bg-elevated)"}
                    stroke={PRIORITY_COLORS[idx]}
                    strokeWidth={2}
                  />
                  <text
                    x={v.x}
                    y={v.y + 4}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={700}
                    fill={on ? "white" : PRIORITY_COLORS[idx]}
                  >
                    {PRIORITY_TAGS[idx]}
                  </text>
                  <text
                    x={v.x}
                    y={v.y - 26}
                    textAnchor="middle"
                    fontSize={12}
                    fill="var(--ink)"
                  >
                    {sub.label}
                  </text>
                </g>
              );
            })}

            {/* d 顶点（最小基团，朝后） */}
            <circle
              cx={dVertex.x}
              cy={dVertex.y}
              r={18}
              fill={step === 2 ? PRIORITY_COLORS[3] : "var(--bg-elevated)"}
              stroke={PRIORITY_COLORS[3]}
              strokeWidth={2}
              strokeDasharray={step === 2 ? "0" : "4 3"}
            />
            <text
              x={dVertex.x}
              y={dVertex.y + 4}
              textAnchor="middle"
              fontSize={13}
              fontWeight={700}
              fill={step === 2 ? "white" : PRIORITY_COLORS[3]}
            >
              d
            </text>
            <text
              x={dVertex.x}
              y={dVertex.y + 34}
              textAnchor="middle"
              fontSize={12}
              fill="var(--ink-soft)"
            >
              {ranked[3].label}（朝后）
            </text>
          </svg>
        </div>

        {/* 右：分步引导 */}
        <div className="flex flex-col">
          <div className="rounded-lg border border-[var(--line)] p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]">
              {example.name} · {example.centerLabel}
            </div>

            {/* 步骤内容 */}
            <div className="mt-2 min-h-[150px] text-sm text-[var(--ink)]">
              {step === 0 && (
                <div>
                  <p className="font-semibold">第 ① 步：按顺序规则排优先级</p>
                  <p className="mt-1 text-[var(--ink-soft)]">
                    比较每个取代基第一个原子的原子序数，越大优先级越高。
                  </p>
                  <ol className="mt-2 space-y-1">
                    {ranked.map((s, idx) => (
                      <li key={s.label} className="flex items-center gap-2">
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: PRIORITY_COLORS[idx] }}
                        >
                          {PRIORITY_TAGS[idx]}
                        </span>
                        <span>
                          {s.label}
                          <span className="text-[var(--ink-soft)]">
                            {" "}
                            （首原子 {s.firstAtom}，序数 {s.atomicNumber}）
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-xs text-[var(--ink-soft)]">
                    优先级：a &gt; b &gt; c &gt; d
                  </p>
                </div>
              )}

              {step === 1 && (
                <div>
                  <p className="font-semibold">第 ① 步小结：a 最高、d 最低</p>
                  <p className="mt-1">
                    最高优先级{" "}
                    <strong style={{ color: PRIORITY_COLORS[0] }}>
                      a = {ranked[0].label}
                    </strong>
                    ，最低优先级{" "}
                    <strong style={{ color: PRIORITY_COLORS[3] }}>
                      d = {ranked[3].label}
                    </strong>
                    。
                  </p>
                  <p className="mt-2 text-[var(--ink-soft)]">
                    {example.note}
                  </p>
                </div>
              )}

              {step === 2 && (
                <div>
                  <p className="font-semibold">第 ② 步：把最小基团 d 朝后</p>
                  <p className="mt-1">
                    将{" "}
                    <strong style={{ color: PRIORITY_COLORS[3] }}>
                      d = {ranked[3].label}
                    </strong>{" "}
                    放到远离观察者的方向（图中虚线键，现已高亮）。
                  </p>
                  <p className="mt-2 text-[var(--ink-soft)]">
                    这样剩下的 a、b、c 都朝向观察者，方便判断旋转方向。
                  </p>
                </div>
              )}

              {step === 3 && (
                <div>
                  <p className="font-semibold">第 ③ 步：看 a→b→c 的旋向</p>
                  <p className="mt-1">
                    沿 a → b → c 画箭头：
                    <strong>
                      {example.answer === "R"
                        ? " 顺时针 ⟳ → R 构型"
                        : " 逆时针 ⟲ → S 构型"}
                    </strong>
                    。
                  </p>

                  {/* 用户校验 */}
                  <div className="mt-3">
                    <p className="text-[var(--ink-soft)]">先猜猜看：</p>
                    <div className="mt-1 flex gap-2">
                      {(["R", "S"] as Config[]).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setGuess(c)}
                          className={
                            "rounded-lg border px-4 py-1.5 text-sm font-semibold transition-colors " +
                            (guess === c
                              ? "border-transparent bg-[var(--primary,#2563eb)] text-white"
                              : "border-[var(--line)] bg-[var(--bg-muted)] text-[var(--ink)] hover:border-[var(--ink-soft)]")
                          }
                        >
                          {c} 构型
                        </button>
                      ))}
                    </div>
                    {guess !== null && (
                      <p
                        className="mt-2 text-sm font-semibold"
                        style={{ color: isCorrect ? "#16a34a" : "#dc2626" }}
                      >
                        {isCorrect
                          ? `正确！${example.name} 是 ${example.answer} 构型。`
                          : `再想想～正确答案是 ${example.answer} 构型。`}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 步骤导航 */}
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={prevStep}
              disabled={step === 0}
              className="rounded-lg border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-1.5 text-sm text-[var(--ink)] transition-colors hover:border-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              上一步
            </button>
            <div className="flex gap-1.5">
              {[0, 1, 2, 3].map((s) => (
                <span
                  key={s}
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      s === step ? "var(--primary,#2563eb)" : "var(--line)",
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={nextStep}
              disabled={step === 3}
              className="rounded-lg border border-transparent bg-[var(--primary,#2563eb)] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一步
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(RSConfigPracticeBase);
