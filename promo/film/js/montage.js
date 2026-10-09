// Act V — feature montage (light): a cover-flow of real StudySolo screens, cut on the beat.
// New beats: flashcards flipping, the model lineup, 21 agent tools, and a rapid theme switch.
import { el, clamp, seg, E, ease, lerp, track, ev, rng, LATE, W, H } from "./core.js";

const pad = (n) => String(n).padStart(4, "0");
const MODELS = ["DeepSeek V4.1 Flash", "Qwen3.8 Flash", "Gemini 3.8 Flash", "GPT-5.6 Sol", "Claude Sonnet 4.6", "Kimi K3", "MiMo 2.6 Pro", "GLM-5.3 Flash", "Muse Spark 1.3", "Laguna S 2.1", "Nano Banana", "GPT Image 2.5"];
const MODEL_DOTS = ["#4d6bfe", "#6f5bff", "#1a73e8", "#10a37f", "#d97757", "#111827", "#ff6a00", "#3b5bdb", "#8b5cf6", "#14b8a6", "#f59e0b", "#10a37f"];
const TOOLS = ["读取当前页", "课程大纲", "读取指定页面", "全文检索", "闪卡检索", "笔记图片", "联网搜索", "联网图片", "HTML 演示", "SVG 绘图", "AI 生图", "结构化出题", "长文档撰写", "取回演示全文", "技能", "记忆提议", "沉淀笔记", "沉淀闪卡", "改写笔记", "项目文件", "项目切片"];
const THEMES = ["默认 · 浅色", "彩色 · 浅色", "Anthropic · 浅色", "iOS · 浅色", "Codex · 浅色", "Anthropic · 深色", "默认 · 深色", "自定义 · 宋体"];
const CARD = [374, 204, 660, 558]; // flashcard rect in UI css px

// Each shot: t0, t1, src(t), zoom keys [[t, [fx, fy, z]]] in UI css px (1600×900)
const SHOTS = [
  { t0: 33.0, t1: 35.0, zh: "读到哪，问到哪", en: "highlight anything · ask instantly",
    src: (t) => {
      if (t < 33.3) return `assets/seq/studio/${pad(0)}.jpg`;
      if (t < 33.85) return `assets/seq/studio/${pad(1 + Math.floor(seg(t, 33.3, 33.85) * 11.99))}.jpg`;
      if (t < 34.15) return `assets/seq/studio/${pad(13)}.jpg`;
      return `assets/seq/studio/${pad(Math.min(163, 15 + Math.floor(seg(t, 34.15, 35.0) * 150)))}.jpg`;
    },
    zoom: [[33.0, [720, 250, 1.55]], [33.95, [700, 230, 1.7]], [34.35, [1300, 420, 1.45]], [35.0, [1330, 470, 1.5]]] },
  { t0: 35.0, t1: 36.0, zh: "一搜，贯通全科", en: "search every subject at once",
    src: (t) => (t < 35.2 ? "assets/lo/gs-open.jpg" : `assets/lo/gs-${Math.min(5, Math.floor(seg(t, 35.2, 35.95) * 6))}.jpg`),
    zoom: [[35.0, [800, 380, 1.2]], [36.0, [800, 420, 1.38]]] },
  { t0: 36.0, t1: 37.5, zh: "复习卡片，翻面即记", en: "flashcards · flip, recall, remember", flip: true,
    src: () => "assets/seq/cards/0000.jpg",
    zoom: [[36.0, [704, 360, 1.7]], [37.5, [704, 370, 1.82]]] },
  { t0: 37.5, t1: 38.5, zh: "学完，马上测", en: "learn it · then test it",
    src: (t) => (t < 38.0 ? "assets/lo/quiz-a.jpg" : "assets/lo/quiz-b.jpg"),
    zoom: [[37.5, [560, 330, 1.45]], [38.5, [560, 380, 1.55]]] },
  { t0: 38.5, t1: 40.0, zh: "公式，可以上手拖", en: "formulas you can touch",
    src: (t) => `assets/seq/inter/${pad(Math.min(40, Math.floor(seg(t, 38.5, 40.0) * 41)))}.jpg`,
    zoom: [[38.5, [1340, 330, 1.8]], [40.0, [1340, 380, 1.95]]] },
  { t0: 40.0, t1: 41.0, zh: "每一节课，一字不落", en: "every lecture, word for word",
    src: () => "assets/lo/bio-lec.jpg",
    zoom: [[40.0, [560, 260, 1.5]], [41.0, [560, 420, 1.55]]] },
  { t0: 41.0, t1: 42.0, zh: "每一章，写成详解", en: "every chapter, explained in depth",
    src: (t) => (t < 41.5 ? "assets/lo/anat-detail.jpg" : "assets/lo/bio-detail.jpg"),
    zoom: [[41.0, [560, 300, 1.4]], [42.0, [560, 360, 1.5]]] },
  { t0: 42.0, t1: 43.5, zh: "六大系列模型，随手切换", en: "every model family · one click away", chips: "models",
    src: (t) => `assets/seq/models/${pad(t < 42.25 ? 0 : 1 + Math.min(5, Math.floor(seg(t, 42.25, 43.45) * 6)))}.jpg`,
    zoom: [[42.0, [970, 330, 1.55]], [43.5, [960, 330, 1.72]]] },
  { t0: 43.5, t1: 45.0, zh: "21 种工具，Agent 自己会用", en: "21 tools the agent knows how to use", chips: "tools",
    src: (t) => (t < 43.9 ? "assets/shots/plus-menu.jpg" : `assets/seq/tools/${pad(Math.min(24, Math.floor(seg(t, 43.9, 44.95) * 25)))}.jpg`),
    zoom: [[43.5, [780, 240, 2.1]], [43.89, [780, 250, 2.2]], [43.9, [880, 445, 1.3]], [45.0, [880, 445, 1.38]]] },
  { t0: 45.0, t1: 46.5, zh: "六套主题，一键换装", en: "six themes · one tap", themes: true,
    src: (t) => (t < 45.25 ? "assets/seq/themes/picker-0.jpg" : t < 45.5 ? "assets/seq/themes/picker-2.jpg" : `assets/seq/themes/page-${Math.min(7, Math.floor(seg(t, 45.5, 46.5) * 8))}.jpg`),
    zoom: [[45.0, [884, 520, 1.6]], [45.49, [884, 520, 1.7]], [45.5, [800, 450, 1.0]], [46.5, [800, 450, 1.08]]] },
  { t0: 46.5, t1: 47.0, zh: "你的每一门课", en: "every course you take",
    src: () => "assets/lo/home-hover.jpg",
    zoom: [[46.5, [560, 450, 1.3]], [47.0, [560, 450, 1.1]]] },
];
const GAP = 1900;
const SW = 1380, SH = SW * 9 / 16;

// chip slots around the screen, away from the bottom-left label block
function chipSlots(n, seed) {
  const r = rng(seed); const out = [];
  // top strip, right column, left column, bottom-right strip (the label owns the bottom-left)
  const bands = [[160, 1760, 92, 170], [1540, 1800, 210, 870], [110, 430, 190, 600], [1080, 1780, 900, 1000]];
  let guard = 0;
  while (out.length < n && guard++ < 20000) {
    const b = bands[out.length % bands.length];
    const x = lerp(b[0], b[1], r()), y = lerp(b[2], b[3], r());
    if (out.every((p) => Math.abs(p[0] - x) > 230 || Math.abs(p[1] - y) > 60)) out.push([x, y]);
  }
  while (out.length < n) out.push([200 + (out.length % 6) * 260, 120 + Math.floor(out.length / 6) * 70]);
  return out;
}

export class Montage {
  constructor(parent) {
    this.root = el("div", { class: "layer", style: { display: "none", background: "radial-gradient(ellipse at 60% 40%, #ffffff 0%, #eef2f8 55%, #e2e8f2 100%)" } }, parent);
    this.grid = el("div", { class: "layer", style: { backgroundImage: "linear-gradient(rgba(40,60,120,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(40,60,120,0.07) 1px, transparent 1px)", backgroundSize: "80px 80px", maskImage: "radial-gradient(ellipse at 50% 50%, #000 10%, transparent 70%)", WebkitMaskImage: "radial-gradient(ellipse at 50% 50%, #000 10%, transparent 70%)" } }, this.root);
    this.view = el("div", { class: "layer", style: { perspective: "2200px", perspectiveOrigin: "50% 45%" } }, this.root);
    this.world = el("div", { class: "abs", style: { left: "0", top: "0", width: "1920px", height: "1080px", transformStyle: "preserve-3d" } }, this.view);
    this.screens = SHOTS.map((s, i) => {
      const card = el("div", { class: "abs", style: { left: `${960 - SW / 2}px`, top: `${540 - SH / 2}px`, width: `${SW}px`, height: `${SH}px`, borderRadius: "22px", overflow: "hidden", background: "#ffffff", boxShadow: "0 60px 120px -40px rgba(20,30,70,0.38), 0 0 0 1px rgba(20,30,60,0.08)", backfaceVisibility: "hidden" } }, this.world);
      const img = el("img", { class: "abs", style: { left: "0", top: "0", transformOrigin: "0 0", width: `${SW}px`, height: `${SH}px` } }, card);
      let flip = null;
      if (s.flip) {
        const box = el("div", { class: "abs", style: { left: "0", top: "0", transformStyle: "preserve-3d" } }, card);
        const face = (src, back) => el("img", { src, class: "abs", style: { left: "0", top: "0", width: "100%", height: "100%", backfaceVisibility: "hidden", borderRadius: "14px", boxShadow: "0 18px 40px rgba(30,20,60,0.18)", transform: back ? "rotateY(180deg)" : "none" } }, box);
        flip = { box, faces: { A: [face("assets/flip-A-front.jpg"), face("assets/flip-A-back.jpg", true)], B: [face("assets/flip-B-front.jpg"), face("assets/flip-B-back.jpg", true)] } };
      }
      const shade = el("div", { class: "layer", style: { width: "100%", height: "100%", background: "#eef2f8", opacity: 0 } }, card);
      return { s, i, card, img, shade, flip, last: null };
    });
    // chips (models / tools) and theme badge
    this.chipLayer = el("div", { class: "layer" }, this.root);
    const mkChip = (text, dot) => {
      const c = el("div", { class: "abs sans", style: { padding: "12px 20px 12px 16px", borderRadius: "999px", background: "rgba(255,255,255,0.97)", border: "1px solid rgba(20,30,60,0.10)", boxShadow: "0 14px 34px rgba(25,35,80,0.16)", fontSize: "24px", fontWeight: "700", color: "#0e1219", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "10px", opacity: 0 } }, this.chipLayer);
      c.innerHTML = `<span style="width:12px;height:12px;border-radius:50%;background:${dot};display:inline-block"></span>${text}`;
      return c;
    };
    const ms = chipSlots(MODELS.length, 11), ts = chipSlots(TOOLS.length, 29);
    this.chips = {
      models: MODELS.map((m, i) => ({ el: mkChip(m, MODEL_DOTS[i]), xy: ms[i], t: 42.12 + i * 0.1 })),
      tools: TOOLS.map((m, i) => ({ el: mkChip(m, i % 3 === 0 ? "#2f5bea" : i % 3 === 1 ? "#e0523a" : "#10a37f"), xy: ts[i], t: 43.56 + i * 0.066 })),
    };
    for (const k of ["models", "tools"]) for (const c of this.chips[k]) ev(c.t, "data");
    this.themeBadge = el("div", { class: "abs", style: { left: "960px", top: "92px", padding: "14px 28px", borderRadius: "999px", background: "#0e1219", color: "#fff", fontFamily: '"Inter","Noto Sans SC"', fontSize: "30px", fontWeight: "800", letterSpacing: "0.04em", whiteSpace: "nowrap", boxShadow: "0 16px 40px rgba(14,18,25,0.3)", opacity: 0 } }, this.root);

    this.labelShade = el("div", { class: "layer", style: { background: "radial-gradient(ellipse 900px 420px at 18% 88%, rgba(246,248,252,0.95) 0%, rgba(246,248,252,0.7) 45%, rgba(246,248,252,0) 100%)" } }, this.root);
    this.label = el("div", { class: "abs", style: { left: "96px", top: "760px" } }, this.root);
    this.idx = el("div", { class: "mono", style: { fontSize: "20px", letterSpacing: "0.3em", color: "#2f5bea" } }, this.label);
    this.title = el("div", { class: "sans", style: { fontSize: "88px", fontWeight: "900", color: "#0e1219", letterSpacing: "0.01em", lineHeight: "1.15", marginTop: "10px", textShadow: "0 2px 30px rgba(255,255,255,0.95)", whiteSpace: "nowrap" } }, this.label);
    this.sub = el("div", { class: "inter", style: { fontSize: "20px", letterSpacing: "0.3em", color: "rgba(20,28,48,0.58)", marginTop: "12px", textTransform: "uppercase" } }, this.label);
    this.ticks = el("div", { class: "abs", style: { left: "96px", top: "712px", display: "flex", gap: "8px" } }, this.root);
    this.tickEls = SHOTS.map(() => el("div", { style: { width: "30px", height: "4px", borderRadius: "4px", background: "rgba(20,30,60,0.15)" } }, this.ticks));
    this.titleCache = -1;
    for (const s of SHOTS.slice(1)) ev(s.t0 - 0.12, "whoosh");
    ev(41.5, "cut"); ev(38.0, "cut");
    ev(36.2, "cardflip"); ev(36.75, "cut"); ev(36.95, "cardflip");
    for (let i = 1; i <= 6; i++) ev(42.25 + (i - 1) * 0.2, "tick-soft");
    ev(45.25, "tick"); for (let i = 0; i < 8; i++) ev(45.5 + i * 0.125, "tick");
    this.ready = Promise.resolve();
  }
  camX(t) {
    let x = 0;
    for (let i = 1; i < SHOTS.length; i++) x += E.inOutExpo(seg(t, SHOTS[i].t0 - 0.2, SHOTS[i].t0 + 0.12));
    return x;
  }
  flipState(t) {
    // A: front → flip → back; B slides in → flip → back
    if (t < 36.75) return { card: "A", rot: 180 * E.inOutCubic(seg(t, 36.2, 36.5)), pop: 0 };
    return { card: "B", rot: 180 * E.inOutCubic(seg(t, 36.95, 37.25)), pop: 1 - E.outCubic(seg(t, 36.75, 36.9)) };
  }
  async render(t, frame) {
    const on = t >= 32.98 && t < 47.1 + LATE;
    this.root.style.display = on ? "" : "none";
    if (!on) return;
    const cx = this.camX(t);
    const vel = (this.camX(t + 1 / 60) - cx) * 60;
    const recede = ease(t, 46.95, 47.7, E.inOutCubic);
    const intro = ease(t, 33.0, 33.5, E.outCubic);
    this.world.style.transform = `translateZ(${(-900 * recede - 500 * (1 - intro)).toFixed(1)}px) rotateY(${(-4 + 3 * recede).toFixed(2)}deg) translateX(120px)`;
    this.world.style.filter = recede > 0.01 ? `blur(${(recede * 9).toFixed(2)}px) opacity(${(1 - 0.55 * recede).toFixed(3)})` : Math.abs(vel) > 0.5 ? `blur(${Math.min(10, Math.abs(vel) * 0.9).toFixed(2)}px)` : "none";
    const loads = [];
    for (const sc of this.screens) {
      const d = sc.i - cx;
      const vis = Math.abs(d) < 1.6;
      sc.card.style.display = vis ? "" : "none";
      if (!vis) continue;
      const x = d * GAP * 0.62, ang = clamp(d, -1, 1) * -38, z = -Math.abs(d) * 520;
      sc.card.style.transform = `translate3d(${x.toFixed(1)}px, 0px, ${z.toFixed(1)}px) rotateY(${ang.toFixed(2)}deg)`;
      sc.shade.style.opacity = clamp(Math.abs(d) * 0.7).toFixed(3);
      const tt = clamp(t, sc.s.t0, sc.s.t1 - 1e-3);
      const src = sc.s.src(tt);
      if (src !== sc.last) { sc.img.src = src; sc.last = src; loads.push(sc.img.decode().catch(() => {})); }
      const [fx, fy, zz] = track(sc.s.zoom, tt);
      const iw = SW * zz, ih = SH * zz;
      let ix = SW / 2 - (fx / 1600) * iw, iy = SH / 2 - (fy / 900) * ih;
      ix = clamp(ix, SW - iw, 0); iy = clamp(iy, SH - ih, 0);
      sc.img.style.width = `${iw.toFixed(1)}px`; sc.img.style.height = `${ih.toFixed(1)}px`;
      sc.img.style.transform = `translate(${ix.toFixed(2)}px, ${iy.toFixed(2)}px)`;
      if (sc.flip) {
        const k = iw / 1600;
        const st = this.flipState(tt);
        const bw = CARD[2] * k, bh = CARD[3] * k;
        Object.assign(sc.flip.box.style, { width: `${bw.toFixed(1)}px`, height: `${bh.toFixed(1)}px` });
        const lift = Math.sin(Math.PI * st.rot / 180);
        sc.flip.box.style.transform = `translate(${(ix + CARD[0] * k + st.pop * 90).toFixed(1)}px, ${(iy + CARD[1] * k - lift * 14).toFixed(1)}px) perspective(1800px) rotateY(${st.rot.toFixed(2)}deg) scale(${(1 + 0.05 * lift).toFixed(3)})`;
        sc.flip.box.style.opacity = (1 - st.pop).toFixed(3);
        for (const [key, faces] of Object.entries(sc.flip.faces)) for (const f of faces) f.style.display = key === st.card ? "" : "none";
      }
    }
    await Promise.all(loads);
    // chips
    for (const [key, list] of Object.entries(this.chips)) {
      const s = SHOTS.find((x) => x.chips === key);
      const out = ease(t, s.t1 - 0.18, s.t1 + 0.02, E.inCubic);
      for (const c of list) {
        const p = E.outBack(seg(t, c.t, c.t + 0.22));
        const vis = t >= c.t && t < s.t1 + 0.05;
        c.el.style.display = vis ? "" : "none";
        if (!vis) continue;
        const [x, y] = c.xy;
        c.el.style.opacity = (clamp(p * 2) * (1 - out)).toFixed(3);
        c.el.style.transform = `translate(${(x - 90).toFixed(1)}px, ${(y + (1 - clamp(p)) * 18 - out * 30).toFixed(1)}px) scale(${lerp(0.6, 1, clamp(p, 0, 1.2)).toFixed(3)})`;
      }
    }
    // theme badge
    const tb = t >= 45.0 && t < 46.5;
    this.themeBadge.style.opacity = tb ? (ease(t, 45.0, 45.12) * (1 - ease(t, 46.4, 46.5))).toFixed(3) : "0";
    if (tb) {
      const i = t < 45.5 ? (t < 45.25 ? 0 : 2) : Math.min(7, Math.floor(seg(t, 45.5, 46.5) * 8));
      this.themeBadge.textContent = THEMES[i];
      const pop = 1 + 0.08 * (1 - seg(t, t < 45.5 ? (t < 45.25 ? 45.0 : 45.25) : 45.5 + i * 0.125, (t < 45.5 ? (t < 45.25 ? 45.0 : 45.25) : 45.5 + i * 0.125) + 0.1));
      this.themeBadge.style.transform = `translate(-50%, 0) scale(${pop.toFixed(3)})`;
    }
    // label
    let cur = 0; for (let i = 0; i < SHOTS.length; i++) if (t >= SHOTS[i].t0 - 0.05) cur = i;
    const s = SHOTS[cur];
    if (this.titleCache !== cur) {
      this.titleCache = cur;
      this.idx.textContent = `${String(cur + 1).padStart(2, "0")} / ${String(SHOTS.length).padStart(2, "0")}`;
      this.title.innerHTML = [...s.zh].map((c) => `<span class="char">${c === " " ? "&nbsp;" : c}</span>`).join("");
      this.sub.textContent = s.en;
    }
    const spans = this.title.children;
    const lt = t - (s.t0 - 0.05);
    for (let k = 0; k < spans.length; k++) {
      const p = E.outCubic(clamp((lt - k * 0.022) / 0.26));
      const out = cur === SHOTS.length - 1 ? 0 : E.inCubic(clamp((t - (s.t1 - 0.12)) / 0.12));
      spans[k].style.opacity = (p * (1 - out)).toFixed(3);
      spans[k].style.transform = `translateY(${((1 - p) * 40 - out * 20).toFixed(1)}px)`;
      spans[k].style.filter = p < 0.99 || out > 0 ? `blur(${((1 - p) * 10 + out * 8).toFixed(1)}px)` : "none";
    }
    const lo = 1 - recede;
    this.label.style.opacity = lo.toFixed(3);
    this.labelShade.style.opacity = lo.toFixed(3);
    this.ticks.style.opacity = lo.toFixed(3);
    this.sub.style.opacity = E.outCubic(clamp((lt - 0.12) / 0.3)).toFixed(3);
    this.tickEls.forEach((k, i) => { k.style.background = i < cur ? "rgba(47,91,234,0.6)" : i === cur ? "#0e1219" : "rgba(20,30,60,0.15)"; k.style.width = i === cur ? "60px" : "30px"; });
    this.grid.style.transform = `translateX(${(-cx * 160) % 80}px)`;
    this.root.style.opacity = (1 - ease(t, 46.9 + LATE, 47.05 + LATE)).toFixed(3);
  }
}
