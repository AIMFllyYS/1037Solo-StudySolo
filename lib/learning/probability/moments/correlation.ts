// ─── 类型 ─────────────────────────────────────────────────────────────────────
export interface Point {
  x: number;
  y: number;
}

export type Mode = "normal" | "uncorr-dependent";

// ─── Box-Muller 变换：生成标准正态随机数 ─────────────────────────────────────
function randNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

// ─── 生成二维正态散点（给定相关系数 rho，n=200 个点）─────────────────────────
export function generateBivariateNormal(rho: number, n: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < n; i++) {
    const z1 = randNormal();
    const z2 = randNormal();
    // X = Z1, Y = rho*Z1 + sqrt(1-rho^2)*Z2
    const x = z1;
    const y = rho * z1 + Math.sqrt(Math.max(0, 1 - rho * rho)) * z2;
    points.push({ x, y });
  }
  return points;
}

// ─── 生成「不相关但不独立」案例：Y = X²，X ~ N(0,1) ─────────────────────────
export function generateUncorrDependent(n: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < n; i++) {
    const x = randNormal() * 1.2;
    const noise = randNormal() * 0.15;
    const y = x * x + noise;
    points.push({ x, y });
  }
  return points;
}

// ─── 计算样本皮尔逊相关系数 ──────────────────────────────────────────────────
export function sampleCorr(pts: Point[]): number {
  const n = pts.length;
  if (n < 2) return 0;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sx2 = 0, sy2 = 0;
  for (const p of pts) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxy += dx * dy;
    sx2 += dx * dx;
    sy2 += dy * dy;
  }
  const denom = Math.sqrt(sx2 * sy2);
  return denom < 1e-10 ? 0 : sxy / denom;
}