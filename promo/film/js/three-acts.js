// Act IV — The Thread. The four cited sources lift out of the answer, unfold into the real
// textbook pages, and a single line of light stitches the causal chain across them.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { el, clamp, seg, E, ease, lerp, rng, ev, noise1, W, H } from "./core.js";
import { WIN_FULL } from "./split.js";

const FOV = 35;
const D = (H / 2) / Math.tan((FOV / 2) * Math.PI / 180); // 1 world unit == 1px at z=0
const T0 = 24.0, T1 = 33.05;

// UI plane (matches the DOM window at the end of Act III)
const UI = { w: WIN_FULL.w, h: WIN_FULL.h, x: WIN_FULL.cx - W / 2, y: -(WIN_FULL.cy - H / 2) };
const UIK = UI.w / 1600;
// source cards in UI css px [x, y, w, h]
const CARDS = [
  { rect: [1297, 105, 281, 111], img: "assets/card1.jpg", page: 1 },
  { rect: [1297, 223, 281, 95], img: "assets/card2.jpg", page: 3 },
  { rect: [1297, 325, 281, 80], img: "assets/card3.jpg", page: 2 },
  { rect: [1297, 412, 281, 68], img: "assets/card4.jpg", page: 0 },
];
const PS = 0.8; // page css px → world
const PAGES = [
  { img: "assets/shots/src-anat-pancreas.png", pos: [-560, 250, -900], ry: 0.3 },
  { img: "assets/shots/src-histo-islet.png", pos: [600, -40, -2250], ry: -0.28 },
  { img: "assets/shots/src-bio-gng.png", pos: [-600, -240, -3600], ry: 0.26 },
  { img: "assets/shots/src-bio-cause.png", pos: [600, 60, -4950], ry: -0.26 },
  { img: "assets/shots/src-bio-ketone.png", pos: [0, -100, -6300], ry: 0.0 },
];
// nodes: page index, css rect of highlighted text, label, tag, time
const NODES = [
  { p: 0, r: [864, 160, 128, 19], zh: "胰 · 横卧腹后壁", tag: "[4] 系统解剖学 · 消化腺", t: 25.95 },
  { p: 1, r: [601, 328, 293, 19], zh: "B 细胞受损 → 胰岛素不足", tag: "[1] 组织学与胚胎学 · 胰岛", t: 26.95 },
  { p: 2, r: [416, 390, 176, 19], zh: "脂肪分解增强", tag: "[3] 生物化学 · 糖异生", t: 27.95 },
  { p: 3, r: [624, 96, 96, 19], zh: "草酰乙酸减少", tag: "[2] 生物化学 · 甘油三酯代谢", t: 28.85 },
  { p: 3, r: [391, 125, 64, 19], zh: "乙酰 CoA 大量堆积 → 酮体", tag: "进不了三羧酸循环", t: 29.35 },
  { p: 4, r: [624, 425, 177, 19], zh: "丙酮经肺呼出 · 烂苹果味", tag: "[2] 酮症酸中毒", t: 30.35, final: true },
];

function pageLocal(r) { // css rect center → page-local world coords
  return new THREE.Vector3((r[0] + r[2] / 2 - 800) * PS, -(r[1] + r[3] / 2 - 450) * PS, 0);
}
function roundedAlpha(w, h, rad) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff";
  g.beginPath(); g.roundRect(0, 0, w, h, rad); g.fill();
  return new THREE.CanvasTexture(c);
}
function shadowTex() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 300;
  const g = c.getContext("2d"); g.filter = "blur(18px)"; g.fillStyle = "rgba(20,30,60,0.55)";
  g.beginPath(); g.roundRect(40, 40, 432, 220, 16); g.fill();
  return new THREE.CanvasTexture(c);
}
function glowTex(inner = "rgba(255,255,255,1)", mid = "rgba(140,190,255,0.5)") {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, mid); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
function ringTex() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"); g.strokeStyle = "#fff"; g.lineWidth = 6; g.shadowColor = "#fff"; g.shadowBlur = 16;
  g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.stroke(); return new THREE.CanvasTexture(c);
}

export class Stage3D {
  constructor(parent) {
    this.root = el("div", { class: "layer", style: { display: "none" } }, parent);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1); this.renderer.setSize(W, H);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.root.appendChild(this.renderer.domElement);
    this.labels = el("div", { class: "layer" }, this.root);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color("#eef1f6");
    scene.fog = new THREE.FogExp2("#eef1f6", 0.00009);
    this.camera = new THREE.PerspectiveCamera(FOV, W / H, 1, 20000);
    this.camera.position.set(0, 0, D);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.composer.addPass(new OutputPass());

    const loader = new THREE.TextureLoader();
    const tex = (src) => new Promise((res) => loader.load(src, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }));
    const r = rng(5);

    // dust particles
    const N = 1800, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (r() - 0.5) * 6000; pos[i * 3 + 1] = (r() - 0.5) * 3600; pos[i * 3 + 2] = 1200 - r() * 9000; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ size: 9, map: glowTex("rgba(255,255,255,0.9)", "rgba(150,190,255,0.25)"), transparent: true, depthWrite: false, color: new THREE.Color(0.35, 0.42, 0.62), opacity: 0.35 }));
    scene.add(this.dust);

    this.glow = glowTex(); this.ring = ringTex(); this.shadow = shadowTex();
    this.ready = (async () => {
      const uiT = await tex("assets/seq/agent/0168.jpg");
      this.uiMat = new THREE.MeshBasicMaterial({ map: uiT, alphaMap: roundedAlpha(1760, 990, 18), transparent: true });
      this.ui = new THREE.Mesh(new THREE.PlaneGeometry(UI.w, UI.h), this.uiMat);
      this.ui.position.set(UI.x, UI.y, 0); scene.add(this.ui);
      this.pages = [];
      for (const P of PAGES) {
        const t = await tex(P.img);
        const g = new THREE.Group(); g.position.set(...P.pos); g.rotation.y = P.ry;
        const mat = new THREE.MeshBasicMaterial({ map: t, alphaMap: roundedAlpha(1600, 900, 14), transparent: true, opacity: 0 });
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(1600 * PS * 1.19, 900 * PS * 1.36), new THREE.MeshBasicMaterial({ map: this.shadow, transparent: true, opacity: 0, depthWrite: false }));
        sh.position.set(0, -26, -6); g.add(sh);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1600 * PS, 900 * PS), mat); g.add(m);
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1600 * PS, 900 * PS)), new THREE.LineBasicMaterial({ color: new THREE.Color(0.62, 0.69, 0.82), transparent: true, opacity: 0 }));
        edge.position.z = 1; g.add(edge);
        scene.add(g); this.pages.push({ g, mat, edge, P, sh });
      }
      this.cards = [];
      for (const C of CARDS) {
        const t = await tex(C.img);
        const [x, y, w, h] = C.rect;
        const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0 });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w * UIK, h * UIK), mat);
        const start = new THREE.Vector3(UI.x + (x + w / 2 - 800) * UIK, UI.y - (y + h / 2 - 450) * UIK, 0.5);
        scene.add(m); this.cards.push({ m, mat, start, C, w: w * UIK, h: h * UIK });
      }
      this.nodes = NODES.map((n, idx) => {
        const pg = this.pages[n.p];
        pg.g.updateMatrixWorld(true);
        const local = pageLocal(n.r); local.z = 6;
        const world = local.clone().applyMatrix4(pg.g.matrixWorld);
        const hw = n.r[2] * PS / 2 + 14, hh = n.r[3] * PS / 2 + 10;
        const box = new THREE.Group(); box.position.copy(local); pg.g.add(box);
        const col = n.final ? new THREE.Color(0xe0523a) : new THREE.Color(0x2f5bea);
        const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-hw, -hh, 0), new THREE.Vector3(hw, -hh, 0), new THREE.Vector3(hw, hh, 0), new THREE.Vector3(-hw, hh, 0)]), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0 }));
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hh * 2), new THREE.MeshBasicMaterial({ color: n.final ? 0xff6a4a : 0x5a8cff, transparent: true, opacity: 0, depthWrite: false }));
        box.add(fill); box.add(outline);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: n.final ? new THREE.Color(0xe0523a) : new THREE.Color(0x2f5bea), transparent: true, depthWrite: false, opacity: 0 }));
        spr.position.copy(world); scene.add(spr);
        const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ring, color: n.final ? new THREE.Color(0xe0523a) : new THREE.Color(0x2f5bea), transparent: true, depthWrite: false, opacity: 0 }));
        ring.position.copy(world); scene.add(ring);
        const lab = el("div", { class: "abs", style: { left: "0", top: "0", padding: "14px 20px 14px 18px", borderRadius: "14px", background: "rgba(255,255,255,0.96)", border: `1.5px solid ${n.final ? "rgba(224,82,58,0.85)" : "rgba(47,91,234,0.55)"}`, boxShadow: `0 16px 44px rgba(25,35,80,0.2), 0 0 26px ${n.final ? "rgba(255,110,80,0.25)" : "rgba(90,140,255,0.18)"}`, whiteSpace: "nowrap", opacity: 0 } }, this.labels);
        lab.innerHTML = `<div class="inter" style="font-size:15px;font-weight:600;letter-spacing:0.08em;color:${n.final ? "#e0523a" : "#2f5bea"}">${n.tag}</div><div class="sans" style="font-size:${n.final ? 40 : 32}px;font-weight:800;color:#0e1219;margin-top:6px">${n.zh}</div>`;
        ev(n.t, n.final ? "node-final" : "node", { i: idx });
        return { n, world, outline, fill, spr, ring, lab, box };
      });
      const first = this.nodes[0].world.clone();
      const last = this.nodes[this.nodes.length - 1].world.clone();
      const pts = [first.clone().add(new THREE.Vector3(-1900, 800, 100)), first.clone().add(new THREE.Vector3(-700, 300, 120)), ...this.nodes.map((n) => n.world.clone()), last.clone().add(new THREE.Vector3(300, 700, -900))];
      this.nodeParam = this.nodes.map((_, i) => (i + 2) / (pts.length - 1));
      this.curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
      const M = 1400;
      this.tube = new THREE.TubeGeometry(this.curve, M, 3.2, 8, false);
      this.tubeM = M;
      this.thread = new THREE.Mesh(this.tube, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2f5bea) }));
      scene.add(this.thread);
      this.glowTube = new THREE.TubeGeometry(this.curve, M, 13, 8, false);
      this.threadGlow = new THREE.Mesh(this.glowTube, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7ea2ff), transparent: true, opacity: 0.22, depthWrite: false }));
      scene.add(this.threadGlow);
      // TubeGeometry samples by arc length; build a lookup from index-space param → arc fraction
      const S = 3000; this.cum = [0]; let prev = this.curve.getPoint(0), tot = 0;
      for (let i = 1; i <= S; i++) { const p = this.curve.getPoint(i / S); tot += p.distanceTo(prev); this.cum.push(tot); prev = p; }
      this.total = tot;
      this.head = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: new THREE.Color(0x2f5bea), transparent: true, depthWrite: false }));
      this.head.scale.set(150, 150, 1); scene.add(this.head);
      this.renderer.compile(scene, this.camera);
    })();
  }
  captions() {
    return [
      { t0: 26.1, t1: 28.75, style: "darkSm", x: 960, y: 985, zh: "不只给答案——把[因果]，一环一环接上。", en: "not just an answer — every link of the why", shadow: "0 2px 18px rgba(255,255,255,1), 0 0 30px rgba(255,255,255,0.9)" },
      { t0: 31.15, t1: 32.75, style: "heroDark", x: 960, y: 520, zh: "每一句，都回到你的[课本]。", en: "every sentence traces back to your own textbooks", accent: "#2f5bea", shadow: "0 2px 30px rgba(255,255,255,1), 0 0 60px rgba(255,255,255,0.9)", zhFont: '900 84px "Noto Serif SC"' },
    ];
  }
  arcFrac(s) { const i = clamp(s) * (this.cum.length - 1); const a = Math.floor(i), b = Math.min(a + 1, this.cum.length - 1); return lerp(this.cum[a], this.cum[b], i - a) / this.total; }
  progressAt(t) {
    const keys = [[25.3, 0], [25.95, this.nodeParam[0]], ...this.nodes.slice(1).map((n, i) => [n.n.t, this.nodeParam[i + 1]]), [31.6, 1]];
    if (t <= keys[0][0]) return 0;
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], E.inOutQuad(seg(t, keys[i - 1][0], keys[i][0])));
    return 1;
  }
  cameraAt(t) {
    const pageView = (i, dist, off = [0, 0]) => {
      const n = this.nodes[i]; const pg = this.pages[n.n.p];
      const nrm = new THREE.Vector3(Math.sin(pg.P.ry), 0, Math.cos(pg.P.ry));
      return { pos: n.world.clone().add(nrm.multiplyScalar(dist)).add(new THREE.Vector3(off[0], off[1], 0)), look: n.world.clone() };
    };
    const keys = [
      [23.9, { pos: new THREE.Vector3(0, 0, D), look: new THREE.Vector3(0, 0, 0) }],
      [24.1, { pos: new THREE.Vector3(0, 0, D), look: new THREE.Vector3(0, 0, 0) }],
      [25.1, { pos: new THREE.Vector3(-300, 160, D + 650), look: new THREE.Vector3(120, -20, -400) }],
      [25.95, pageView(0, 1050, [120, -60])],
      [26.95, pageView(1, 1000, [-120, 40])],
      [27.95, pageView(2, 980, [140, 30])],
      [28.85, pageView(3, 950, [-60, -40])],
      [29.35, pageView(4, 900, [80, 30])],
      [30.35, pageView(5, 820, [0, 0])],
      [30.95, pageView(5, 690, [0, 0])],
      [32.4, { pos: new THREE.Vector3(1600, 1000, 2100), look: new THREE.Vector3(0, -40, -3200) }],
      [33.05, { pos: new THREE.Vector3(300, 250, -2400), look: new THREE.Vector3(0, -80, -6300) }],
    ];
    let i = 1; while (i < keys.length - 1 && t > keys[i][0]) i++;
    const [ta, A] = keys[i - 1], [tb, B] = keys[i];
    const fn = i === keys.length - 1 ? E.inExpo : E.inOutCubic;
    const p = fn(seg(t, ta, tb));
    const cam = new THREE.Vector3().lerpVectors(A.pos, B.pos, p);
    // page-to-page moves arc up and back so the camera never slices through a page
    if (i >= 4 && i <= 8) cam.add(new THREE.Vector3(0, 520, 380).multiplyScalar(Math.sin(Math.PI * p)));
    const look = new THREE.Vector3().lerpVectors(A.look, B.look, p);
    const hk = ease(t, 24.1, 25.0);
    cam.x += noise1(t * 0.6, 21) * 14 * hk; cam.y += noise1(t * 0.5, 22) * 10 * hk;
    return { cam, look };
  }
  async render(t, frame) {
    const on = t >= T0 && t < T1;
    this.root.style.display = on ? "" : "none";
    if (!on) return;
    await this.ready;
    const { cam, look } = this.cameraAt(t);
    this.camera.position.copy(cam); this.camera.lookAt(look);
    this.camera.updateMatrixWorld();

    const ui = ease(t, 24.05, 25.3, E.inOutCubic);
    this.ui.position.set(UI.x, UI.y, -ui * 700);
    this.uiMat.opacity = Math.max(0, 1 - 0.8 * ui - 0.2 * ease(t, 25.5, 26.2));
    this.ui.visible = this.uiMat.opacity > 0.01;

    const pageFly = {};
    this.cards.forEach((c, i) => {
      const lift = ease(t, 24.0 + i * 0.06, 24.65 + i * 0.06, E.outCubic);
      const fly = ease(t, 24.9 + i * 0.08, 25.8 + i * 0.08, E.inOutCubic);
      const pg = this.pages[c.C.page];
      const lifted = c.start.clone().add(new THREE.Vector3(-lift * 240 - i * 30, (1.5 - i) * 50 * lift, 260 * lift));
      const p = lifted.clone().lerp(new THREE.Vector3(...pg.P.pos), fly); p.y += Math.sin(fly * Math.PI) * 220;
      const rot = new THREE.Euler(-0.1 * lift * (1 - fly), 0.35 * lift * (1 - fly) + pg.P.ry * fly, 0.03 * (i - 1.5) * lift * (1 - fly));
      // size morphs from card to page; the card texture hands over to the page texture early
      const wNow = lerp(c.w * (1 + 0.3 * lift), 1600 * PS, E.inQuad(fly)), hNow = lerp(c.h * (1 + 0.3 * lift), 900 * PS, E.inQuad(fly));
      c.m.position.copy(p); c.m.rotation.copy(rot); c.m.scale.set(wNow / c.w, hNow / c.h, 1);
      const xf = seg(fly, 0.12, 0.42);
      c.mat.opacity = (t < 24.0 ? 0 : 1) * (1 - xf);
      c.m.visible = c.mat.opacity > 0.01;
      pageFly[c.C.page] = { p, rot, sx: wNow / (1600 * PS), sy: hNow / (900 * PS), o: xf };
    });
    this.pages.forEach((pg, k) => {
      const f = pageFly[k];
      if (f && f.o < 1) {
        pg.g.position.copy(f.p); pg.g.rotation.copy(f.rot); pg.g.scale.set(f.sx, f.sy, 1);
      } else { pg.g.position.set(...pg.P.pos); pg.g.rotation.set(0, pg.P.ry, 0); pg.g.scale.set(1, 1, 1); }
      const o = f ? (t < 24.9 ? 0 : f.o) : ease(t, 28.9, 29.3);
      pg.mat.opacity = o; pg.g.visible = o > 0.01;
      pg.edge.material.opacity = o * 0.8;
      pg.sh.material.opacity = o * 0.8;
    });
    this.dust.rotation.y = t * 0.01;
    this.dust.material.opacity = 0.35 * ease(t, 24.2, 25.2);

    const s = this.progressAt(t);
    const count = Math.floor(this.arcFrac(s) * this.tubeM) * 8 * 6;
    this.tube.setDrawRange(0, count); this.glowTube.setDrawRange(0, count);
    this.thread.visible = this.threadGlow.visible = count > 0;
    this.head.position.copy(this.curve.getPoint(s));
    this.head.material.opacity = s > 0 && s < 1 ? 1 : 0;
    const pulse = 1 + 0.2 * Math.sin(t * 20);
    this.head.scale.set(64 * pulse, 64 * pulse, 1);

    const tmp = new THREE.Vector3();
    for (const nd of this.nodes) {
      const k = ease(t, nd.n.t, nd.n.t + 0.35, E.outCubic);
      nd.outline.material.opacity = k; nd.fill.material.opacity = k * 0.22;
      const sc = lerp(0.6, 1, E.outBack(seg(t, nd.n.t, nd.n.t + 0.4))); nd.box.scale.set(sc, sc, 1);
      nd.spr.material.opacity = k;
      const sp = (nd.n.final ? 70 : 44) * (1 + 0.15 * Math.sin(t * 8)); nd.spr.scale.set(sp, sp, 1);
      const rp = seg(t, nd.n.t, nd.n.t + (nd.n.final ? 0.9 : 0.6));
      nd.ring.material.opacity = rp > 0 && rp < 1 ? 0.7 * (1 - rp) : 0;
      const rs = (nd.n.final ? 420 : 240) * E.outCubic(rp) + 40; nd.ring.scale.set(rs, rs, 1);
      tmp.copy(nd.world).project(this.camera);
      const x = (tmp.x * 0.5 + 0.5) * W, y = (-tmp.y * 0.5 + 0.5) * H;
      const lo = k * (1 - ease(t, 31.0, 31.35)) * (tmp.z < 1 ? 1 : 0);
      nd.lab.style.opacity = lo.toFixed(3);
      nd.lab.style.transform = `translate(${(x + 36).toFixed(1)}px, ${(y - 120 + (1 - k) * 20).toFixed(1)}px) scale(${(0.92 + 0.08 * k).toFixed(3)})`;
    }
    this.composer.render();
  }
}
