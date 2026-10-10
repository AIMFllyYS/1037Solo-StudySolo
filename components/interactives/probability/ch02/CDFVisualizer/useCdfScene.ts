import { useCallback, useRef } from "react";
import { binomCDF, normalCDF, expCDF, clamp, binomPMF, normalPDF, expPDF } from "@/lib/learning/probability/cumulativeDistributions";
import type { DistType } from "@/lib/learning/probability/cumulativeDistributions";
import { xToSvg, yToSvg, svgToX } from "./geometry";
import { PAD_T, PLOT_H, PLOT_W, LINE, ACCENT, ORANGE, PAD_L } from "./appearance";
import { useDrag } from "./useDrag";
export interface CdfSceneInput {
  distType: DistType;
  binomN: number;
  normalMu: number;
  normalSigma: number;
  expLambda: number;
  binomP: number;
  setXVal: React.Dispatch<React.SetStateAction<number>>;
  setAVal: React.Dispatch<React.SetStateAction<number>>;
  setBVal: React.Dispatch<React.SetStateAction<number>>;
  setDistType: React.Dispatch<React.SetStateAction<DistType>>;
  xVal: number;
  aVal: number;
  bVal: number;
  showInterval: boolean;
  viewMode: "pdf" | "cdf";
}

export function useCdfScene(input: CdfSceneInput) {
  const { distType, binomN, normalMu, normalSigma, expLambda, binomP, setXVal, setAVal, setBVal, setDistType, xVal, aVal, bVal, showInterval, viewMode } = input;

  const svgRef = useRef<SVGSVGElement>(null);

  // ─── 分布范围配置 ───────────────────────────────────────────
  const getRange = (): { xMin: number; xMax: number } => {
    if (distType === "binomial") return { xMin: -0.5, xMax: binomN + 0.5 };
    if (distType === "normal") return { xMin: normalMu - 4 * normalSigma, xMax: normalMu + 4 * normalSigma };
    return { xMin: 0, xMax: 8 / expLambda };
  };

  const { xMin, xMax } = getRange();

  // ─── CDF 值计算 ─────────────────────────────────────────────
  const getCDF = (x: number): number => {
    if (distType === "binomial") return binomCDF(x, binomN, binomP);
    if (distType === "normal") return normalCDF(x, normalMu, normalSigma);
    return expCDF(x, expLambda);
  };

  // 区间概率 P(a<=X<=b)
  const getIntervalProb = (a: number, b: number): number => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (distType === "binomial") {
      return binomCDF(hi, binomN, binomP) - binomCDF(lo - 1, binomN, binomP);
    }
    return getCDF(hi) - getCDF(lo);
  };

  // 钳制到有效范围
  const clampX = useCallback((v: number) => clamp(v, xMin, xMax), [xMin, xMax]);

  // ─── PDF/PMF 最大值（用于 y 轴标准化）──────────────────────
  const getPDFMax = (): number => {
    if (distType === "binomial") {
      let max = 0;
      for (let k = 0; k <= binomN; k++) {
        const v = binomPMF(k, binomN, binomP);
        if (v > max) max = v;
      }
      return max * 1.3;
    }
    if (distType === "normal") {
      return normalPDF(normalMu, normalMu, normalSigma) * 1.3;
    }
    return expPDF(0, expLambda) * 1.3;
  };

  const pdfMax = getPDFMax();

  // ─── 生成 PDF/PMF 路径 ──────────────────────────────────────
  const buildPDFPath = (): string => {
    if (distType === "binomial") return ""; // 离散，用 rect 绘制
    const steps = 200;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = xMin + (i / steps) * (xMax - xMin);
      const y = distType === "normal" ? normalPDF(x, normalMu, normalSigma) : expPDF(x, expLambda);
      const sx = xToSvg(x, xMin, xMax);
      const sy = yToSvg(y, pdfMax);
      pts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)}`);
    }
    return pts.join(" ");
  };

  // ─── 生成 CDF 路径 ───────────────────────────────────────────
  const buildCDFPath = (): string => {
    if (distType === "binomial") return ""; // 离散，用 step 函数
    const steps = 300;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = xMin + (i / steps) * (xMax - xMin);
      const y = getCDF(x);
      const sx = xToSvg(x, xMin, xMax);
      const sy = yToSvg(y, 1);
      pts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)}`);
    }
    return pts.join(" ");
  };

  // ─── 阴影填充路径（左侧面积 F(x)）─────────────────────────
  const buildFillPath = (toX: number): string => {
    if (distType === "binomial") return "";
    const steps = 150;
    const x0 = xMin;
    const x1 = Math.min(toX, xMax);
    const sx0 = xToSvg(x0, xMin, xMax);
    const sx1 = xToSvg(x1, xMin, xMax);
    const baseY = PAD_T + PLOT_H;
    const pts: string[] = [`M${sx0.toFixed(2)},${baseY.toFixed(2)}`];
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (i / steps) * (x1 - x0);
      const y = distType === "normal" ? normalPDF(x, normalMu, normalSigma) : expPDF(x, expLambda);
      const sx = xToSvg(x, xMin, xMax);
      const sy = yToSvg(y, pdfMax);
      pts.push(`L${sx.toFixed(2)},${sy.toFixed(2)}`);
    }
    pts.push(`L${sx1.toFixed(2)},${baseY.toFixed(2)}`);
    pts.push("Z");
    return pts.join(" ");
  };

  // 区间 [a, b] 的填充路径
  const buildIntervalFillPath = (fromX: number, toX: number): string => {
    if (distType === "binomial") return "";
    const steps = 150;
    const x0 = Math.max(Math.min(fromX, toX), xMin);
    const x1 = Math.min(Math.max(fromX, toX), xMax);
    const sx0 = xToSvg(x0, xMin, xMax);
    const sx1 = xToSvg(x1, xMin, xMax);
    const baseY = PAD_T + PLOT_H;
    const pts: string[] = [`M${sx0.toFixed(2)},${baseY.toFixed(2)}`];
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (i / steps) * (x1 - x0);
      const y = distType === "normal" ? normalPDF(x, normalMu, normalSigma) : expPDF(x, expLambda);
      const sx = xToSvg(x, xMin, xMax);
      const sy = yToSvg(y, pdfMax);
      pts.push(`L${sx.toFixed(2)},${sy.toFixed(2)}`);
    }
    pts.push(`L${sx1.toFixed(2)},${baseY.toFixed(2)}`);
    pts.push("Z");
    return pts.join(" ");
  };

  // ─── 拖拽回调 ───────────────────────────────────────────────
  const handleDragX = useCallback(
    (svgX: number) => {
      const x = clampX(svgToX(svgX, xMin, xMax));
      if (distType === "binomial") {
        setXVal(Math.round(clamp(x, 0, binomN)));
      } else {
        setXVal(x);
      }
    },
    [xMin, xMax, distType, binomN, clampX, setXVal]
  );

  const handleDragA = useCallback(
    (svgX: number) => {
      const x = clampX(svgToX(svgX, xMin, xMax));
      if (distType === "binomial") {
        setAVal(Math.round(clamp(x, 0, binomN)));
      } else {
        setAVal(x);
      }
    },
    [xMin, xMax, distType, binomN, clampX, setAVal]
  );

  const handleDragB = useCallback(
    (svgX: number) => {
      const x = clampX(svgToX(svgX, xMin, xMax));
      if (distType === "binomial") {
        setBVal(Math.round(clamp(x, 0, binomN)));
      } else {
        setBVal(x);
      }
    },
    [xMin, xMax, distType, binomN, clampX, setBVal]
  );

  const dragX = useDrag(handleDragX, svgRef);
  const dragA = useDrag(handleDragA, svgRef);
  const dragB = useDrag(handleDragB, svgRef);

  // ─── 分布切换时重置滑块 ──────────────────────────────────────
  const switchDist = (d: DistType) => {
    setDistType(d);
    if (d === "binomial") { setXVal(4); setAVal(2); setBVal(6); }
    else if (d === "normal") { setXVal(0); setAVal(-1); setBVal(1); }
    else { setXVal(1); setAVal(0.5); setBVal(2); }
  };

  // ─── 计算关键数值 ─────────────────────────────────────────────
  const fxVal = getCDF(xVal);
  const intervalProb = getIntervalProb(aVal, bVal);
  const loAB = Math.min(aVal, bVal);
  const hiAB = Math.max(aVal, bVal);

  // ─── 离散分布（二项）bars ──────────────────────────────────────
  const binomBars = (() => {
    if (distType !== "binomial") return [];
    const bars = [];
    const barW = (PLOT_W / (binomN + 1)) * 0.6;
    for (let k = 0; k <= binomN; k++) {
      const p = binomPMF(k, binomN, binomP);
      const sx = xToSvg(k, xMin, xMax);
      const sy = yToSvg(p, pdfMax);
      const barH = (PAD_T + PLOT_H) - sy;
      let fill = LINE;
      if (!showInterval) {
        fill = k <= Math.floor(xVal) ? ACCENT : LINE;
      } else {
        const lo = Math.min(Math.round(aVal), Math.round(bVal));
        const hi = Math.max(Math.round(aVal), Math.round(bVal));
        fill = k >= lo && k <= hi ? ORANGE : LINE;
      }
      bars.push({ k, sx, sy, barH, barW, fill, p });
    }
    return bars;
  })();

  // ─── 离散 CDF 阶梯路径 ──────────────────────────────────────
  const buildBinomCDFPath = (): string => {
    const pts: string[] = [];
    let cdf = 0;
    const baseY = yToSvg(0, 1);
    // 从左边界开始
    pts.push(`M${PAD_L.toFixed(2)},${baseY.toFixed(2)}`);
    for (let k = 0; k <= binomN; k++) {
      const sx = xToSvg(k, xMin, xMax);
      const prevCdf = cdf;
      cdf += binomPMF(k, binomN, binomP);
      // 水平线到当前 k
      pts.push(`L${sx.toFixed(2)},${yToSvg(prevCdf, 1).toFixed(2)}`);
      // 垂直跳跃
      pts.push(`L${sx.toFixed(2)},${yToSvg(cdf, 1).toFixed(2)}`);
    }
    // 延伸到右边界
    pts.push(`L${(PAD_L + PLOT_W).toFixed(2)},${yToSvg(1, 1).toFixed(2)}`);
    return pts.join(" ");
  };

  // ─── SVG x 坐标 ─────────────────────────────────────────────
  const xSvg = xToSvg(distType === "binomial" ? xVal : xVal, xMin, xMax);
  const aSvg = xToSvg(aVal, xMin, xMax);
  const bSvg = xToSvg(bVal, xMin, xMax);

  // x 轴刻度
  const xTicks = (() => {
    if (distType === "binomial") {
      return Array.from({ length: binomN + 1 }, (_, i) => i);
    }
    const count = 7;
    return Array.from({ length: count }, (_, i) => xMin + (i / (count - 1)) * (xMax - xMin));
  })();

  // y 轴刻度（PDF 视图）
  const yTicksPDF = [0, 0.25, 0.5, 0.75, 1].map((r) => r * pdfMax).filter((v) => v <= pdfMax);

  // ─── 分布名称 ───────────────────────────────────────────────
  const distName =
    distType === "binomial"
      ? `B(${binomN}, ${binomP})`
      : distType === "normal"
      ? `N(${normalMu}, ${normalSigma}²)`
      : `Exp(${expLambda})`;

  // ─── CDF 视图 y 轴 ───────────────────────────────────────────
  const yTicksCDF = [0, 0.25, 0.5, 0.75, 1];

  const baseLineY = PAD_T + PLOT_H;

  // ─── CDF 视图中 F(x) 的竖线和 point-in-CDF 标记 ────────────
  const fxSvgY_cdf = yToSvg(fxVal, 1);
  return { switchDist, fxVal, intervalProb, loAB, getCDF, hiAB, distName, svgRef, viewMode, yTicksPDF, pdfMax, distType, showInterval, buildFillPath, xVal, buildIntervalFillPath, aVal, bVal, buildPDFPath, binomBars, baseLineY, xSvg, dragX, aSvg, dragA, bSvg, dragB, yTicksCDF, buildCDFPath, buildBinomCDFPath, fxSvgY_cdf, xMin, xMax, xTicks };
}
export type CdfScene = ReturnType<typeof useCdfScene>;
