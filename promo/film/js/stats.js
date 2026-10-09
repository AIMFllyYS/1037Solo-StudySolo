// Stats slam — real numbers from the repository, landing on the beat.
import { el, clamp, seg, E, ease, lerp, ev, LATE } from "./core.js";

const ITEMS = [
  { t: 44.0, n: 13, fmt: (v) => Math.round(v).toString(), zh: "门学科", en: "subjects" },
  { t: 44.5, n: 1187, fmt: (v) => Math.round(v).toLocaleString("en-US"), zh: "个章节与讲次", en: "chapters & lectures" },
  { t: 45.0, n: 5454, fmt: (v) => Math.round(v).toLocaleString("en-US"), zh: "道练习题", en: "practice questions" },
  { t: 45.5, n: 339, fmt: (v) => Math.round(v).toString(), zh: "段动画讲解", en: "animated lessons" },
  { t: 46.0, n: 3590, fmt: (v) => `${Math.round(v).toLocaleString("en-US")}<span style="font-size:0.5em;margin-left:6px;font-family:'Noto Sans SC';font-weight:800">万</span>`, zh: "字笔记与原文", en: "characters of notes" },
];

export class Stats {
  constructor(parent) {
    this.root = el("div", { class: "layer", style: { display: "none" } }, parent);
    this.row = el("div", { class: "abs", style: { left: "0", top: "0", width: "1920px", height: "1080px" } }, this.root);
    this.cols = ITEMS.map((it, i) => {
      const c = el("div", { class: "abs", style: { top: "0", width: "340px", textAlign: "center", whiteSpace: "nowrap" } }, this.row);
      const num = el("div", { class: "inter", style: { fontSize: "100px", fontWeight: "800", color: "#0e1219", letterSpacing: "-0.03em", lineHeight: "1", textShadow: "0 12px 40px rgba(47,91,234,0.18)" } }, c);
      const zh = el("div", { class: "sans", text: it.zh, style: { fontSize: "30px", fontWeight: "700", color: "#1d2533", marginTop: "18px" } }, c);
      const en = el("div", { class: "inter", text: it.en.toUpperCase(), style: { fontSize: "14px", letterSpacing: "0.3em", color: "rgba(20,28,48,0.5)", marginTop: "10px" } }, c);
      const bar = el("div", { style: { width: "0px", height: "3px", margin: "22px auto 0", background: "linear-gradient(90deg, transparent, #2f5bea, transparent)" } }, c);
      ev(it.t + LATE, "slam", { i });
      return { it, c, num, zh, en, bar, i };
    });
    this.head = el("div", { class: "abs sans", text: "一个人的期末复习，背后是这些。", style: { left: "0", width: "1920px", top: "300px", textAlign: "center", fontSize: "34px", fontWeight: "500", color: "rgba(20,28,48,0.62)", letterSpacing: "0.16em" } }, this.root);
    this.ready = Promise.resolve();
  }
  render(t) {
    const on = t >= 43.95 && t < 47.1;
    this.root.style.display = on ? "" : "none";
    if (!on) return;
    for (const c of this.cols) {
      const p = seg(t, c.it.t, c.it.t + 0.45);
      const pop = E.outBack(seg(t, c.it.t, c.it.t + 0.35));
      const x = 960 + (c.i - 2) * 360 - 170;
      c.c.style.left = `${x}px`;
      c.c.style.top = "440px";
      c.c.style.opacity = (t < c.it.t ? 0 : clamp(p * 3)).toFixed(3);
      c.c.style.transform = `translateY(${((1 - E.outCubic(p)) * 50).toFixed(1)}px) scale(${lerp(1.5, 1, clamp(pop)).toFixed(3)})`;
      c.c.style.filter = p < 0.4 ? `blur(${((0.4 - p) * 30).toFixed(1)}px)` : "none";
      c.num.innerHTML = c.it.fmt(c.it.n * E.outExpo(p));
      c.bar.style.width = `${(220 * E.outCubic(seg(t, c.it.t + 0.1, c.it.t + 0.5))).toFixed(0)}px`;
    }
    const hp = ease(t, 44.05, 44.5);
    this.head.style.opacity = (hp * (1 - ease(t, 46.8, 47.05))).toFixed(3);
    this.head.style.transform = `translateY(${((1 - hp) * 16).toFixed(1)}px)`;
    this.root.style.opacity = (1 - ease(t, 46.85, 47.05)).toFixed(3);
  }
}
