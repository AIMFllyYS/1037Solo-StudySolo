// Kinetic typography: per-character staggered reveal with blur, rise and a soft exit.
import { el, clamp, seg, E, lerp } from "./core.js";

const STYLES = {
  ink: { zh: { font: '900 66px "Noto Serif SC"', color: "#241b13", ls: "0.02em" }, en: { font: '600 36px "Caveat"', color: "#7a654a", ls: "0.01em" }, accent: "#b23a2e" },
  inkSm: { zh: { font: '900 52px "Noto Serif SC"', color: "#241b13", ls: "0.02em" }, en: { font: '600 32px "Caveat"', color: "#7a654a", ls: "0.01em" }, accent: "#b23a2e" },
  light: { zh: { font: '700 60px "Noto Serif SC"', color: "#f4f1ea", ls: "0.04em" }, en: { font: '300 21px "Inter"', color: "rgba(236,238,245,0.58)", ls: "0.28em", upper: true }, accent: "#ff7a5c" },
  lightSm: { zh: { font: '600 44px "Noto Serif SC"', color: "#f4f1ea", ls: "0.04em" }, en: { font: '300 18px "Inter"', color: "rgba(236,238,245,0.55)", ls: "0.26em", upper: true }, accent: "#8ab4ff" },
  hero: { zh: { font: '900 92px "Noto Serif SC"', color: "#f7f4ee", ls: "0.03em" }, en: { font: '300 24px "Inter"', color: "rgba(236,238,245,0.6)", ls: "0.3em", upper: true }, accent: "#ff7a5c" },
  dark: { zh: { font: '700 60px "Noto Serif SC"', color: "#11151d", ls: "0.04em" }, en: { font: '400 20px "Inter"', color: "rgba(20,28,48,0.55)", ls: "0.28em", upper: true }, accent: "#e0523a" },
  darkSm: { zh: { font: '700 44px "Noto Serif SC"', color: "#11151d", ls: "0.04em" }, en: { font: '400 18px "Inter"', color: "rgba(20,28,48,0.55)", ls: "0.26em", upper: true }, accent: "#2f5bea" },
  heroDark: { zh: { font: '900 92px "Noto Serif SC"', color: "#0e1219", ls: "0.03em" }, en: { font: '400 22px "Inter"', color: "rgba(20,28,48,0.55)", ls: "0.3em", upper: true }, accent: "#e0523a" },
  sans: { zh: { font: '800 64px "Noto Sans SC"', color: "#ffffff", ls: "0.02em" }, en: { font: '400 20px "Inter"', color: "rgba(255,255,255,0.6)", ls: "0.24em", upper: true }, accent: "#8ab4ff" },
};

export class Captions {
  constructor(parent, list) {
    this.root = el("div", { class: "layer", style: { pointerEvents: "none" } }, parent);
    this.items = list.map((c) => this.build(c));
  }
  build(c) {
    const st = STYLES[c.style || "light"];
    const box = el("div", { class: "abs", style: { left: "0", top: "0", width: "1920px", textAlign: c.align || "center", display: "none" } }, this.root);
    const lines = [];
    const zhLines = Array.isArray(c.zh) ? c.zh : [c.zh];
    for (const line of zhLines) {
      const d = el("div", { style: { font: c.zhFont || st.zh.font, color: st.zh.color, letterSpacing: st.zh.ls, lineHeight: "1.28", whiteSpace: "nowrap", textShadow: c.shadow || "" } }, box);
      let acc = false;
      const chars = [];
      for (const ch of line) {
        if (ch === "[") { acc = true; continue; }
        if (ch === "]") { acc = false; continue; }
        const s = el("span", { class: "char", text: ch === " " ? " " : ch }, d);
        if (acc) { s.style.color = c.accent || st.accent; if (c.glow) s.style.textShadow = `0 0 24px ${c.accent || st.accent}`; }
        chars.push(s);
      }
      lines.push(chars);
    }
    let en = null;
    if (c.en) {
      en = el("div", { text: st.en.upper ? c.en.toUpperCase() : c.en, style: { font: st.en.font, color: st.en.color, letterSpacing: st.en.ls, marginTop: c.enGap ?? "14px", whiteSpace: "nowrap" } }, box);
    }
    return { c, box, lines, en };
  }
  place(item) {
    const { c, box } = item;
    const x = c.x ?? 960, y = c.y ?? 540;
    const align = c.align || "center";
    box.style.width = "auto";
    const tx = align === "center" ? "-50%" : align === "right" ? "-100%" : "0";
    box.style.transform = `translate(${x}px, ${y}px) translate(${tx}, -50%)`;
  }
  render(t) {
    for (const item of this.items) {
      const { c, box, lines, en } = item;
      const on = t >= c.t0 - 0.01 && t <= c.t1 + 0.05;
      box.style.display = on ? "" : "none";
      if (!on) continue;
      this.place(item);
      const stag = c.stagger ?? 0.035, dur = c.dur ?? 0.42;
      let k = 0;
      const outDur = c.outDur ?? 0.32;
      const total = lines.reduce((a, l) => a + l.length, 0);
      for (const chars of lines) {
        for (const s of chars) {
          const pin = E.outCubic(seg(t, c.t0 + k * stag, c.t0 + k * stag + dur));
          const pout = c.hold ? 0 : E.inCubic(seg(t, c.t1 - outDur + (k / total) * 0.1, c.t1 + (k / total) * 0.1));
          const o = pin * (1 - pout);
          const y = (1 - pin) * (c.rise ?? 34) - pout * 18;
          const b = (1 - pin) * 14 + pout * 10;
          s.style.opacity = o.toFixed(3);
          s.style.transform = `translateY(${y.toFixed(2)}px) scale(${(1 + (1 - pin) * 0.08).toFixed(3)})`;
          s.style.filter = b > 0.2 ? `blur(${b.toFixed(2)}px)` : "none";
          k++;
        }
      }
      if (en) {
        const p = E.outCubic(seg(t, c.t0 + 0.25, c.t0 + 0.85));
        const po = c.hold ? 0 : E.inCubic(seg(t, c.t1 - outDur, c.t1));
        en.style.opacity = (p * (1 - po)).toFixed(3);
        en.style.transform = `translateY(${((1 - p) * 12 - po * 8).toFixed(2)}px)`;
        en.style.filter = `blur(${((1 - p) * 6 + po * 6).toFixed(2)}px)`;
        en.style.letterSpacing = c.enTrack ? `${lerp(0.5, 0.28, p)}em` : "";
      }
    }
  }
}
