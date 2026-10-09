// "The Past": a hand-drawn study desk at dusk. Pure SVG, animated as a function of time.
import { svg, el, setAttrs, rng, lerp, clamp, seg, E, ease, track, gradientAt, noise1, ev, W, H } from "./core.js";

const INK = "#2a2119";
const PAPER = "#efe5cf";

// ---- rough (hand-drawn) geometry --------------------------------------------------------
function roughLine(x1, y1, x2, y2, r, amt = 1.6) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const o = (k) => (r() - 0.5) * 2 * amt * k;
  const ox = dx / len * (r() * 3), oy = dy / len * (r() * 3); // overshoot
  const mx = x1 + dx * (0.45 + r() * 0.1) + nx * o(1.6), my = y1 + dy * (0.45 + r() * 0.1) + ny * o(1.6);
  return `M${(x1 + o(1)).toFixed(1)},${(y1 + o(1)).toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${(x2 + ox + o(1)).toFixed(1)},${(y2 + oy + o(1)).toFixed(1)}`;
}
function roughRectD(x, y, w, h, r, amt) {
  return [roughLine(x, y, x + w, y, r, amt), roughLine(x + w, y, x + w, y + h, r, amt),
    roughLine(x + w, y + h, x, y + h, r, amt), roughLine(x, y + h, x, y, r, amt)].join(" ");
}
function catmull(pts, closed) {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
function roughEllipseD(cx, cy, rx, ry, r, amt = 0.03, overshoot = 0.25) {
  const pts = []; const a0 = r() * Math.PI * 2; const N = 14;
  for (let i = 0; i <= N * (1 + overshoot); i++) {
    const a = a0 + (i / N) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * 2 * amt;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return catmull(pts, false);
}
// Stroke with a faint "second pass" like a real pencil sketch.
function sketch(parent, d, { w = 2.6, color = INK, fill = "none", ghost = true, cls, op = 1 } = {}) {
  const g = svg("g", { opacity: op }, parent);
  const main = svg("path", { d, fill, stroke: color, "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round", pathLength: 1 }, g);
  let gh = null;
  if (ghost) gh = svg("path", { d, fill: "none", stroke: color, "stroke-width": w * 0.45, opacity: 0.45, transform: "translate(1.4,-1.1)", "stroke-linecap": "round", pathLength: 1 }, g);
  if (cls) g.setAttribute("class", cls);
  return { g, paths: gh ? [main, gh] : [main] };
}
function drawOn(item, p) {
  for (const path of item.paths) {
    path.style.strokeDasharray = "1 1";
    path.style.strokeDashoffset = String(1 - clamp(p));
  }
}

// ---- schedule --------------------------------------------------------------------------
const STACK_A = [
  { title: "系统解剖学", color: "#8a3b3b", h: 66, w: 430, t: 0 },
  { title: "组织学与胚胎学", color: "#4f6b58", h: 60, w: 410, t: 0 },
  { title: "生物化学与分子生物学", color: "#3d4f73", h: 70, w: 450, t: 0 },
  { title: "医学细胞生物学", color: "#c9a24a", h: 58, w: 400, t: 8.0 },
  { title: "生理学", color: "#3f7373", h: 60, w: 420, t: 9.0 },
];
const STACK_B = [
  { title: "病理生理学", color: "#c9694a", h: 50, w: 300, t: 11.6 },
  { title: "医学统计学", color: "#5b4f7a", h: 46, w: 290, t: 12.1 },
  { title: "内科学", color: "#7a5b3b", h: 56, w: 310, t: 12.6 },
  { title: "诊断学", color: "#3b6a7a", h: 48, w: 296, t: 13.1 },
];
export const NOTES = [
  { t: 6.1, x: 560, y: 118, w: 250, h: 150, rot: -4, color: "#f6e27a", lines: ["组胚 · 第15章", "胰岛 B 细胞"] },
  { t: 7.1, x: 850, y: 96, w: 270, h: 150, rot: 3, color: "#f7b9a8", lines: ["生化 · 第8章", "酮体生成 p.177"] },
  { t: 8.1, x: 640, y: 318, w: 250, h: 150, rot: 2.5, color: "#bfe3c9", lines: ["生化 · 第7章", "糖异生 ??"] },
  { t: 9.1, x: 940, y: 300, w: 250, h: 150, rot: -3, color: "#bcd4f5", lines: ["系解 · 胰", "在哪一页？"] },
];
// Page flip schedule (continuous across the past act and the split-screen left pane)
export const FLIPS = (() => {
  const out = []; let t = 5.0;
  while (t < 24.2) {
    const k = seg(t, 5.0, 13.6);
    const iv = t < 15 ? lerp(0.95, 0.17, Math.pow(k, 1.25)) : 0.26;
    const dur = Math.min(0.62, iv * 0.92);
    out.push({ t, dur });
    t += iv;
  }
  return out;
})();
// Past-time clock (minutes since 00:00) — 14:00 → 21:47, accelerating
export function pastMinutes(t) {
  if (t < 15) return lerp(14 * 60, 21 * 60 + 47, E.inQuad(seg(t, 4.0, 14.6)));
  return 21 * 60 + 47 + (t - 15) * 9; // keeps creeping during split-screen
}
export function pagesFlipped(t) { let n = 0; for (const f of FLIPS) if (f.t <= t) n++; return Math.round(n * 14.3); }

// ---- scene -----------------------------------------------------------------------------
export class PastScene {
  constructor(parent, { id = "past", variant = "past" } = {}) {
    this.variant = variant;
    this.root = el("div", { class: "layer", id }, parent);
    this.svg = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, this.root);
    const defs = svg("defs", {}, this.svg);
    // boiling-line filter
    this.filt = svg("filter", { id: `${id}-wob`, x: "-5%", y: "-5%", width: "110%", height: "110%" }, defs);
    this.turb = svg("feTurbulence", { type: "fractalNoise", baseFrequency: "0.018", numOctaves: "2", seed: "1", result: "n" }, this.filt);
    svg("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "3.2", xChannelSelector: "R", yChannelSelector: "G" }, this.filt);
    // sky gradient
    this.sky = svg("linearGradient", { id: `${id}-sky`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    this.skyA = svg("stop", { offset: "0" }, this.sky);
    this.skyB = svg("stop", { offset: "1" }, this.sky);
    const sunG = svg("radialGradient", { id: `${id}-sun` }, defs);
    this.sunA = svg("stop", { offset: "0" }, sunG); this.sunB = svg("stop", { offset: "1", "stop-opacity": 0 }, sunG);
    const lampG = svg("radialGradient", { id: `${id}-lamp`, cx: "0.5", cy: "0.1", r: "0.9" }, defs);
    svg("stop", { offset: "0", "stop-color": "#ffd98a", "stop-opacity": "0.95" }, lampG);
    svg("stop", { offset: "0.5", "stop-color": "#ffb85a", "stop-opacity": "0.35" }, lampG);
    svg("stop", { offset: "1", "stop-color": "#ff9a3c", "stop-opacity": "0" }, lampG);
    const pageG = svg("linearGradient", { id: `${id}-pg`, x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    svg("stop", { offset: "0", "stop-color": "#d9ccb0" }, pageG); svg("stop", { offset: "0.25", "stop-color": "#f5eddc" }, pageG); svg("stop", { offset: "1", "stop-color": "#efe5cf" }, pageG);
    const clip = svg("clipPath", { id: `${id}-win` }, defs);
    svg("rect", { x: 1296, y: 126, width: 408, height: 378 }, clip);

    this.cam = svg("g", {}, this.svg);
    // paper
    svg("image", { href: "assets/paper.jpg", x: -700, y: -420, width: 3320, height: 1915, preserveAspectRatio: "none" }, this.cam);
    this.ink = svg("g", { filter: `url(#${id}-wob)` }, this.cam);
    const r = rng(variant === "past" ? 11 : 23);
    this.items = [];
    const add = (item, t0, t1) => { this.items.push({ item, t0, t1 }); return item; };
    const drawBase = variant === "past" ? 4.05 : -10;

    // --- window
    const win = svg("g", {}, this.ink);
    const winInner = svg("g", { "clip-path": `url(#${id}-win)` }, win);
    this.skyRect = svg("rect", { x: 1290, y: 120, width: 420, height: 390, fill: `url(#${id}-sky)` }, winInner);
    this.stars = svg("g", {}, winInner);
    for (let i = 0; i < 22; i++) {
      const sx = 1310 + r() * 380, sy = 140 + r() * 220, s = 2 + r() * 3;
      svg("path", { d: `M${sx - s},${sy} L${sx + s},${sy} M${sx},${sy - s} L${sx},${sy + s}`, stroke: "#fff6d8", "stroke-width": 1.4 }, this.stars);
    }
    this.sunGlow = svg("circle", { cx: 1500, cy: 250, r: 150, fill: `url(#${id}-sun)` }, winInner);
    this.sun = svg("circle", { cx: 1500, cy: 250, r: 52 }, winInner);
    this.sunRing = sketch(winInner, roughEllipseD(0, 0, 54, 54, r), { w: 2 });
    const hills = sketch(winInner, catmull([[1280, 440], [1360, 400], [1440, 425], [1520, 380], [1610, 410], [1720, 390], [1730, 520], [1280, 520]], true), { fill: "#b7a785", w: 2.2 });
    const hills2 = sketch(winInner, catmull([[1280, 470], [1400, 450], [1500, 470], [1600, 440], [1720, 460], [1730, 520], [1280, 520]], true), { fill: "#8f8266", w: 2 });
    add(hills, drawBase + 0.4, drawBase + 1.0); add(hills2, drawBase + 0.5, drawBase + 1.1);
    for (let i = 0; i < 3; i++) {
      const bx = 1380 + i * 70, by = 200 + (i % 2) * 30;
      add(sketch(winInner, `M${bx},${by} q10,-10 18,0 q8,-10 18,0`, { w: 2 }), drawBase + 0.8 + i * 0.1, drawBase + 1.2 + i * 0.1);
    }
    add(sketch(win, roughRectD(1280, 110, 440, 410, r, 1.6), { w: 4 }), drawBase, drawBase + 0.7);
    add(sketch(win, roughRectD(1296, 126, 408, 378, r, 1.2), { w: 2.4 }), drawBase + 0.1, drawBase + 0.8);
    add(sketch(win, roughLine(1500, 126, 1500, 504, r) + " " + roughLine(1296, 315, 1704, 315, r), { w: 3.2 }), drawBase + 0.3, drawBase + 0.9);
    add(sketch(win, roughLine(1262, 528, 1738, 528, r) + " " + roughLine(1266, 540, 1734, 540, r), { w: 3.4 }), drawBase + 0.2, drawBase + 0.8);
    // curtain hint
    add(sketch(win, catmull([[1276, 100], [1250, 250], [1262, 400], [1240, 560]], false), { w: 2.4 }), drawBase + 0.5, drawBase + 1.1);
    add(sketch(win, catmull([[1744, 100], [1770, 260], [1756, 420], [1780, 560]], false), { w: 2.4 }), drawBase + 0.5, drawBase + 1.1);

    // --- clock
    const ck = svg("g", {}, this.ink);
    const CX = 300, CY = 205, CR = 88;
    this.clockFace = svg("circle", { cx: CX, cy: CY, r: CR, fill: "#f7efdc" }, ck);
    add(sketch(ck, roughEllipseD(CX, CY, CR, CR, r, 0.02), { w: 4 }), drawBase + 0.1, drawBase + 0.8);
    add(sketch(ck, roughEllipseD(CX, CY, CR + 9, CR + 9, r, 0.02, 0.1), { w: 1.8 }), drawBase + 0.2, drawBase + 0.9);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r1 = CR - (i % 3 === 0 ? 18 : 10), r2 = CR - 4;
      add(sketch(ck, roughLine(CX + Math.sin(a) * r1, CY - Math.cos(a) * r1, CX + Math.sin(a) * r2, CY - Math.cos(a) * r2, r, 0.6), { w: i % 3 === 0 ? 3.4 : 2, ghost: false }), drawBase + 0.4 + i * 0.03, drawBase + 0.7 + i * 0.03);
    }
    this.hourHand = svg("path", { d: `M${CX},${CY + 8} L${CX},${CY - 46}`, stroke: INK, "stroke-width": 6, "stroke-linecap": "round" }, ck);
    this.minHand = svg("path", { d: `M${CX},${CY + 12} L${CX},${CY - 70}`, stroke: INK, "stroke-width": 3.6, "stroke-linecap": "round" }, ck);
    this.minGhost = svg("g", { opacity: 0.35 }, ck);
    this.minGhosts = [0, 1, 2, 3].map(() => svg("path", { d: `M${CX},${CY + 12} L${CX},${CY - 70}`, stroke: INK, "stroke-width": 2.4, "stroke-linecap": "round" }, this.minGhost));
    svg("circle", { cx: CX, cy: CY, r: 6, fill: INK }, ck);
    this.clockC = [CX, CY];

    // --- desk
    this.deskLine = add(sketch(this.ink, roughLine(-600, 770, 2520, 770, r, 1.2), { w: 4.2 }), -99, -98);
    add(sketch(this.ink, roughLine(-600, 792, 2520, 790, r, 1.2), { w: 2 }), drawBase, drawBase + 0.6);
    const hatch = svg("g", { opacity: 0.5 }, this.ink);
    for (let x = -560; x < 2500; x += 26) add(sketch(hatch, roughLine(x, 806, x - 34, 860, r, 0.6), { w: 1.4, ghost: false }), drawBase + 0.2 + (x + 560) / 3000 * 0.6, drawBase + 0.5 + (x + 560) / 3000 * 0.6);

    // --- lamp
    const lamp = svg("g", {}, this.ink);
    this.lampLight = svg("g", { opacity: 0 }, this.cam); // drawn above night overlay later (moved in render order)
    add(sketch(lamp, roughEllipseD(1800, 766, 70, 12, r), { w: 3, fill: "#6b5a44" }), drawBase + 0.3, drawBase + 0.9);
    add(sketch(lamp, roughLine(1800, 760, 1772, 598, r) + " " + roughLine(1772, 598, 1702, 528, r), { w: 5 }), drawBase + 0.4, drawBase + 1.0);
    add(sketch(lamp, roughEllipseD(1772, 598, 9, 9, r), { w: 3, fill: "#6b5a44" }), drawBase + 0.5, drawBase + 1.0);
    add(sketch(lamp, `M1690,512 L1720,540 L1684,636 Q1636,628 1610,588 Z`, { w: 3.2, fill: "#3d4f73" }), drawBase + 0.5, drawBase + 1.1);

    // --- stacks
    this.books = [];
    const mkBook = (b, x, baseY) => {
      const g = svg("g", {}, this.ink);
      const inner = svg("g", {}, g);
      const tilt = (r() - 0.5) * 2.2;
      const dx = (r() - 0.5) * 30;
      svg("rect", { x: x + dx, y: baseY - b.h, width: b.w, height: b.h, rx: 6, fill: b.color }, inner);
      svg("rect", { x: x + dx + 8, y: baseY - b.h + 7, width: b.w - 16, height: 5, fill: "#000", opacity: 0.12 }, inner);
      svg("rect", { x: x + dx + b.w - 40, y: baseY - b.h, width: 12, height: b.h, fill: "#fff", opacity: 0.13 }, inner);
      const outline = sketch(inner, roughRectD(x + dx, baseY - b.h, b.w, b.h, r, 1.1), { w: 3 });
      const tx = svg("text", { x: x + dx + 22, y: baseY - b.h / 2 + 13, fill: "#f6ecd6", "font-family": "Long Cang, cursive", "font-size": Math.min(36, b.h * 0.64), text: b.title }, inner);
      inner.setAttribute("transform", `rotate(${tilt} ${x + dx + b.w / 2} ${baseY - b.h / 2})`);
      return { g, outline, b, x: x + dx, y: baseY - b.h, tx };
    };
    const stack = (arr, x, keep) => {
      let y = 770;
      for (const b of arr) {
        if (variant !== "past" && !keep.includes(b.title)) continue;
        const bk = mkBook(b, x + (arr === STACK_B ? 0 : 0), y);
        bk.t = b.t;
        this.books.push(bk);
        y -= b.h - 1;
      }
    };
    stack(STACK_A, 110, ["系统解剖学", "组织学与胚胎学", "生物化学与分子生物学"]);
    stack(STACK_B, 1290, []);

    // --- open book (past) or laptop (finale)
    this.openBook = svg("g", {}, this.ink);
    if (variant === "past") {
      svg("path", { d: "M980,772 C900,748 800,752 718,766 L718,604 C800,590 900,590 980,612 Z", fill: `url(#${id}-pg)` }, this.openBook);
      svg("path", { d: "M980,772 C1060,748 1160,752 1242,766 L1242,604 C1160,590 1060,590 980,612 Z", fill: "#f5eddc" }, this.openBook);
      add(sketch(this.openBook, "M980,772 C900,748 800,752 718,766 L718,604 C800,590 900,590 980,612 Z", { w: 3 }), drawBase + 0.3, drawBase + 1.0);
      add(sketch(this.openBook, "M980,772 C1060,748 1160,752 1242,766 L1242,604 C1160,590 1060,590 980,612 Z", { w: 3 }), drawBase + 0.35, drawBase + 1.05);
      add(sketch(this.openBook, "M712,774 C800,760 900,758 980,782 C1060,758 1160,760 1248,774", { w: 2.4 }), drawBase + 0.5, drawBase + 1.1);
      for (let i = 0; i < 7; i++) {
        const y = 624 + i * 18; const L = 150 + r() * 70;
        add(sketch(this.openBook, roughLine(746, y + 2, 746 + L, y - 4 + r() * 3, r, 0.8), { w: 1.6, ghost: false, op: 0.55 }), drawBase + 0.6 + i * 0.04, drawBase + 0.9 + i * 0.04);
        add(sketch(this.openBook, roughLine(1004, y - 4, 1004 + L, y + 1, r, 0.8), { w: 1.6, ghost: false, op: 0.55 }), drawBase + 0.62 + i * 0.04, drawBase + 0.92 + i * 0.04);
      }
      // tiny cell diagram on the left page
      add(sketch(this.openBook, roughEllipseD(830, 740 - 16, 34, 14, r), { w: 1.8, op: 0.7 }), drawBase + 0.9, drawBase + 1.2);
      add(sketch(this.openBook, roughEllipseD(832, 724, 9, 5, r), { w: 1.6, op: 0.7 }), drawBase + 1.0, drawBase + 1.2);
      this.flipG = svg("g", {}, this.openBook);
      this.flipPath = svg("path", { fill: "#f3ead6", stroke: INK, "stroke-width": 2.8, "stroke-linejoin": "round" }, this.flipG);
      this.flipLines = [0, 1, 2, 3, 4, 5].map(() => svg("path", { stroke: INK, "stroke-width": 1.4, opacity: 0.45, "stroke-linecap": "round" }, this.flipG));
    } else {
      // laptop, closed book, mug
      const lp = svg("g", {}, this.openBook);
      svg("path", { d: "M800,560 L1160,560 L1170,748 L790,748 Z", fill: "#27324a" }, lp);
      this.laptopImg = svg("image", { href: "assets/lo/agent-done.jpg", x: 808, y: 572, width: 344, height: 166, preserveAspectRatio: "xMidYMid slice" }, lp);
      sketch(lp, "M800,560 L1160,560 L1170,748 L790,748 Z", { w: 3.4 });
      sketch(lp, "M740,748 L1220,748 L1250,772 L710,772 Z", { w: 3.2, fill: "#c9bfae" });
      this.laptopGlow = svg("ellipse", { cx: 980, cy: 700, rx: 330, ry: 120, fill: "#8ab4ff", opacity: 0.18 }, lp);
      const mug = svg("g", {}, this.openBook);
      sketch(mug, "M1310,690 L1318,768 L1382,768 L1390,690 Z", { w: 3, fill: "#c9694a" });
      sketch(mug, roughEllipseD(1398, 722, 22, 20, r), { w: 3 });
      for (let i = 0; i < 3; i++) sketch(mug, catmull([[1330 + i * 20, 676], [1322 + i * 20, 650], [1336 + i * 20, 626], [1328 + i * 20, 600]], false), { w: 2, op: 0.5 });
      const note = svg("g", { transform: "rotate(-4 700 250)" }, this.openBook);
      svg("rect", { x: 600, y: 170, width: 260, height: 150, fill: "#bfe3c9" }, note);
      sketch(note, roughRectD(600, 170, 260, 150, r, 1), { w: 2.4 });
      svg("text", { x: 626, y: 236, "font-family": "Long Cang, cursive", "font-size": 42, fill: INK, text: "✓ 酮体 · 已理解" }, note);
      svg("text", { x: 626, y: 290, "font-family": "Long Cang, cursive", "font-size": 34, fill: "#3d4f73", text: "17:20 · 今日完成" }, note);
    }

    // --- sticky notes + scribbles (past only)
    this.notes = [];
    if (variant === "past") {
      for (const n of NOTES) {
        const g = svg("g", {}, this.ink);
        const shadow = svg("rect", { x: n.x + 6, y: n.y + 8, width: n.w, height: n.h, fill: "#000", opacity: 0.12 }, g);
        svg("rect", { x: n.x, y: n.y, width: n.w, height: n.h, fill: n.color }, g);
        const o = sketch(g, roughRectD(n.x, n.y, n.w, n.h, r, 1), { w: 2.4 });
        svg("path", { d: `M${n.x + n.w / 2 - 30},${n.y - 8} l60,0 l0,22 l-60,0 z`, fill: "#e8dcc0", opacity: 0.8 }, g); // tape
        const clipId = `${id}-nc${this.notes.length}`;
        const cp = svg("clipPath", { id: clipId }, defs);
        const cr = svg("rect", { x: n.x, y: n.y, width: 0, height: n.h }, cp);
        const tg = svg("g", { "clip-path": `url(#${clipId})` }, g);
        n.lines.forEach((ln, i) => svg("text", { x: n.x + 20, y: n.y + 58 + i * 52, "font-family": "Long Cang, cursive", "font-size": i === 0 ? 40 : 44, fill: i === 0 ? "#3d4f73" : INK, text: ln }, tg));
        this.notes.push({ g, n, cr, o, shadow });
      }
      // connecting arrows (the student's attempt)
      this.arrows = [
        { t: 9.6, d: catmull([[810, 200], [835, 180], [852, 170]], false) },
        { t: 9.8, d: catmull([[760, 268], [740, 300], [748, 318]], false) },
        { t: 10.0, d: catmull([[892, 380], [915, 372], [940, 372]], false) },
        { t: 10.15, d: catmull([[1000, 246], [1030, 270], [1050, 300]], false) },
      ].map((a) => { const s = sketch(this.ink, a.d, { w: 3.2, color: "#b23a2e" }); return { ...a, s }; });
      this.qMark = sketch(this.ink, "M905,205 C900,150 985,128 1004,178 C1020,222 956,236 952,282 M951,318 L952,326", { w: 10, color: "#b23a2e" });
      this.cross = sketch(this.ink, "M660,440 L870,420 M668,420 L862,448 M676,452 L858,432", { w: 3, color: "#b23a2e" });
    }

    // night + lamp light (above ink)
    this.night = svg("rect", { x: -700, y: -420, width: 3320, height: 1915, fill: "#10163a", opacity: 0, style: "mix-blend-mode:multiply" }, this.cam);
    this.cam.appendChild(this.lampLight);
    svg("path", { d: "M1612,592 L1684,634 L1790,790 L1330,800 Z", fill: `url(#${id}-lamp)`, style: "mix-blend-mode:screen" }, this.lampLight);
    svg("ellipse", { cx: 1560, cy: 772, rx: 420, ry: 60, fill: "#ffcf7a", opacity: 0.35, style: "mix-blend-mode:screen" }, this.lampLight);
    svg("ellipse", { cx: 1648, cy: 614, rx: 44, ry: 20, fill: "#fff1c4", opacity: 0.9, style: "mix-blend-mode:screen", filter: "blur(5px)", transform: "rotate(32 1648 614)" }, this.lampLight);
    this.warm = svg("rect", { x: -700, y: -420, width: 3320, height: 1915, fill: "#ffb45a", opacity: 0, style: "mix-blend-mode:soft-light" }, this.cam);

    // record sound events once
    if (variant === "past") {
      for (const f of FLIPS) ev(f.t, "flip", { pane: f.t < 15 ? "full" : "left" });
      for (const b of [...STACK_A, ...STACK_B]) if (b.t > 0) ev(b.t + 0.3, "thud");
      for (const n of NOTES) { ev(n.t, "stick"); ev(n.t + 0.25, "scribble", { dur: 0.6 }); }
      ev(9.6, "scribble", { dur: 0.8 }); ev(10.35, "scribble", { dur: 0.5 });
      ev(14.1, "lampclick");
    }
  }

  // camera: {cx, cy, s, rot, sx, sy} — sx,sy = screen position of focus point
  setCamera({ cx, cy, s, rot = 0, sx = W / 2, sy = H / 2 }) {
    this.cam.setAttribute("transform", `translate(${sx.toFixed(2)},${sy.toFixed(2)}) rotate(${rot.toFixed(3)}) scale(${s.toFixed(4)}) translate(${(-cx).toFixed(2)},${(-cy).toFixed(2)})`);
  }

  render(t, { frame = 0, deskP = 1, drawShift = 0 } = {}) {
    // hand-drawn boil: new displacement seed every 5 frames (12 fps "on twos-and-a-half")
    this.turb.setAttribute("seed", String(1 + Math.floor(frame / 5) % 7));
    const td = t + drawShift;
    for (const { item, t0, t1 } of this.items) drawOn(item, t0 < -50 ? deskP : ease(td, t0, t1, E.outCubic));

    const past = this.variant === "past";
    // sky + sun
    const skyP = past ? E.inOutQuad(seg(t, 4.0, 14.2)) : 0.42;
    const top = gradientAt([[0, "#f4e3a6"], [0.45, "#f0a760"], [0.7, "#b8567a"], [0.86, "#3a2d5c"], [1, "#161b3d"]], skyP);
    const bot = gradientAt([[0, "#fbf0cf"], [0.45, "#f8cf86"], [0.7, "#ee8a5c"], [0.86, "#7a4a6a"], [1, "#2e2c55"]], skyP);
    this.skyA.setAttribute("stop-color", top); this.skyB.setAttribute("stop-color", bot);
    const sunY = lerp(215, 585, E.inQuad(skyP));
    const sunCol = gradientAt([[0, "#fff4c2"], [0.5, "#ffc35a"], [0.8, "#ff7a4a"], [1, "#d8453a"]], skyP);
    setAttrs(this.sun, { cy: sunY, fill: sunCol });
    setAttrs(this.sunGlow, { cy: sunY, r: 170 + 40 * skyP });
    this.sunA.setAttribute("stop-color", sunCol); this.sunA.setAttribute("stop-opacity", String(0.75 - 0.3 * skyP));
    this.sunRing.g.setAttribute("transform", `translate(1500,${sunY})`);
    this.stars.setAttribute("opacity", String(clamp((skyP - 0.82) / 0.18)));

    // clock
    const mins = past ? pastMinutes(t) : 17 * 60 + 20 + (t - 47) * 1.5;
    const [CX, CY] = this.clockC;
    const ha = ((mins / 60) % 12) / 12 * 360, ma = (mins % 60) / 60 * 360;
    this.hourHand.setAttribute("transform", `rotate(${ha} ${CX} ${CY})`);
    this.minHand.setAttribute("transform", `rotate(${ma} ${CX} ${CY})`);
    const spin = past ? (pastMinutes(t + 1 / 60) - mins) * 6 : 0; // degrees per frame
    this.minGhosts.forEach((g, i) => { g.setAttribute("transform", `rotate(${ma - spin * (i + 1) * 0.5} ${CX} ${CY})`); g.setAttribute("opacity", String(clamp(spin / 40) * (1 - i * 0.22))); });

    // books dropping in
    for (const bk of this.books) {
      if (!bk.t) { bk.g.style.display = ""; bk.g.removeAttribute("transform"); continue; }
      const p = seg(t, bk.t, bk.t + 0.32);
      bk.g.style.display = t < bk.t ? "none" : "";
      const bounce = p < 1 ? -420 * Math.pow(1 - E.inQuad(p), 1) : 0;
      const settle = t > bk.t + 0.32 ? Math.sin((t - bk.t - 0.32) * 40) * 6 * Math.exp(-(t - bk.t - 0.32) * 14) : 0;
      bk.g.setAttribute("transform", `translate(0,${(bounce + settle).toFixed(1)})`);
    }

    if (past) {
      // notes
      for (const nt of this.notes) {
        const { n } = nt;
        const p = seg(t, n.t, n.t + 0.28);
        nt.g.style.display = t < n.t ? "none" : "";
        const sc = lerp(0.55, 1, E.outBack(p));
        nt.g.setAttribute("transform", `rotate(${n.rot + (1 - p) * 12} ${n.x + n.w / 2} ${n.y + n.h / 2}) translate(${n.x + n.w / 2},${n.y + n.h / 2}) scale(${sc}) translate(${-(n.x + n.w / 2)},${-(n.y + n.h / 2)})`);
        nt.cr.setAttribute("width", String(n.w * ease(t, n.t + 0.2, n.t + 0.85, E.outQuad)));
        drawOn(nt.o, ease(t, n.t, n.t + 0.3));
      }
      for (const a of this.arrows) drawOn(a.s, ease(t, a.t, a.t + 0.3, E.outCubic));
      drawOn(this.qMark, ease(t, 10.35, 10.75, E.outQuad));
      drawOn(this.cross, ease(t, 11.0, 11.35, E.outCubic));

      // page flips
      let active = null;
      for (const f of FLIPS) if (t >= f.t && t < f.t + f.dur) active = { f, p: (t - f.t) / f.dur };
      if (active) {
        this.flipG.style.display = "";
        const th = Math.PI * E.inOutQuad(active.p);
        const xe = 980 + 262 * Math.cos(th), lift = 86 * Math.sin(th);
        const topY = 604 - lift, botY = 766 - lift * 0.55;
        const bend = 40 * Math.sin(th);
        const d = `M980,612 Q${(980 + (xe - 980) * 0.5).toFixed(1)},${(596 - lift * 1.1 - bend * 0.3).toFixed(1)} ${xe.toFixed(1)},${topY.toFixed(1)} L${xe.toFixed(1)},${botY.toFixed(1)} Q${(980 + (xe - 980) * 0.5).toFixed(1)},${(752 - lift * 0.7).toFixed(1)} 980,772 Z`;
        this.flipPath.setAttribute("d", d);
        const shade = 0.72 + 0.28 * Math.abs(Math.cos(th));
        this.flipPath.setAttribute("fill", `rgb(${Math.round(243 * shade)},${Math.round(234 * shade)},${Math.round(214 * shade)})`);
        const vis = Math.abs(Math.cos(th)) > 0.25 ? 0.45 * Math.abs(Math.cos(th)) : 0;
        this.flipLines.forEach((ln, i) => {
          const v = 0.12 + i * 0.13;
          const x0 = lerp(980, xe, 0.12), x1 = lerp(980, xe, 0.8);
          const yA = lerp(612, 772, v) , yB = lerp(topY, botY, v);
          const y0 = lerp(yA, yB, 0.12) - Math.sin(th) * 6, y1 = lerp(yA, yB, 0.8);
          ln.setAttribute("d", `M${x0.toFixed(1)},${y0.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)}`);
          ln.setAttribute("opacity", String(vis));
        });
      } else this.flipG.style.display = "none";

      // night & lamp
      const nightP = ease(t, 10.2, 14.4, E.inOutQuad);
      this.night.setAttribute("opacity", String(0.62 * nightP));
      const lamp = t >= 14.1 ? (t < 14.16 ? 0.4 : t < 14.2 ? 0.1 : 1) : 0; // flicker on
      this.lampLight.setAttribute("opacity", String(lamp));
      this.warm.setAttribute("opacity", String(lamp * 0.25));
    } else {
      this.night.setAttribute("opacity", "0");
      this.lampLight.setAttribute("opacity", "0");
      this.warm.setAttribute("opacity", "0.28");
    }
  }
}

// Main camera path for Act II (full-screen past)
const SHOTS = [
  // [t0, t1, cx, cy, s0, s1, rot]
  [3.6, 6.0, 960, 560, 1.0, 1.06, 0],
  [6.0, 7.0, 985, 690, 2.05, 2.2, -0.6],
  [7.0, 8.0, 300, 215, 2.5, 2.65, 0.8],
  [8.0, 9.5, 860, 300, 1.45, 1.55, -0.3],
  [9.5, 10.5, 900, 280, 1.85, 1.95, 0.4],
  [10.5, 11.5, 1500, 330, 2.0, 2.18, -0.5],
  [11.5, 12.5, 820, 560, 1.18, 1.24, 0.2],
  [12.5, 12.75, 985, 690, 2.3, 2.36, 0.6],
  [12.75, 13.0, 300, 215, 2.7, 2.78, -0.8],
  [13.0, 13.25, 1500, 380, 2.25, 2.32, 0.4],
  [13.25, 13.5, 1440, 620, 1.9, 1.97, -0.5],
  [13.5, 15.4, 960, 540, 1.16, 0.98, 0],
];
export const PAST_CUTS = SHOTS.slice(1).map((s) => s[0]);
export function pastCamera(t) {
  let sh = SHOTS[0];
  for (const s of SHOTS) if (t >= s[0]) sh = s;
  const p = seg(t, sh[0], sh[1]);
  const pe = sh === SHOTS[SHOTS.length - 1] ? E.inOutCubic(p) : E.outQuad(p);
  let s = lerp(sh[4], sh[5], pe);
  // shake on book drops
  let shake = 0;
  for (const b of [...STACK_A, ...STACK_B]) if (b.t > 0 && t > b.t + 0.3) shake += 7 * Math.exp(-(t - b.t - 0.3) * 18) * Math.sin((t - b.t) * 70);
  // handheld drift
  const hx = noise1(t * 0.7, 3) * 6, hy = noise1(t * 0.6, 7) * 5;
  return { cx: sh[2] + hx / s, cy: sh[3] + (hy + shake) / s, s, rot: sh[6] + noise1(t * 0.4, 9) * 0.25 };
}
