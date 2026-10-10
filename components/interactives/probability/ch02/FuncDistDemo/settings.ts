import { gaussianSample, normalPdf } from "@/lib/learning/probability/distributions/transformations";
import type { DistKey, DistConfig, TransformKey, TransformConfig } from "@/lib/learning/probability/distributions/transformations";
import { ACCENT, GREEN, ORANGE } from "./appearance";
// ─── 分布配置 ────────────────────────────────────────────────
export const DIST_CONFIGS: Record<DistKey, DistConfig> = {
  normal: {
    label: "标准正态 N(0,1)",
    shortLabel: "N(0,1)",
    sample: () => gaussianSample(),
    pdf: (x: number) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI),
    xMin: -3.5,
    xMax: 3.5,
    color: ACCENT,
  },
  uniform: {
    label: "均匀 U(0,1)",
    shortLabel: "U(0,1)",
    sample: () => Math.random(),
    pdf: (x: number) => (x >= 0 && x <= 1 ? 1 : 0),
    xMin: -0.2,
    xMax: 1.2,
    color: GREEN,
  },
  exponential: {
    label: "指数 Exp(1)",
    shortLabel: "Exp(1)",
    sample: () => -Math.log(1 - Math.random()),
    pdf: (x: number) => (x >= 0 ? Math.exp(-x) : 0),
    xMin: -0.2,
    xMax: 4.5,
    color: ORANGE,
  },
};

export const TRANSFORM_CONFIGS: Record<TransformKey, TransformConfig> = {
  square: {
    label: "Y = X²",
    shortLabel: "X²",
    apply: (x: number) => x * x,
    theoreticalPdf: (y: number, dist: DistKey): number => {
      if (y <= 0) return 0;
      if (dist === "normal") {
        // Y=X²: f_Y(y) = f_X(√y)/(√y) + f_X(-√y)/(√y) = 2·f_X(√y)/(2√y·...)
        // = (1/√y)·φ(√y) where doubled because ±√y
        const sqrtY = Math.sqrt(y);
        return (normalPdf(sqrtY) + normalPdf(-sqrtY)) / (2 * sqrtY);
      }
      if (dist === "uniform") {
        // X~U(0,1): Y=X², f_Y(y)=1/(2√y) for y in [0,1]
        if (y > 1) return 0;
        return 1 / (2 * Math.sqrt(y));
      }
      if (dist === "exponential") {
        // X~Exp(1): Y=X², x=√y, dx/dy=1/(2√y), f_Y(y)=e^{-√y}/(2√y)
        return Math.exp(-Math.sqrt(y)) / (2 * Math.sqrt(y));
      }
      return 0;
    },
    yMin: () => 0,
    yMax: (dist: DistKey) => (dist === "normal" ? 9 : dist === "uniform" ? 1.05 : 16),
    note: "折叠效应：±x 都映射到同一个 y=x²，PDF 是 X 两侧贡献之和除以变换斜率。",
  },
  abs: {
    label: "Y = |X|",
    shortLabel: "|X|",
    apply: (x: number) => Math.abs(x),
    theoreticalPdf: (y: number, dist: DistKey): number => {
      if (y < 0) return 0;
      if (dist === "normal") {
        return 2 * normalPdf(y);
      }
      if (dist === "uniform") {
        // X~U(0,1): |X|=X, so same f_Y(y)=1 for y in [0,1]
        if (y > 1) return 0;
        return 1;
      }
      if (dist === "exponential") {
        // X~Exp(1) >=0: |X|=X
        return Math.exp(-y);
      }
      return 0;
    },
    yMin: () => 0,
    yMax: (dist: DistKey) => (dist === "normal" ? 3.5 : dist === "uniform" ? 1.2 : 4.5),
    note: "绝对值把负半轴「折叠」到正半轴，密度加倍（仅对称分布明显）。",
  },
  linear: {
    label: "Y = 2X + 1",
    shortLabel: "2X+1",
    apply: (x: number) => 2 * x + 1,
    theoreticalPdf: (y: number, dist: DistKey): number => {
      // g(x)=2x+1, g^{-1}(y)=(y-1)/2, |dg^{-1}/dy|=1/2
      const x = (y - 1) / 2;
      return DIST_CONFIGS[dist].pdf(x) / 2;
    },
    yMin: (dist: DistKey) => {
      if (dist === "normal") return -6;
      if (dist === "uniform") return 0.8;
      return 0.8;
    },
    yMax: (dist: DistKey) => {
      if (dist === "normal") return 8;
      if (dist === "uniform") return 3.2;
      return 10;
    },
    note: "线性变换 Y=aX+b：PDF 形状不变，水平拉伸 a 倍，纵向压缩 1/a，保证面积=1。",
  },
  exp: {
    label: "Y = eˣ",
    shortLabel: "eˣ",
    apply: (x: number) => Math.exp(x),
    theoreticalPdf: (y: number, dist: DistKey): number => {
      if (y <= 0) return 0;
      // g(x)=e^x, g^{-1}(y)=ln(y), |dg^{-1}/dy|=1/y
      const x = Math.log(y);
      return DIST_CONFIGS[dist].pdf(x) / y;
    },
    yMin: (dist: DistKey) => (dist === "exponential" ? 0 : 0),
    yMax: (dist: DistKey) => {
      if (dist === "normal") return 8;
      if (dist === "uniform") return Math.E + 0.2;
      return 6;
    },
    note: "指数变换 Y=eˣ：将 X 拉伸到正半轴，产生「对数正态」等分布，右尾变厚。",
  },
};