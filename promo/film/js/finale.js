// Finale — the same desk, but today the sun is still up. Then the heartbeat becomes the brand.
import { el, svg, clamp, seg, E, ease, lerp, ev as ev0, noise1, W, H, LATE } from "./core.js";
const ev = (t, type, extra) => ev0(t + LATE, type, extra);
import { PastScene } from "./past.js";

const MARKS = [
  `<g fill="none" stroke="#ff8a6b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 4.5 H13 L17.5 9 V19.5 H6.5 Z"/><path d="M13 4.5 V9 H17.5"/><line x1="9" y1="12.5" x2="15" y2="12.5"/><line x1="9" y1="15.5" x2="13.5" y2="15.5"/></g>`,
  `<g fill="none" stroke="#6ee7b7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9 L12 5.6 L19 9 L12 12.4 Z"/><path d="M5 12.4 L12 15.8 L19 12.4"/><path d="M5 15.6 L12 19 L19 15.6"/></g>`,
  `<g fill="none" stroke="#8b7bff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.3 L12 5.4 L20 9.3 L12 13.2 Z"/><path d="M7 11 V15.2 C7 15.2 9 17 12 17 C15 17 17 15.2 17 15.2 V11"/><path d="M20 9.3 V14"/></g>`,
  `<g stroke="#cdddff" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M12 7.2 C10 5.8 6.8 5.6 4.5 6.3 V17 C6.8 16.3 10 16.5 12 17.9" fill="#3f5da3"/><path d="M12 7.2 C14 5.8 17.2 5.6 19.5 6.3 V17 C17.2 16.3 14 16.5 12 17.9" fill="#5d7fcf"/></g>`,
  `<path d="M5.5 12.6 L10 17 L18.5 7" fill="none" stroke="#f4c45a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  `<g stroke="#f0a6d0" stroke-width="1.3"><line x1="7.3" y1="8.2" x2="11" y2="11"/><line x1="16.7" y1="7.8" x2="13" y2="11"/><line x1="11" y1="13" x2="8.3" y2="16.7"/><line x1="13" y1="13" x2="15.9" y2="16.4"/></g><g fill="#f0a6d0"><circle cx="12" cy="12" r="2.1"/><circle cx="7" cy="8" r="1.4"/><circle cx="17" cy="7.6" r="1.4"/><circle cx="8" cy="17" r="1.4"/><circle cx="16.3" cy="16.6" r="1.4"/></g>`,
  `<g fill="#8ab4ff"><path d="M12 4.5 C12.5 8.2 13.4 9.1 17 9.6 C13.4 10.1 12.5 11 12 14.7 C11.5 11 10.6 10.1 7 9.6 C10.6 9.1 11.5 8.2 12 4.5 Z"/><circle cx="17.4" cy="15.2" r="1.3"/></g>`,
];
const Y = 400;
function ecg(x, peaks, amp) {
  let y = 0;
  for (const c of peaks) {
    const d = x - c;
    if (d > -110 && d < -66) y -= 12 * Math.sin(Math.PI * (d + 110) / 44);
    else if (d >= -22 && d < -10) y += 10 * Math.sin(Math.PI * (d + 22) / 12);
    else if (d >= -10 && d < -1) y -= 190 * ((d + 10) / 9);
    else if (d >= -1 && d < 9) y -= 190 * (1 - (d + 1) / 10) - 60 * ((d + 1) / 10);
    else if (d >= 9 && d < 18) y += 60 * (1 - (d - 9) / 9);
    else if (d >= 38 && d < 100) y -= 24 * Math.sin(Math.PI * (d - 38) / 62);
  }
  return y * amp;
}

export class Finale {
  constructor(parent) {
    this.root = el("div", { class: "layer", style: { display: "none" } }, parent);
    this.sceneL = el("div", { class: "layer" }, this.root);
    this.past = new PastScene(this.sceneL, { id: "fin", variant: "finale" });
    this.white = el("div", { class: "layer", style: { background: "radial-gradient(circle at 50% 50%, #fffdf6 0%, #fff4d6 60%, #ffe2a8 100%)", opacity: 0 } }, this.root);
    // end card
    this.end = el("div", { class: "layer", style: { background: "radial-gradient(ellipse at 50% 50%, #ffffff 0%, #f7f3ec 58%, #ece4d6 100%)", opacity: 0 } }, this.root);
    this.endGlow = el("div", { class: "abs", style: { left: "560px", top: "160px", width: "800px", height: "800px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,138,107,0.28), rgba(90,130,255,0.12) 45%, transparent 70%)", filter: "blur(20px)" } }, this.end);
    this.svg = svg("svg", { width: W, height: H, style: "position:absolute;left:0;top:0" }, this.end);
    const defs = svg("defs", {}, this.svg);
    const f = svg("filter", { id: "finGlow", x: "-20%", y: "-50%", width: "140%", height: "200%" }, defs);
    svg("feGaussianBlur", { stdDeviation: "6" }, f);
    this.glowLine = svg("path", { fill: "none", stroke: "#ff8a6b", "stroke-width": 9, filter: "url(#finGlow)", opacity: 0.45 }, this.svg);
    this.line = svg("path", { fill: "none", stroke: "#e0523a", "stroke-width": 3.4, "stroke-linejoin": "round", "stroke-linecap": "round" }, this.svg);
    this.dot = svg("circle", { r: 8, fill: "#e0523a", filter: "url(#finGlow)" }, this.svg);
    // logo lockup
    this.lock = el("div", { class: "abs", style: { left: "0", top: "0", width: "1920px", height: "1080px" } }, this.end);
    this.icon = el("div", { class: "abs", style: { width: "150px", height: "150px", borderRadius: "36px", background: "#f4efe6", boxShadow: "0 30px 70px rgba(120,70,30,0.28), 0 0 0 1px rgba(60,40,20,0.08), 0 0 60px rgba(255,138,107,0.3)", overflow: "hidden" } }, this.lock);
    this.iconSvg = el("div", { class: "abs", style: { left: "0", top: "0", width: "150px", height: "150px" } }, this.icon);
    this.iconDark = el("div", { class: "abs", style: { left: "0", top: "0", width: "150px", height: "150px", background: "#141a2c" } }, this.icon);
    this.markSvgs = MARKS.map((m) => { const d = el("div", { class: "abs", style: { left: "15px", top: "15px", width: "120px", height: "120px" }, html: `<svg viewBox="0 0 24 24" width="120" height="120">${m}</svg>` }, this.iconDark); return d; });
    this.iconSvg.innerHTML = `<svg viewBox="0 0 32 32" width="150" height="150"><g fill="none" stroke="#d9542c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6 H18 L23 11 V26 H9 Z"/><path d="M18 6 V11 H23"/><line x1="12" y1="16" x2="20" y2="16"/><line x1="12" y1="20" x2="17" y2="20"/></g></svg>`;
    this.word = el("div", { class: "abs inter", style: { fontSize: "150px", fontWeight: "800", color: "#0e1219", letterSpacing: "-0.035em", lineHeight: "1", whiteSpace: "nowrap" } }, this.lock);
    this.wordSpans = [..."StudySolo"].map((c) => el("span", { class: "char", text: c }, this.word));
    this.tag = el("div", { class: "abs serif", style: { left: "0", width: "1920px", textAlign: "center", fontSize: "56px", fontWeight: "900", color: "#0e1219", letterSpacing: "0.08em" } }, this.lock);
    this.tagSpans = [..."把书海，变成一次提问。"].map((c) => el("span", { class: "char", text: c }, this.tag));
    this.tagEn = el("div", { class: "abs inter", text: "TURN AN OCEAN OF BOOKS INTO A SINGLE QUESTION", style: { left: "0", width: "1920px", textAlign: "center", fontSize: "19px", fontWeight: "300", color: "rgba(20,28,48,0.55)", letterSpacing: "0.34em" } }, this.lock);
    this.cta = el("div", { class: "abs", style: { left: "50%", padding: "22px 44px", borderRadius: "999px", background: "linear-gradient(135deg, #ff8a6b 0%, #d9542c 100%)", boxShadow: "0 20px 60px rgba(217,84,44,0.45), inset 0 1px 0 rgba(255,255,255,0.35)", overflow: "hidden", whiteSpace: "nowrap" } }, this.lock);
    this.cta.innerHTML = `<span class="sans" style="font-size:34px;font-weight:800;color:#fff;letter-spacing:0.04em">开通会员 · 问出你的第一个问题</span><span class="inter" style="font-size:34px;font-weight:600;color:#fff;margin-left:16px">→</span>`;
    this.shine = el("div", { class: "abs", style: { top: "-20px", left: "0", width: "120px", height: "140px", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)", transform: "skewX(-20deg)" } }, this.cta);
    ev(51.2, "heartbeat"); ev(51.72, "heartbeat"); ev(52.35, "logo"); ev(53.05, "logo-land");
    for (let i = 0; i < 6; i++) ev(52.35 + i * 0.1, "tick-soft");
    this.ready = Promise.resolve();
  }
  captions() {
    return [
      { t0: 47.35 + LATE, t1: 49.15 + LATE, style: "ink", x: 960, y: 930, zh: "今天，太阳还没落山。", en: "today, the sun hasn't set yet." },
      { t0: 49.2 + LATE, t1: 50.55 + LATE, style: "ink", x: 960, y: 930, zh: "把时间，还给[理解]。", en: "give your time back to understanding." },
    ];
  }
  async render(t, frame) {
    const on = t >= 46.95;
    this.root.style.display = on ? "" : "none";
    if (!on) return;
    // hand-drawn golden hour
    const sceneOn = t < 50.9;
    this.sceneL.style.display = sceneOn ? "" : "none";
    if (sceneOn) {
      const p = E.inOutCubic(seg(t, 47.0, 50.8));
      const push = E.inExpo(seg(t, 49.3, 50.8));
      const cam = { cx: lerp(960, 1500, E.inOutQuad(seg(t, 48.2, 50.8))), cy: lerp(540, 340, E.inOutQuad(seg(t, 48.2, 50.8))), s: lerp(1.02, 1.25, p) * (1 + push * 5), rot: noise1(t * 0.4, 50) * 0.2 };
      this.past.setCamera(cam);
      this.past.render(t, { frame, drawShift: 0 });
    }
    const wo = ease(t, 50.0, 50.72, E.inQuad) * (1 - ease(t, 50.86, 51.05, E.outQuad));
    this.white.style.opacity = wo.toFixed(3);
    // end card
    const eo = t >= 50.86 ? 1 : 0;
    this.end.style.opacity = eo.toFixed(3);
    this.end.style.display = t >= 50.86 ? "" : "none";
    if (t < 50.86) return;
    // heartbeat line → collapses into the icon
    const xh = lerp(-40, 960, seg(t, 50.85, 52.2));
    const collapse = E.inOutCubic(seg(t, 52.15, 52.45));
    const peaks = [520, 800];
    let d = "";
    const x0 = lerp(-40, 960, collapse);
    for (let x = x0; x <= xh; x += 3) d += (d ? " L" : "M") + x.toFixed(1) + "," + (Y + ecg(x, peaks, 1 - collapse)).toFixed(1);
    this.line.setAttribute("d", d); this.glowLine.setAttribute("d", d);
    const lo = 1 - ease(t, 52.35, 52.5);
    this.line.setAttribute("opacity", lo.toFixed(3)); this.glowLine.setAttribute("opacity", (0.45 * lo).toFixed(3));
    this.dot.setAttribute("cx", xh.toFixed(1)); this.dot.setAttribute("cy", (Y + ecg(xh, peaks, 1 - collapse)).toFixed(1));
    this.dot.setAttribute("opacity", (lo * (t > 50.85 ? 1 : 0)).toFixed(3));
    // icon: pops at 52.35, cycles marks, lands on the brand icon at 53.05, then slides left for the wordmark
    const ip = E.outBack(seg(t, 52.3, 52.6));
    const slide = E.inOutCubic(seg(t, 53.2, 53.8));
    const lockW = 150 + 36 + 740; // icon + gap + word
    const iconX = lerp(960 - 75, 960 - lockW / 2, slide), iconY = 400 - 75;
    this.icon.style.left = `${iconX.toFixed(1)}px`; this.icon.style.top = `${iconY}px`;
    this.icon.style.opacity = t < 52.3 ? "0" : "1";
    this.icon.style.transform = `scale(${(ip * (1 + 0.08 * Math.sin(Math.PI * seg(t, 53.05, 53.3)))).toFixed(3)})`;
    const mi = Math.min(MARKS.length - 1, Math.floor(seg(t, 52.35, 53.05) * MARKS.length));
    this.markSvgs.forEach((m, i) => (m.style.opacity = i === mi ? "1" : "0"));
    this.iconDark.style.opacity = t < 53.05 ? "1" : (1 - ease(t, 53.05, 53.2)).toFixed(3);
    // wordmark
    this.word.style.left = `${(960 - lockW / 2 + 150 + 36).toFixed(1)}px`; this.word.style.top = `${400 - 78}px`;
    this.wordSpans.forEach((s, i) => {
      const p = E.outCubic(seg(t, 53.45 + i * 0.04, 53.85 + i * 0.04));
      s.style.opacity = p.toFixed(3); s.style.transform = `translateX(${((1 - p) * -30).toFixed(1)}px)`; s.style.filter = p < 1 ? `blur(${((1 - p) * 10).toFixed(1)}px)` : "none";
      s.style.color = i >= 5 ? "#e0523a" : "#0e1219";
    });
    this.tag.style.top = "560px";
    this.tagSpans.forEach((s, i) => {
      const p = E.outCubic(seg(t, 54.0 + i * 0.05, 54.45 + i * 0.05));
      s.style.opacity = p.toFixed(3); s.style.transform = `translateY(${((1 - p) * 26).toFixed(1)}px)`; s.style.filter = p < 1 ? `blur(${((1 - p) * 10).toFixed(1)}px)` : "none";
    });
    this.tagEn.style.top = "652px";
    const ep = ease(t, 54.5, 55.0); this.tagEn.style.opacity = ep.toFixed(3);
    this.tagEn.style.letterSpacing = `${lerp(0.6, 0.34, ep).toFixed(3)}em`;
    const cp = E.outBack(seg(t, 55.0, 55.4));
    this.cta.style.top = "760px";
    this.cta.style.opacity = clamp(seg(t, 55.0, 55.2)).toFixed(3);
    this.cta.style.transform = `translateX(-50%) scale(${lerp(0.8, 1, clamp(cp)).toFixed(3)})`;
    this.shine.style.transform = `translateX(${lerp(-200, 900, seg(t, 55.5, 56.2)).toFixed(0)}px) skewX(-20deg)`;
    this.endGlow.style.transform = `scale(${(1 + 0.05 * Math.sin(t * 2.5)).toFixed(3)})`;
  }
}
