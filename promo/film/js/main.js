// Director: builds all layers and exposes window.renderAt(t, frame) for deterministic capture.
import { el, clamp, seg, E, ease, lerp, EVENTS, ev, W, H, LATE } from "./core.js";
import { Hook, ECG_Y } from "./hook.js";
import { PastScene, pastCamera, pagesFlipped, pastMinutes, PAST_CUTS } from "./past.js";
import { Captions } from "./captions.js";
import { FX } from "./fx.js";
import { Split } from "./split.js";
import { Stage3D } from "./three-acts.js";
import { Stats } from "./stats.js";
import { Montage } from "./montage.js";
import { Finale } from "./finale.js";

const stage = document.getElementById("stage");
const L = (name, extra = {}) => el("div", { class: "layer", id: name, style: extra }, stage);

const lBg = L("l-bg");
const lPast = L("l-past");
const lLine = L("l-line");
const lSplit = L("l-split");
const l3d = L("l-3d");
const lMont = L("l-montage");
const lStats = L("l-stats");
const lFinale = L("l-finale");
const lCap = L("l-cap");
const lFx = L("l-fx");

const hook = new Hook(lBg, lLine);
const past = new PastScene(lPast, { id: "past", variant: "past" });

// Documentary stamps on the past act (screen space)
const stampL = el("div", { class: "abs caveat", style: { left: "70px", bottom: "40px", fontSize: "60px", fontWeight: "700", color: "#2a2119", opacity: 0 } }, lPast);
const stampR = el("div", { class: "abs caveat", style: { right: "76px", bottom: "40px", fontSize: "60px", fontWeight: "700", color: "#2a2119", opacity: 0, textAlign: "right" } }, lPast);
const capBand = el("div", { class: "abs", style: { left: "0", bottom: "0", width: "1920px", height: "300px", background: "linear-gradient(180deg, rgba(239,229,207,0) 0%, rgba(239,229,207,0.82) 55%, rgba(236,225,200,0.92) 100%)", opacity: 0 } }, lPast);
const tagPast = el("div", { class: "abs", style: { left: "70px", top: "54px", opacity: 0 } }, lPast);
tagPast.innerHTML = `<div class="hand" style="font-size:56px;color:#2a2119;line-height:1">过去</div><div class="caveat" style="font-size:30px;color:#7a654a;margin-top:2px">before · 2019</div>`;

const split = new Split(lSplit, past);
const s3d = new Stage3D(l3d);
const montage = new Montage(lMont);
const stats = new Stats(lStats);
const finale = new Finale(lFinale);

const caps = new Captions(lCap, [
  { t0: 2.15, t1: 3.95, style: "dark", y: 400, zh: ["为什么糖尿病人的呼吸，", "会有[烂苹果味]？"], en: "Why does a diabetic's breath smell like rotten apples?", zhFont: '700 70px "Noto Serif SC"', stagger: 0.045 },
  { t0: 4.6, t1: 5.95, style: "ink", x: 960, y: 930, zh: "一个问题——", en: "one question —" },
  { t0: 6.05, t1: 8.3, style: "ink", x: 960, y: 930, zh: "藏在 [3] 本教材、[4] 个章节里。", en: "hidden across 3 textbooks and 4 chapters." },
  { t0: 8.45, t1: 10.35, style: "ink", x: 960, y: 930, zh: "翻目录。查索引。再翻回来。", en: "contents. index. back again." , stagger: 0.05 },
  { t0: 10.5, t1: 12.35, style: "ink", x: 960, y: 930, zh: "太阳落山了，", en: "the sun went down," },
  { t0: 12.45, t1: 13.75, style: "ink", x: 960, y: 930, zh: "因果链，还是断的。", en: "and the chain was still broken." },
  { t0: 13.85, t1: 15.05, style: "light", x: 960, y: 900, zh: "知识从不缺席。缺的，是那根[线]。", en: "knowledge was never missing. the thread was.", shadow: "0 4px 30px rgba(0,0,0,0.6)", stagger: 0.028 },
  ...split.captions(),
  ...s3d.captions(),
  ...finale.captions(),
]);
const fx = new FX(lFx);
fx.addFlash(15.0, 0.45, 0.85);
fx.addLeak(14.6, 15.8, 0.55, 1);
fx.addFlash(33.0, 0.3, 0.5);
fx.addFlash(47.0 + LATE, 0.5, 0.9);
fx.addLeak(46.6 + LATE, 48.0 + LATE, 0.6, -1);
fx.addBlack(56.2 + LATE, 57.0 + LATE, 0, 1);
fx.addBlack(0, 0.35, 1, 0);

// Sound events owned by the director
ev(15.0, "impact"); ev(14.3, "riser", { dur: 0.7 });
for (const c of PAST_CUTS) if (c > 12.4 && c < 13.6) ev(c, "tick");

export const DURATION = 57.0 + LATE;

window.renderAt = async function renderAt(t, frame) {
  // ---- Act I / II
  hook.render(t);
  const pastOn = t >= 3.55 && t < 15.02;
  lPast.style.display = pastOn ? "" : "none";
  if (pastOn) {
    let cam = pastCamera(t);
    if (t < 4.3) cam = { cx: 960, cy: 560, s: 1, rot: 0 };
    if (t < 4.3) cam.cy = 770 - (ECG_Y - 540); // desk line lands exactly on the ECG baseline
    else if (t < 5.0) { const k = ease(t, 4.3, 5.0); cam.cx = lerp(960, cam.cx, k); cam.cy = lerp(770 - (ECG_Y - 540), cam.cy, k); cam.rot *= k; }
    past.setCamera(cam);
    past.render(t, { frame, deskP: 1 });
    // paper reveal from the line
    const rv = ease(t, 3.62, 4.35, E.inOutCubic);
    const top = ECG_Y * (1 - rv), bot = (H - ECG_Y) * (1 - rv);
    lPast.style.clipPath = rv < 1 ? `inset(${top.toFixed(1)}px 0px ${bot.toFixed(1)}px 0px)` : "none";
    const so = ease(t, 4.6, 5.2) * (1 - ease(t, 13.9, 14.5));
    stampL.style.opacity = so; stampR.style.opacity = so; capBand.style.opacity = so;
    tagPast.style.opacity = ease(t, 4.5, 5.1) * (1 - ease(t, 13.9, 14.5));
    stampL.innerHTML = `<span class="serif" style="font-size:30px;font-weight:600">已翻</span> ${pagesFlipped(t).toLocaleString()} <span class="serif" style="font-size:30px;font-weight:600">页</span>`;
    const m = Math.floor(pastMinutes(t));
    stampR.textContent = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
  lLine.style.display = t < 4.35 ? "" : "none";

  // ---- Act III split
  await split.render(t, frame);
  // ---- Act IV / V (3D)
  await s3d.render(t, frame);
  await montage.render(t, frame);
  // ---- stats + finale
  stats.render(t - LATE, frame);
  await finale.render(t - LATE, frame);

  caps.render(t);
  fx.render(t, frame, { grain: t > 3.6 && t < 15 ? 0.1 : 0.055 });
};

// Preload fonts + images so every frame is complete.
window.ready = (async () => {
  const pre = document.getElementById("preload");
  const all = [...document.querySelectorAll("#stage *")].map((n) => n.textContent).join("") + "0123456789:,.万页秒小时分已翻过去现在";
  for (const fam of ['"Noto Serif SC"', '"Noto Sans SC"', '"Inter"', '"JetBrains Mono"', '"Long Cang"', '"Caveat"']) {
    const d = el("div", { style: { fontFamily: fam, fontWeight: "400" }, text: all }, pre);
    el("div", { style: { fontFamily: fam, fontWeight: "900" }, text: all }, pre);
    el("div", { style: { fontFamily: fam, fontWeight: "700" }, text: all }, pre);
    el("div", { style: { fontFamily: fam, fontWeight: "600" }, text: all }, pre);
    el("div", { style: { fontFamily: fam, fontWeight: "300" }, text: all }, pre);
  }
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 300));
  await document.fonts.ready;
  await Promise.all([split.ready, s3d.ready, finale.ready, stats.ready, montage.ready].filter(Boolean));
  pre.innerHTML = "";
  return true;
})();
window.getEvents = () => EVENTS.slice().sort((a, b) => a.t - b.t);
window.DURATION = DURATION;
