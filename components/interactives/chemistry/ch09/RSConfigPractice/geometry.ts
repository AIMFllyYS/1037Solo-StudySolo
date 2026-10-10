import type { Config } from "@/lib/learning/chemistry/stereochemistry/configuration";
/* 画一段表示旋转方向的圆弧（顺时针=R / 逆时针=S） */
export function describeArc(cx: number, cy: number, r: number, config: Config): string {
  // 起点顶部(a)附近，终点左下(c)附近；sweep 标志区分顺/逆时针
  const startAngle = -90; // a 在正上方
  const endAngle = config === "R" ? 130 : -310; // R 顺时针绕到右下/左下；S 反向
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const sweepFlag = config === "R" ? 1 : 0;
  const largeArcFlag = 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
}

function polar(cx: number, cy: number, r: number, angleDeg: number): {
  x: number;
  y: number;
} {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}