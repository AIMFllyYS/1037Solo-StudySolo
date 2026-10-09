// Act III — Before | Now. Left: the hand-drawn desk keeps burning time. Right: the real StudySolo Agent.
import { el, svg, clamp, seg, E, ease, lerp, track, ev, noise1, W, H } from "./core.js";
import { pastMinutes } from "./past.js";

export const SPLIT_T0 = 15.0, SPLIT_T1 = 24.0;
// full-screen window rect at the end of the act (Stage3D picks up from here)
export const WIN_FULL = { cx: 960, cy: 548, w: 1760, h: 990 };

const FRAME_KEYS = [[15.0, 0], [15.55, 0], [15.6, 1], [15.68, 2], [16.9, 19], [17.0, 20], [17.3, 25], [17.35, 26], [18.2, 46], [18.26, 47], [18.4, 48], [18.55, 49], [21.35, 147], [21.45, 148], [22.6, 168]];
function frameAt(t) {
  if (t <= FRAME_KEYS[0][0]) return 0;
  for (let i = 1; i < FRAME_KEYS.length; i++) {
    const [t1, f1] = FRAME_KEYS[i], [t0, f0] = FRAME_KEYS[i - 1];
    if (t <= t1) return Math.floor(lerp(f0, f1, seg(t, t0, t1)) + 1e-6);
  }
  return 168;
}
export function dividerAt(t) {
  return track([[15.0, 1920], [15.45, 960, E.outExpo], [17.1, 960], [17.8, 760, E.inOutCubic], [21.65, 760], [22.5, 0, E.inOutQuart]], t);
}
const ZOOM = [
  [15.0, [800, 450, 1]], [15.55, [975, 417, 1.0]], [15.95, [975, 417, 2.5]], [16.95, [1000, 417, 2.55]],
  [17.35, [900, 210, 2.05]], [18.25, [900, 235, 2.1]], [18.65, [1437, 250, 2.45]], [19.35, [1437, 290, 2.5]],
  [19.8, [800, 300, 2.05]], [21.3, [800, 480, 2.05]], [22.35, [800, 450, 1.0]], [24.5, [800, 450, 1.0]],
];

export class Split {
  constructor(parent, past) {
    this.past = past;
    this.root = el("div", { class: "layer", style: { display: "none" } }, parent);
    // right pane (clipped by divider)
    this.pane = el("div", { class: "layer", style: { background: "radial-gradient(ellipse at 70% 30%, #ffffff 0%, #eef2f9 55%, #e2e8f3 100%)" } }, this.root);
    this.blobA = el("div", { class: "abs", style: { width: "900px", height: "900px", borderRadius: "50%", background: "radial-gradient(circle, rgba(76,120,255,0.20), rgba(76,120,255,0) 65%)", filter: "blur(30px)" } }, this.pane);
    this.blobB = el("div", { class: "abs", style: { width: "800px", height: "800px", borderRadius: "50%", background: "radial-gradient(circle, rgba(160,110,255,0.16), rgba(160,110,255,0) 65%)", filter: "blur(30px)" } }, this.pane);
    this.dots = el("div", { class: "layer", style: { backgroundImage: "radial-gradient(rgba(40,60,120,0.13) 1.2px, transparent 1.4px)", backgroundSize: "34px 34px", maskImage: "linear-gradient(180deg, #000 0%, transparent 85%)", WebkitMaskImage: "linear-gradient(180deg, #000 0%, transparent 85%)" } }, this.pane);
    // UI window
    this.win = el("div", { class: "abs", style: { borderRadius: "18px", overflow: "hidden", background: "#ffffff", boxShadow: "0 50px 120px -30px rgba(25,35,80,0.38), 0 0 0 1px rgba(20,30,60,0.10), 0 0 80px rgba(80,130,255,0.12)" } }, this.pane);
    this.img = el("img", { class: "abs", style: { left: "0", top: "0", transformOrigin: "0 0" } }, this.win);
    this.frost = el("div", { class: "layer", style: { background: "#f7f9fc", opacity: 0, zIndex: 2 } }, this.win);
    this.sheen = el("div", { class: "layer", style: { background: "linear-gradient(115deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0) 60%)", mixBlendMode: "screen" } }, this.win);
    // header chip + agent steps
    this.chip = el("div", { class: "abs", style: { top: "46px", display: "flex", alignItems: "center", gap: "14px" } }, this.pane);
    this.chip.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#f4efe6"/><g fill="none" stroke="#d9542c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6 H18 L23 11 V26 H9 Z"/><path d="M18 6 V11 H23"/><line x1="12" y1="16" x2="20" y2="16"/><line x1="12" y1="20" x2="17" y2="20"/></g></svg>
      <div><div class="sans" style="font-size:34px;font-weight:800;color:#0e1219;line-height:1">现在 <span class="inter" style="font-weight:600;color:#2f5bea;margin-left:6px">StudySolo</span></div>
      <div class="inter" style="font-size:15px;letter-spacing:0.3em;color:rgba(20,28,48,0.5);margin-top:8px">NOW · ONE QUESTION</div></div>`;
    this.steps = el("div", { class: "abs", style: { top: "58px", display: "flex", gap: "10px" } }, this.pane);
    this.stepEls = [["思考", "THINK", 17.35], ["检索 3 本教材", "SEARCH", 18.3], ["作答", "ANSWER", 18.6], ["标注出处", "CITE", 21.4]].map(([zh, en, t]) => {
      const s = el("div", { class: "sans", style: { padding: "9px 16px", borderRadius: "999px", fontSize: "19px", fontWeight: "600", color: "rgba(20,28,48,0.4)", border: "1px solid rgba(20,30,60,0.12)", background: "rgba(255,255,255,0.03)", whiteSpace: "nowrap" } }, this.steps);
      s.innerHTML = `<span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:currentColor;margin-right:9px;vertical-align:2px"></span>${zh}`;
      return { s, t };
    });
    // timers
    this.timerR = el("div", { class: "abs mono", style: { bottom: "40px", fontSize: "56px", color: "#0e1219", letterSpacing: "0.02em", textShadow: "0 8px 30px rgba(47,91,234,0.22)" } }, this.pane);
    this.timerRLabel = el("div", { class: "abs inter", style: { bottom: "108px", fontSize: "15px", letterSpacing: "0.32em", color: "rgba(20,28,48,0.5)" }, text: "耗时 · ELAPSED" }, this.pane);
    // callout
    this.callout = el("div", { class: "abs", style: { padding: "18px 24px", borderRadius: "16px", background: "rgba(255,255,255,0.95)", border: "1px solid rgba(47,91,234,0.4)", boxShadow: "0 20px 60px rgba(25,35,80,0.22), 0 0 40px rgba(80,130,255,0.15)", backdropFilter: "blur(8px)" } }, this.pane);
    this.callout.innerHTML = `<div class="sans" style="font-size:34px;font-weight:800;color:#0e1219;white-space:nowrap">4 条出处 · <span style="color:#2f5bea">3 本教材</span></div><div class="inter" style="font-size:15px;letter-spacing:0.26em;color:rgba(20,28,48,0.55);margin-top:8px">4 SOURCES · SEARCHED AT ONCE</div>`;

    // left pane overlays (on top of the past layer, but inside this root → positioned left)
    this.leftTag = el("div", { class: "abs", style: { left: "54px", top: "46px" } }, this.root);
    this.leftTag.innerHTML = `<div class="hand" style="font-size:58px;color:#f3e6c8;line-height:1;text-shadow:0 2px 16px rgba(0,0,0,0.5)">过去</div><div class="caveat" style="font-size:30px;color:rgba(243,230,200,0.7)">before · still searching</div>`;
    this.timerL = el("div", { class: "abs caveat", style: { left: "54px", bottom: "30px", fontSize: "78px", fontWeight: "700", color: "#f3e6c8", textShadow: "0 2px 18px rgba(0,0,0,0.6)" } }, this.root);
    this.timerLLabel = el("div", { class: "abs caveat", style: { left: "58px", bottom: "112px", fontSize: "28px", color: "rgba(243,230,200,0.7)" }, text: "time spent" }, this.root);
    this.circle = svg("svg", { width: 420, height: 170, style: "position:absolute;left:24px;bottom:10px;overflow:visible" }, this.root);
    this.circleP = svg("path", { d: "M40,110 C20,40 200,10 330,30 C420,48 400,140 260,150 C140,160 30,140 60,70", fill: "none", stroke: "#e0503c", "stroke-width": 6, "stroke-linecap": "round", pathLength: 1 }, this.circle);

    // divider
    this.divider = el("div", { class: "abs", style: { top: "0", width: "4px", height: "1080px", background: "#2f5bea", boxShadow: "0 0 16px 3px rgba(47,91,234,0.55), 0 0 50px 10px rgba(80,130,255,0.3)" } }, this.root);
    this.pulse = el("div", { class: "abs", style: { width: "10px", height: "220px", borderRadius: "10px", background: "linear-gradient(180deg, rgba(255,255,255,0), #fff, rgba(255,255,255,0))", filter: "blur(2px)" } }, this.root);

    // sound events
    for (let i = 2; i <= 19; i++) { const tt = lerp(15.68, 16.9, (i - 2) / 17); ev(tt, "key", { i }); }
    ev(17.0, "enter"); ev(18.35, "chime"); ev(21.45, "ding"); ev(15.45, "swoosh"); ev(17.1, "swoosh", { soft: true }); ev(21.7, "sweep");
    for (let tt = 18.6; tt < 21.3; tt += 0.125) ev(tt, "data");

    this.lastSrc = null;
    this.ready = this.preload();
  }
  async preload() {
    // warm the first & last frames
    for (const f of [0, 168]) { const im = new Image(); im.src = this.src(f); await im.decode(); }
  }
  src(f) { return `assets/seq/agent/${String(f).padStart(4, "0")}.jpg`; }
  captions() {
    return [
      { t0: 22.55, t1: 23.85, style: "heroDark", x: 960, y: 548, zh: "从[翻找]，到[理解]。", en: "from searching to understanding", shadow: "0 4px 40px rgba(255,255,255,0.95)", zhFont: '900 104px "Noto Serif SC"' },
    ];
  }
  pastCamera(t, div) {
    return { cx: 900 + noise1(t * 0.5, 4) * 8, cy: 560 + noise1(t * 0.4, 6) * 6, s: 0.86 + 0.02 * seg(t, 15, 22), rot: 0, sx: Math.max(div / 2, 380), sy: 560 };
  }
  async render(t, frame) {
    const on = t >= 14.98 && t < 24.3;
    this.root.style.display = on ? "" : "none";
    if (!on) return { on: false };
    const div = dividerAt(t);
    // left pane = past layer (owned by main) — we set its camera + clip
    const lPast = this.past.root.parentElement;
    const pastVisible = div > 2 && t < 22.6;
    if (t >= 15.0) {
      lPast.style.display = pastVisible ? "" : "none";
      if (pastVisible) {
        this.past.setCamera(this.pastCamera(t, div));
        this.past.render(t, { frame });
        lPast.style.clipPath = `inset(0px ${(W - div).toFixed(1)}px 0px 0px)`;
        [...lPast.children].forEach((c) => { if (c !== this.past.root) c.style.opacity = 0; });
      }
    }
    // right pane
    this.pane.style.clipPath = `inset(0px 0px 0px ${div.toFixed(1)}px)`;
    const paneW = W - div;
    const full = ease(t, 21.65, 22.5, E.inOutQuart);
    const margin = lerp(64, 80, full);
    const ww = Math.min(paneW - margin * 2, WIN_FULL.w);
    const wh = ww * 9 / 16;
    const wcx = div + paneW / 2, wcy = lerp(572, WIN_FULL.cy, full);
    const appear = ease(t, 15.1, 15.7, E.outCubic);
    const wy = wcy - wh / 2 + (1 - appear) * 60;
    Object.assign(this.win.style, { left: `${(wcx - ww / 2).toFixed(1)}px`, top: `${wy.toFixed(1)}px`, width: `${ww.toFixed(1)}px`, height: `${wh.toFixed(1)}px`, opacity: appear.toFixed(3) });
    this.win.style.transform = `perspective(2400px) rotateY(${((1 - appear) * -8).toFixed(2)}deg)`;
    // zoom within the UI
    const [fx, fy, z] = track(ZOOM.map(([tt, v]) => [tt, v]), t);
    const iw = ww * z, ih = wh * z;
    let ix = ww / 2 - (fx / 1600) * iw, iy = wh / 2 - (fy / 900) * ih;
    ix = clamp(ix, ww - iw, 0); iy = clamp(iy, wh - ih, 0);
    Object.assign(this.img.style, { width: `${iw.toFixed(1)}px`, height: `${ih.toFixed(1)}px`, transform: `translate(${ix.toFixed(2)}px, ${iy.toFixed(2)}px)` });
    const f = frameAt(t);
    const src = this.src(f);
    if (src !== this.lastSrc) { this.img.src = src; this.lastSrc = src; await this.img.decode().catch(() => {}); }
    const dim = ease(t, 22.45, 22.75) * (1 - ease(t, 23.75, 24.0));
    this.win.style.filter = dim > 0.01 ? `blur(${(6 * dim).toFixed(2)}px) saturate(${(1 - 0.4 * dim).toFixed(3)})` : 'none';
    this.frost.style.opacity = (0.62 * dim).toFixed(3);
    this.sheen.style.transform = `translateX(${lerp(-1400, 1400, seg(t, 16.8, 18.0)).toFixed(0)}px)`;
    // blobs drift
    this.blobA.style.transform = `translate(${(div + 300 + Math.sin(t * 0.7) * 120).toFixed(0)}px, ${(-200 + Math.cos(t * 0.5) * 80).toFixed(0)}px)`;
    this.blobB.style.transform = `translate(${(div + paneW - 700 + Math.cos(t * 0.6) * 100).toFixed(0)}px, ${(420 + Math.sin(t * 0.8) * 90).toFixed(0)}px)`;
    // header chip
    const chipO = ease(t, 15.35, 15.9) * (1 - ease(t, 21.65, 21.95));
    this.chip.style.left = `${(div + 64).toFixed(1)}px`; this.chip.style.opacity = chipO.toFixed(3);
    this.steps.style.opacity = (ease(t, 17.2, 17.5) * (1 - ease(t, 21.65, 21.95))).toFixed(3);
    this.steps.style.left = `${(div + 470).toFixed(1)}px`;
    for (const { s, t: st } of this.stepEls) {
      const a = t >= st;
      const pop = a ? E.outBack(seg(t, st, st + 0.3)) : 0;
      s.style.color = a ? "#1d3fb8" : "rgba(20,28,48,0.38)";
      s.style.borderColor = a ? "rgba(47,91,234,0.6)" : "rgba(20,30,60,0.12)";
      s.style.background = a ? "rgba(47,91,234,0.10)" : "rgba(255,255,255,0.6)";
      s.style.boxShadow = a ? `0 0 ${Math.round(24 * (1 - seg(t, st, st + 0.8)) + 8)}px rgba(47,91,234,0.25)` : "none";
      s.style.transform = `scale(${(1 + 0.12 * Math.sin(pop * Math.PI)).toFixed(3)})`;
    }
    // timers
    const tr = t < 17.0 ? 0 : Math.min(6.0, (t - 17.0) * (6.0 / 4.45));
    this.timerR.textContent = `${tr.toFixed(1)} 秒`;
    this.timerR.style.fontFamily = '"JetBrains Mono", "Noto Sans SC"';
    const tO = ease(t, 15.5, 16.0) * (1 - ease(t, 21.9, 22.3));
    this.timerR.style.right = "70px"; this.timerR.style.opacity = tO.toFixed(3);
    this.timerRLabel.style.right = "72px"; this.timerRLabel.style.opacity = (tO * 0.9).toFixed(3);
    const doneGlow = t > 21.4 ? 1 - seg(t, 21.4, 22.2) : 0;
    this.timerR.style.color = doneGlow > 0 ? "#2f5bea" : "#0e1219";
    this.timerR.style.transform = `scale(${(1 + 0.18 * Math.sin(Math.PI * seg(t, 21.4, 21.8))).toFixed(3)})`;
    this.timerR.style.transformOrigin = "100% 100%";
    // left timer (elapsed since 14:00)
    const el_ = (pastMinutes(t) - 14 * 60) * 60 + ((t * 997) % 60);
    const hh = Math.floor(el_ / 3600), mm = Math.floor((el_ % 3600) / 60), ss = Math.floor(el_ % 60);
    this.timerL.innerHTML = `${hh}<span class="serif" style="font-size:0.5em;font-weight:600;margin:0 10px 0 6px">小时</span>${String(mm).padStart(2, "0")}<span class="serif" style="font-size:0.5em;font-weight:600;margin:0 10px 0 6px">分</span>${String(ss).padStart(2, "0")}<span class="serif" style="font-size:0.5em;font-weight:600;margin-left:6px">秒</span>`;
    const lO = ease(t, 15.4, 15.9) * (pastVisible ? 1 : 0) * (1 - ease(t, 21.7, 22.1));
    this.timerL.style.opacity = lO.toFixed(3); this.timerLLabel.style.opacity = lO.toFixed(3);
    this.leftTag.style.opacity = lO.toFixed(3);
    this.circle.style.opacity = lO.toFixed(3);
    this.circleP.style.strokeDasharray = "1 1"; this.circleP.style.strokeDashoffset = String(1 - ease(t, 21.45, 21.75, E.outCubic));
    // callout near sources
    const cO = ease(t, 18.75, 19.05, E.outBack) * (1 - ease(t, 19.55, 19.8));
    this.callout.style.opacity = clamp(cO).toFixed(3);
    this.callout.style.left = `${(div + 90).toFixed(1)}px`; this.callout.style.top = `${(wy + 60).toFixed(1)}px`;
    this.callout.style.transform = `translateY(${((1 - clamp(cO)) * 16).toFixed(1)}px) scale(${(0.9 + 0.1 * clamp(cO)).toFixed(3)})`;
    // divider
    const dO = t < 15.0 ? 0 : (1 - ease(t, 22.35, 22.55));
    this.divider.style.left = `${(div - 2).toFixed(1)}px`; this.divider.style.opacity = dO.toFixed(3);
    this.pulse.style.left = `${(div - 5).toFixed(1)}px`; this.pulse.style.top = `${((t * 900) % 1400 - 250).toFixed(0)}px`; this.pulse.style.opacity = (dO * 0.9).toFixed(3);
    return { on: true, win: { x: wcx - ww / 2, y: wy, w: ww, h: wh } };
  }
}
