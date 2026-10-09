// Act I — a single heartbeat line on black; the question appears; the line becomes the desk.
import { el, svg, clamp, seg, E, ease, lerp, ev, W, H, mixColor } from "./core.js";

export const ECG_Y = 750;
const PEAKS = [657, 1122, 1588];
const HEAD = (t) => lerp(-40, 1960, seg(t, 0.25, 2.4));
function ecgOffset(x) {
  let y = 0;
  for (const c of PEAKS) {
    const d = x - c;
    if (d > -130 && d < -78) y -= 16 * Math.sin(Math.PI * (d + 130) / 52);
    else if (d >= -26 && d < -12) y += 12 * Math.sin(Math.PI * (d + 26) / 14);
    else if (d >= -12 && d < -1) y -= 230 * ((d + 12) / 11);
    else if (d >= -1 && d < 11) y -= 230 * (1 - (d + 1) / 12) - 80 * ((d + 1) / 12);
    else if (d >= 11 && d < 22) y += 80 * (1 - (d - 11) / 11);
    else if (d >= 46 && d < 122) y -= 30 * Math.sin(Math.PI * (d - 46) / 76);
  }
  return y;
}

export class Hook {
  constructor(parent, lineParent) {
    this.root = el("div", { class: "layer", style: { background: "radial-gradient(ellipse at 50% 62%, #ffffff 0%, #f6f4ef 58%, #ebe6dc 100%)" } }, parent);
    this.grid = el("div", { class: "layer", style: {
      backgroundImage: "linear-gradient(rgba(20,120,100,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(20,120,100,0.09) 1px, transparent 1px)",
      backgroundSize: "48px 48px", maskImage: "radial-gradient(ellipse at 50% 65%, #000 20%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse at 50% 65%, #000 20%, transparent 75%)" } }, this.root);
    this.hud = el("div", { class: "abs mono", style: { left: "64px", top: "56px", color: "rgba(14,120,98,0.8)", fontSize: "18px", letterSpacing: "0.18em" } }, this.root);
    this.hud.innerHTML = `<div>LEAD II · 25 mm/s</div><div style="margin-top:8px;font-size:40px;letter-spacing:0.04em;color:#0e8f74">HR <span id="hr">72</span></div>`;
    this.hud2 = el("div", { class: "abs mono", style: { right: "64px", top: "56px", color: "rgba(20,28,48,0.45)", fontSize: "16px", letterSpacing: "0.22em", textAlign: "right" } }, this.root);
    this.hud2.innerHTML = `CASE 01 · ENDOCRINE<br><span style="color:rgba(20,28,48,0.35)">一个医学生的问题</span>`;
    this.svg = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: "position:absolute;left:0;top:0" }, lineParent);
    const defs = svg("defs", {}, this.svg);
    const f = svg("filter", { id: "ecgGlow", x: "-20%", y: "-50%", width: "140%", height: "200%" }, defs);
    svg("feGaussianBlur", { stdDeviation: "7" }, f);
    const lg = svg("linearGradient", { id: "ecgFade", x1: 0, y1: 0, x2: 1, y2: 0, gradientUnits: "userSpaceOnUse" }, defs);
    this.fadeA = svg("stop", { offset: "0", "stop-color": "#0e8f74", "stop-opacity": "0.18" }, lg);
    this.fadeB = svg("stop", { offset: "0.9", "stop-color": "#0e8f74", "stop-opacity": "1" }, lg);
    this.fadeC = svg("stop", { offset: "1", "stop-color": "#0a4f42", "stop-opacity": "1" }, lg);
    this.gradEnd = lg;
    this.glow = svg("path", { fill: "none", stroke: "#3fd1b0", "stroke-width": 10, filter: "url(#ecgGlow)", opacity: 0.35 }, this.svg);
    this.line = svg("path", { fill: "none", stroke: "url(#ecgFade)", "stroke-width": 3.4, "stroke-linejoin": "round", "stroke-linecap": "round" }, this.svg);
    this.dot = svg("circle", { r: 8, fill: "#3fd1b0", filter: "url(#ecgGlow)" }, this.svg);
    this.dot2 = svg("circle", { r: 4, fill: "#0a4f42" }, this.svg);
    this.svgRoot = this.svg;
    for (const x of PEAKS) ev(0.25 + ((x - 2 + 40) / 2000) * 2.15, "beep");
  }
  path(xEnd, amp, yOff = 0) {
    let d = "";
    for (let x = -40; x <= xEnd; x += 3) {
      const y = ECG_Y + yOff + ecgOffset(x) * amp;
      d += (d ? " L" : "M") + x + "," + y.toFixed(1);
    }
    return d;
  }
  render(t) {
    const vis = t < 4.35;
    this.root.style.display = vis ? "" : "none";
    this.svg.style.display = vis ? "" : "none";
    if (!vis) return;
    const xh = HEAD(t);
    const amp = 1 - ease(t, 3.55, 4.05, E.inOutCubic);
    const d = this.path(Math.min(xh, 1960), amp);
    this.line.setAttribute("d", d);
    this.glow.setAttribute("d", d);
    this.gradEnd.setAttribute("x1", String(Math.max(-40, xh - 1100)));
    this.gradEnd.setAttribute("x2", String(xh + 1));
    const done = t > 2.4;
    const inkP = ease(t, 3.6, 4.1);
    this.line.setAttribute("stroke", inkP > 0 ? mixColor("#0e8f74", "#2a2119", inkP) : "url(#ecgFade)");
    this.line.setAttribute("stroke-width", String(lerp(3.4, 4.2, inkP)));
    this.glow.setAttribute("opacity", String(0.35 * (1 - inkP) * (done ? 0.75 + 0.25 * Math.sin(t * 6) : 1)));
    const hy = ECG_Y + ecgOffset(xh) * amp;
    for (const dt of [this.dot, this.dot2]) { dt.setAttribute("cx", String(xh)); dt.setAttribute("cy", String(hy)); dt.setAttribute("opacity", String(done ? 0 : 1)); }
    const gridO = ease(t, 0.0, 1.0) * (1 - ease(t, 3.4, 3.9));
    this.grid.style.opacity = gridO.toFixed(3);
    const hudO = ease(t, 0.4, 1.0) * (1 - ease(t, 3.3, 3.7));
    this.hud.style.opacity = hudO.toFixed(3); this.hud2.style.opacity = (hudO * 0.9).toFixed(3);
    const hr = this.hud.querySelector("#hr");
    hr.textContent = t < 1.0 ? "--" : t < 1.5 ? "68" : t < 2.0 ? "71" : "72";
    this.root.style.opacity = String(1 - ease(t, 3.75, 4.3));
  }
}
