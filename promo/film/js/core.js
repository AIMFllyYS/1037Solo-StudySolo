// Deterministic motion toolkit: everything is a pure function of time t (seconds).
export const W = 1920, H = 1080, FPS = 60;
export const BPM = 120, BEAT = 60 / BPM;
// Everything after the feature montage (stats, finale) runs this many seconds later than first cut.
export const LATE = 3;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (x) => x * x * (3 - 2 * x);
export const E = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuart: (x) => 1 - Math.pow(1 - x, 4),
  inOutQuart: (x) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2),
  outExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inExpo: (x) => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
  inOutExpo: (x) => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  outBack: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  outElastic: (x) => { const c4 = (2 * Math.PI) / 3; return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1; },
  // Cinematic "power" curve: slow start, violent middle, long soft landing.
  cine: (x) => (x < 0.5 ? 16 * Math.pow(x, 5) : 1 - Math.pow(-2 * x + 2, 5) / 2),
};
export const ease = (t, a, b, fn = E.inOutCubic) => fn(seg(t, a, b));

// Keyframed track: [[t, value, easeFn?], ...]; ease applies on the segment ending at that key.
export function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, fn] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) {
      const p = (fn || E.inOutCubic)(seg(t, t0, t1));
      if (Array.isArray(v0)) return v0.map((x, j) => lerp(x, v1[j], p));
      return lerp(v0, v1, p);
    }
  }
  return keys[keys.length - 1][1];
}

// Seeded PRNG (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash = (n) => { const r = rng(n * 9301 + 49297); return r(); };
export function noise1(x, seed = 1) {
  const i = Math.floor(x), f = x - i;
  const a = hash(i + seed * 1000), b = hash(i + 1 + seed * 1000);
  return lerp(a, b, smooth(f)) * 2 - 1;
}

const SVGNS = "http://www.w3.org/2000/svg";
export function el(tag, attrs = {}, parent) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  if (parent) parent.appendChild(n);
  return n;
}
export function svg(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") n.textContent = v;
    else n.setAttribute(k, v);
  }
  if (parent) parent.appendChild(n);
  return n;
}
export function setAttrs(n, attrs) { for (const k in attrs) n.setAttribute(k, attrs[k]); }

// Hex color helpers
export function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function mixColor(a, b, p) {
  const A = hex2rgb(a), B = hex2rgb(b);
  const c = A.map((x, i) => Math.round(lerp(x, B[i], p)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
export function gradientAt(stops, p) {
  // stops: [[pos, hex], ...]
  if (p <= stops[0][0]) return mixColor(stops[0][1], stops[0][1], 0);
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i][0]) return mixColor(stops[i - 1][1], stops[i][1], seg(p, stops[i - 1][0], stops[i][0]));
  }
  return mixColor(stops[stops.length - 1][1], stops[stops.length - 1][1], 0);
}

// Split text into per-character spans for kinetic typography.
export function charSpans(parent, text, cls = "char") {
  const spans = [];
  for (const ch of text) {
    const s = el("span", { class: cls, text: ch === " " ? " " : ch }, parent);
    spans.push(s);
  }
  return spans;
}

// Visibility helper that avoids layout thrash.
export function show(node, on) { const v = on ? "" : "none"; if (node.style.display !== v) node.style.display = v; }

// Global audio/event log (collected once for the soundtrack).
export const EVENTS = [];
export function ev(t, type, extra = {}) { EVENTS.push({ t: +t.toFixed(4), type, ...extra }); }
