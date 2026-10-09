// Global finishing layer: film grain, vignette, flashes, light leaks, chromatic fringe.
import { el, clamp, seg, E, rng, W, H } from "./core.js";

export class FX {
  constructor(parent) {
    this.root = el("div", { class: "layer", style: { pointerEvents: "none" } }, parent);
    // grain tiles
    this.tiles = [];
    const r = rng(99);
    for (let k = 0; k < 6; k++) {
      const c = document.createElement("canvas"); c.width = 384; c.height = 384;
      const g = c.getContext("2d"); const img = g.createImageData(384, 384);
      for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (r() - 0.5) * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0); this.tiles.push(c.toDataURL());
    }
    this.leak = el("div", { class: "layer", style: { mixBlendMode: "screen", opacity: 0 } }, this.root);
    this.leakA = el("div", { class: "abs", style: { width: "1400px", height: "1400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,150,70,0.85) 0%, rgba(255,90,60,0.35) 35%, rgba(255,60,60,0) 70%)", filter: "blur(40px)" } }, this.leak);
    this.leakB = el("div", { class: "abs", style: { width: "1100px", height: "1100px", borderRadius: "50%", background: "radial-gradient(circle, rgba(120,170,255,0.8) 0%, rgba(90,120,255,0.3) 40%, rgba(0,0,0,0) 70%)", filter: "blur(50px)" } }, this.leak);
    this.flash = el("div", { class: "layer", style: { background: "#fff", opacity: 0 } }, this.root);
    this.black = el("div", { class: "layer", style: { background: "#f7f5f0", opacity: 0 } }, this.root);
    this.vig = el("div", { class: "layer", style: { background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 60%, rgba(40,30,20,0.22) 100%)" } }, this.root);
    this.grain = el("div", { class: "layer", style: { mixBlendMode: "overlay", opacity: 0.085 } }, this.root);
    this.flashes = []; this.leaks = []; this.blacks = [];
  }
  addFlash(t, dur = 0.35, peak = 1) { this.flashes.push({ t, dur, peak }); }
  addLeak(t0, t1, peak = 0.7, dir = 1) { this.leaks.push({ t0, t1, peak, dir }); }
  addBlack(t0, t1, v0, v1) { this.blacks.push({ t0, t1, v0, v1 }); }
  render(t, frame, { grain = 0.085, vignette = 1 } = {}) {
    this.grain.style.backgroundImage = `url(${this.tiles[frame % this.tiles.length]})`;
    const r = rng(frame * 7 + 3);
    this.grain.style.backgroundPosition = `${Math.floor(r() * 384)}px ${Math.floor(r() * 384)}px`;
    this.grain.style.opacity = String(grain);
    this.vig.style.opacity = String(vignette);
    let f = 0;
    for (const fl of this.flashes) if (t >= fl.t && t < fl.t + fl.dur) f = Math.max(f, fl.peak * Math.pow(1 - (t - fl.t) / fl.dur, 2.2));
    this.flash.style.opacity = f.toFixed(3);
    let lk = 0, lp = 0, dir = 1;
    for (const L of this.leaks) if (t >= L.t0 && t <= L.t1) { const p = seg(t, L.t0, L.t1); lk = Math.max(lk, L.peak * Math.sin(p * Math.PI)); lp = p; dir = L.dir; }
    this.leak.style.opacity = lk.toFixed(3);
    const ax = dir > 0 ? -600 + lp * 1900 : 1500 - lp * 1900;
    this.leakA.style.transform = `translate(${ax}px, ${-300 + lp * 260}px)`;
    this.leakB.style.transform = `translate(${1500 - ax * 0.6}px, ${300 - lp * 200}px)`;
    let b = 0;
    for (const B of this.blacks) if (t >= B.t0 && t <= B.t1) b = Math.max(b, B.v0 + (B.v1 - B.v0) * E.inOutQuad(seg(t, B.t0, B.t1)));
    this.black.style.opacity = b.toFixed(3);
  }
}
