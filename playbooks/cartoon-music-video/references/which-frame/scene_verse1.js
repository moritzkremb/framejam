// verse1 · 7.78-31.00 · POP (cobalt = creator, lime = agent) + PAPER (cream). Call and response, one shot per line,
// hard cut 2 frames before each line's first onset (the type's anticipation lives inside the new shot).
//
// PLAN (onsets from engine/data/lyrics.json, downbeats 7.78 9.70 11.64 13.58 15.52 17.44 19.38 21.32 23.26 25.20 27.12 29.06 31.00)
//  #  cut     look    still                 line / onsets                                    visual (B = behind matte, F = front)
//  0  7.78    COBALT  s03_creator_pop       Make 8.65 · it 8.93 · pop. 9.18                  pre-roll: white comic burst breathing on kicks, sparks from her
//                                                                                            fingertip (F). MAKE smear-slam, IT pop, giant lime POP. with ink
//                                                                                            hard shadow + burst explodes (B) on "pop.".
//  1  10.60   LIME    s04_agent_confused    Which 10.63 · frame? 10.945                      a "?" pops on every frame of the strip he holds (F, tracked);
//                                                                                            the strip continues as a film ribbon scrolling into his hand (B).
//                                                                                            WHICH / FRAME? condensed per-letter stagger, ink / cobalt.
//  2  12.50   COBALT  s05_creator_logo      Make 12.53 · the · logo 13.116 · bigger. 13.366  her blank card becomes a white LOGO box behind her fingers (B),
//                                                                                            it springs bigger on 12.53 / 13.10 / 13.37 / 13.58 / 13.79 with
//                                                                                            Figma handles + a W×H readout; BIGGER. slam (F).
//  3  13.99   LIME    s06_agent_ecu         Which 14.02 · frame? 14.66                       pixel-"?" echo wall (matches his screen) multiplying per beat
//                                                                                            14.54 / 15.04 / 15.52 (B) + screen-shaped echo rings on kicks (B);
//                                                                                            WHICH / FRAME? as tilted ink stickers in agent blue (F).
//  4  15.82   CREAM   s07_creator_squint    Something's 15.85 · off 16.437 · at · like ·     her finger-frame flies out into a viewfinder (frustum hairlines);
//                     (PAPER, cobalt)       three 17.011 · seconds. 17.227                   OFF set crooked + misregistered, a timecode jitters 0:02.7 /
//                                                                                            0:03.? / 0:03.4 on "three", scrub timeline playhead can't settle.
//  5  18.03   LIME    s08_agent_stopwatch   Which 18.06 · second? 18.52                      split-flap seconds board flipping random digits, a red sweep hand
//                                                                                            spins on his stopwatch (F, tracked), dashed lead to the board.
//  6  19.99   COBALT  s09_creator_shrug     No, 20.02 · the 20.303 · other 20.393 · thing.   NO, slams; arrows draw on: THIS? (her hand), THAT? (her shoe),
//                                           20.556                                           THE OTHER THING. pointing out of frame at nothing.
//  7  20.79   LIME    s06 mirrored, ECU     Which 20.82 · thing? 21.095                      WHICH / THING? giant cobalt wide slams behind him (B); his
//                                                                                            mirrored screen gets a corrected pixel "?" (F, tracked).
//  8  21.63   COBALT  s10_creator_jump      Give 21.66 · it 22.059 · more 22.21 · energy.    twin ENERGY meters fill per word and blow their top segments off on
//                                           22.34                                            "energy.", % counter → MAX, lightning out of both hands on kicks,
//                                                                                            camera shake; ENERGY jitter-type with hard shadow.
//  9  23.86   CREAM   s11_creator_apple     Like 23.89 · Apple, 24.358 · but 24.666 ·         "Like Apple," thin + Swiss, the real apple gets a "fig. 1" hairline
//                     (PAPER)               fun. 24.913                                      ring; "BUT FUN." explodes as bouncing multi-colour letters, confetti
//                                                                                            out of the party hat (tracked). No logos.
// 10  25.41   CREAM   s12_creator_blue      Can 25.44 … in 26.36 · blue? 26.48               karaoke line top-left; the roller paints a cobalt band leftwards per
//                                                                                            word behind her (B, drips), on "blue?" the band floods the frame.
// 11  26.635  LIME    s13_agent_swatches    Which 26.668 (held) · blue? 28.16                six swatch chips (#0000FF #1D63C9 #2F54FF #4169E1 #7CC4FF #0047AB)
//                                                                                            fan out of his fan during the held "Which"; BLUE? lands in six
//                                                                                            blues; pixel "?"s orbit his dizzy head.
// 12  28.71   CREAM   s14_creator_smug      I'll 28.74 … see 30.29 · it 30.52                the calm line: soft serif italic word fades, slow drift, dashed
//                                                                                            halo turning above her head (tracked), "NOTE 08 · VAGUE" tag;
//                                                                                            lands on 31.00 with a cobalt full stop.
import { PAL } from "../core.js";
import * as K from "../lib.js";

const COB = PAL.cobalt,
  LIME = PAL.accent,
  CREAM = PAL.cream,
  INK = PAL.ink,
  PURE = PAL.pure,
  AGENT = PAL.agent,
  DEEP = PAL.agentDeep,
  WHITE = PAL.white;
const F = "Archivo";
const STILLS = [
  "s03_creator_pop", "s04_agent_confused", "s05_creator_logo", "s06_agent_ecu", "s07_creator_squint", "s08_agent_stopwatch",
  "s09_creator_shrug", "s06_agent_ecu", "s10_creator_jump", "s11_creator_apple", "s12_creator_blue", "s13_agent_swatches", "s14_creator_smug",
];
const PLACE = [
  { place: { cx: 1450, bottom: 1060, h: 980 } },
  { place: { cx: 470, bottom: 1050, h: 960 } },
  { place: { cx: 560, bottom: 1085, h: 1040 } },
  { place: { cx: 960, bottom: 1085, h: 1050 }, bob: 8 },
  { place: { cx: 1390, bottom: 1085, h: 1035 }, bob: 7 },
  { place: { cx: 430, bottom: 1075, h: 1040 } },
  { place: { cx: 960, bottom: 1070, h: 1010 }, bob: 14 },
  { place: { cx: 1380, bottom: 1470, h: 1520 }, mirror: true, bob: 12 },
  { place: { cx: 960, bottom: 990, h: 930 }, bob: 22, sway: 0.02 },
  { place: { cx: 1430, bottom: 1085, h: 1050 } },
  { place: { cx: 1430, bottom: 1085, h: 1040 } },
  { place: { cx: 400, bottom: 1060, h: 1000 } },
  { place: { cx: 560, bottom: 1085, h: 1035 }, bob: 4, sway: 0.006 },
];
const FIELD = [COB, LIME, COB, LIME, CREAM, LIME, COB, LIME, COB, CREAM, CREAM, LIME, CREAM];
const HEX = ["#0000FF", "#1D63C9", "#2F54FF", "#4169E1", "#7CC4FF", "#0047AB"];
const QP = [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."];

let V = {},
  g,
  g2,
  L = [],
  CUT = [],
  QCOB,
  QINK,
  QAG;

function qCanvas(color) {
  const cv = document.createElement("canvas");
  cv.width = 50;
  cv.height = 70;
  const x = cv.getContext("2d");
  x.fillStyle = color;
  QP.forEach((r, j) => [...r].forEach((ch, i) => ch === "#" && x.fillRect(i * 10 + 1, j * 10 + 1, 8, 8)));
  return cv;
}
// pixel "?" centred at x,y with height h
function qPix(c, cv, x, y, h, rot = 0, a = 1) {
  if (h <= 0.5 || a <= 0.01) return;
  c.save();
  c.globalAlpha = a;
  c.translate(x, y);
  if (rot) c.rotate(rot);
  c.imageSmoothingEnabled = false;
  c.drawImage(cv, (-h * 5) / 14, -h / 2, (h * 5) / 7, h);
  c.restore();
}

// K.puppet's exact layout without drawing, so BACK graphics can track the subject before the plate is drawn
function pup(E, v, t, o) {
  if (o.place) o = { ...o, ...K.placeOpts(v, o.place, o.mirror) };
  const b = E.beat(t);
  const hop = Math.sin(Math.PI * Math.min(1, Math.max(0, b.phase * 1.25))) * (o.bob ?? 10) * (b.inBar % 2 ? 0.6 : 1);
  const z0 = o.zoom ?? 1;
  let z = z0;
  if (o.enter != null) z *= o.enter <= t ? E.popScale(t, o.enter, { from: 0.82, k: 320, z: 0.42 }) : 0;
  z *= 1 + 0.018 * E.pulse("kicks", t, 0.1);
  const bx = v.track?.[0]?.box ?? [0, 0, 1, 1];
  const pu = o.mirror ? 1 - (bx[0] + bx[2]) / 2 : (bx[0] + bx[2]) / 2;
  const px = (o.x ?? 0) + (pu - 0.5) * K.W * (z0 - z),
    py = (o.y ?? 0) + (bx[3] - 0.5) * K.H * (z0 - z);
  const rot = Math.sin(t * Math.PI * 2 * (E.bpm / 60 / 2) + (o.phase ?? 0)) * (o.sway ?? 0.012);
  return { x: px, y: py - hop, zoom: z, rot, mirror: o.mirror, matte: true, feather: 0.08, opacity: 1 };
}

// ---------- small drawing helpers (1080 units)
const T = (E, c, s, x, y, o) => E.drawText(c, s, x, y, o);
function shadowT(E, c, s, x, y, o, d = 12) {
  E.drawText(c, s, x + d * (o.s ?? 1), y + d * (o.s ?? 1), { ...o, color: INK, stroke: 0 });
  E.drawText(c, s, x, y, o);
}
function fitSize(E, c, s, o, maxW) {
  return (o.size * maxW) / E.measure(c, s, o);
}
function burst(c, x, y, r0, r1, n, rot, color, stroke, sx = 1, sy = 1) {
  c.save();
  c.translate(x, y);
  c.scale(sx, sy);
  c.rotate(rot);
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r0 : r1 * (0.86 + 0.14 * ((i * 37) % 5) / 4);
    i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
  c.fillStyle = color;
  c.fill();
  if (stroke) {
    c.lineWidth = 8;
    c.strokeStyle = stroke;
    c.lineJoin = "miter";
    c.stroke();
  }
  c.restore();
}
// hand-drawn arrow from a to b with a bulge, drawn on to progress p
function arrow(c, ax, ay, bx, by, p, { bend = 0.25, color = PURE, w = 7, head = 26 } = {}) {
  if (p <= 0) return;
  const mx = (ax + bx) / 2 - (by - ay) * bend,
    my = (ay + by) / 2 + (bx - ax) * bend;
  const q = (u) => [(1 - u) * (1 - u) * ax + 2 * (1 - u) * u * mx + u * u * bx, (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * my + u * u * by];
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = w;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const [x, y] = q((i / N) * p);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.stroke();
  if (p > 0.85) {
    const [x1, y1] = q(p),
      [x0, y0] = q(p - 0.06);
    const a = Math.atan2(y1 - y0, x1 - x0);
    c.beginPath();
    c.moveTo(x1 + Math.cos(a) * 6, y1 + Math.sin(a) * 6);
    c.lineTo(x1 + Math.cos(a + 2.6) * head, y1 + Math.sin(a + 2.6) * head);
    c.lineTo(x1 + Math.cos(a - 2.6) * head, y1 + Math.sin(a - 2.6) * head);
    c.closePath();
    c.fill();
  }
  c.restore();
}
function bolt(E, c, x, y, ang, len, seed, a = 1) {
  if (a <= 0.02) return;
  c.save();
  c.globalAlpha = a;
  c.beginPath();
  const n = 6,
    dx = Math.cos(ang),
    dy = Math.sin(ang);
  c.moveTo(x, y);
  for (let i = 1; i <= n; i++) {
    const d = (len * i) / n,
      off = (i % 2 ? 1 : -1) * (18 + 26 * E.hash1(seed * 7.3 + i)) * (i < n ? 1 : 0);
    c.lineTo(x + dx * d - dy * off, y + dy * d + dx * off);
  }
  c.lineJoin = "miter";
  c.lineCap = "round";
  c.strokeStyle = INK;
  c.lineWidth = 20;
  c.stroke();
  c.strokeStyle = LIME;
  c.lineWidth = 10;
  c.stroke();
  c.restore();
}
function corners(c, x, y, w, h, len, lw, color) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.lineCap = "square";
  c.beginPath();
  for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    c.moveTo(px + sx * len, py);
    c.lineTo(px, py);
    c.lineTo(px, py + sy * len);
  }
  c.stroke();
  c.restore();
}
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
// stepped spring value: steps [[t, value], ...] (first value at its time), each step springs from the previous one
function stepSpring(E, t, steps, k = 260, z = 0.4) {
  let i = 0;
  while (i + 1 < steps.length && t >= steps[i + 1][0]) i++;
  if (i === 0) return steps[0][1];
  return steps[i - 1][1] + (steps[i][1] - steps[i - 1][1]) * E.spring(t - steps[i][0], k, z);
}

// ---------- shots. X = { E, t, c, o (plate opts), P(uv)->[x,y], W (words of the line), s0 (shot start) }
const SH = [];

// 0 · Make it pop.
SH[0] = {
  back(X) {
    const { E, t, c, W } = X;
    K.fill(c, COB);
    K.dotGrid(c, t, { color: "rgba(255,255,255,0.10)" });
    const pop = W[2];
    const pre = 0.42 + 0.06 * E.pulse("kicks", t, 0.12);
    const bs = t < pop.s - E.LEAD ? pre : E.popScale(t, pop.s, { from: pre, k: 240, z: 0.38 });
    burst(c, 760, 590, 360 * bs, 600 * bs, 14, t * 0.35, PURE, INK, 1.25, 0.62);
    if (t < pop.s - E.LEAD) {
      const ks = 1 + 0.06 * E.pulse("kicks", t, 0.12);
      c.save();
      c.translate(760, 590);
      c.rotate(-0.06);
      c.scale(ks, ks);
      c.fillStyle = INK;
      K.rrect(c, -170, -52, 340, 104, 18);
      c.fill();
      c.fillStyle = LIME;
      c.beginPath();
      c.moveTo(-130, -24);
      c.lineTo(-130, 24);
      c.lineTo(-92, 0);
      c.closePath();
      c.fill();
      E.drawText(c, "v1.mp4", 30, 2, { font: K.MONO, weight: 600, size: 52, color: WHITE });
      c.restore();
    }
    if (t >= pop.s - E.LEAD)
      shadowT(E, c, "POP.", 760, 565, {
        font: F, weight: 900, stretch: "125%", size: 520, tracking: -0.03, color: LIME,
        s: E.popScale(t, pop.s, { from: 1.6, k: 300, z: 0.45 }),
      }, 16);
    const mo = { font: F, weight: 900, stretch: "125%", size: 140, tracking: -0.03, color: PURE };
    if (t >= W[0].s - E.LEAD) E.drawText(c, "MAKE", 388, 168, { ...mo, color: INK });
    K.slam(c, "MAKE", 380, 160, t, W[0].s, mo);
    if (t >= W[1].s - E.LEAD) shadowT(E, c, "IT", 790, 160, { ...mo, s: E.popScale(t, W[1].s, { from: 0.4 }) }, 8);
    T(E, c, "NOTE 01 · FROM: YOU", 120, 1000, { font: K.MONO, weight: 500, size: 24, color: WHITE, align: "left", tracking: 0.08, alpha: 0.85 });
  },
  front(X) {
    const { E, t, c, P, W } = X;
    const [fx, fy] = P([0.83, 0.243]);
    const k = E.pulse("kicks", t, 0.14),
      big = t >= W[2].s - E.LEAD ? Math.exp(-(t - W[2].s) * 5) : 0;
    c.save();
    c.strokeStyle = LIME;
    c.lineCap = "round";
    c.lineWidth = 9;
    for (let i = 0; i < 7; i++) {
      const a = -2.4 + i * 0.42;
      const r0 = 70 + 10 * k,
        r1 = r0 + 30 + 50 * k + 120 * big;
      c.beginPath();
      c.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0);
      c.lineTo(fx + Math.cos(a) * r1, fy + Math.sin(a) * r1);
      c.stroke();
    }
    c.restore();
  },
  theme: "dark",
};

// 1 · Which frame? (film strip)
const STRIP = [[0.333, 0.415], [0.305, 0.515], [0.298, 0.598], [0.298, 0.678], [0.301, 0.755]];
SH[1] = {
  back(X) {
    const { E, t, c, P, W } = X;
    K.fill(c, LIME);
    K.dotGrid(c, t, { color: "rgba(12,12,13,0.08)" });
    // film ribbon continuing out of his strip, scrolling into his hand
    const [sx, sy] = P([0.3, 0.8]);
    c.save();
    c.translate(sx, sy + 40);
    c.rotate(-0.05);
    c.fillStyle = INK;
    c.fillRect(-40, -62, 2100, 124);
    const fw = 150,
      off = (t * 260) % fw;
    for (let i = -1; i < 15; i++) {
      const x = i * fw - off + 60;
      c.fillStyle = PAL.surface3;
      c.fillRect(x, -42, fw - 20, 84);
      c.fillStyle = CREAM;
      for (let h = 0; h < 4; h++) {
        c.fillRect(x + h * 37 + 4, -56, 16, 9);
        c.fillRect(x + h * 37 + 4, 47, 16, 9);
      }
      const n = Math.floor((t * 260) / fw) + i;
      T(E, c, "?", x + 55, 2, { font: F, weight: 900, size: 64, color: LIME });
      T(E, c, "F" + String(((n % 999) + 999) % 999).padStart(3, "0"), x + 112, 30, { font: K.MONO, weight: 500, size: 15, color: PAL.text3 });
    }
    c.restore();
    const o1 = { font: F, weight: 900, stretch: "62%", size: 100, tracking: -0.02, align: "left" };
    const sz = Math.min(fitSize(E, c, "FRAME?", o1, 860), 380);
    const sp = { k: 520, z: 0.42, from: 0 };
    E.drawStagger(c, "WHICH", 940, 330, t, W[0].s - 0.03, { ...o1, size: sz, color: INK, stagger: 0.012, dy: 70, spring: sp });
    E.drawStagger(c, "FRAME?", 940, 640, t, W[1].s - 0.03, { ...o1, size: sz, color: COB, stagger: 0.012, dy: 70, spring: sp });
  },
  front(X) {
    const { E, t, c, P, W, o } = X;
    STRIP.forEach((uv, i) => {
      const [x, y] = P(uv);
      const s = E.popScale(t, W[0].s + i * 0.05, { from: 0, k: 420, z: 0.35 }) * (1 + 0.25 * E.pulse("snares", t, 0.1));
      if (s <= 0.01) return;
      c.save();
      c.translate(x, y);
      c.rotate(-0.15 + 0.12 * i);
      c.scale(s, s);
      c.fillStyle = LIME;
      K.rrect(c, -22 * o.zoom, -24 * o.zoom, 44 * o.zoom, 48 * o.zoom, 8);
      c.fill();
      T(E, c, "?", 0, 2, { font: F, weight: 900, size: 46 * o.zoom, color: INK });
      c.restore();
    });
  },
  theme: "light",
};

// 2 · Make the logo bigger.
SH[2] = {
  back(X) {
    const { E, t, c, P, W } = X;
    K.fill(c, COB);
    K.dotGrid(c, t, { color: "rgba(255,255,255,0.10)" });
    const [x0, y0] = P([0.369, 0.37]),
      [x1, y1] = P([0.4375, 0.49]);
    const bw = x1 - x0,
      bh = y1 - y0,
      cy = (y0 + y1) / 2;
    const s = stepSpring(E, t, [[0, 1], [W[0].s - E.LEAD, 1.8], [13.1 - E.LEAD, 2.9], [W[3].s - E.LEAD, 4.4], [13.58 - E.LEAD, 7], [13.79 - E.LEAD, 10]], 280, 0.36);
    const w = bw * s,
      h = Math.min(bh * s, 1000),
      x = x0,
      y = cy - h / 2;
    // the box (behind her fingers and hair)
    c.save();
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.fillRect(x + 14, y + 14, w, h);
    c.fillStyle = PURE;
    c.fillRect(x, y, w, h);
    c.lineWidth = 5;
    c.strokeStyle = INK;
    c.strokeRect(x, y, w, h);
    c.restore();
    const lx = Math.min(x + w * 0.62, 1500),
      lsz = Math.max(10, Math.min(h * 0.26, (1880 - lx) * 0.45));
    T(E, c, "LOGO", lx, cy + 4, { font: F, weight: 900, stretch: "125%", size: lsz, tracking: -0.03, color: INK });
    // selection handles + Figma-style frame label + size readout
    c.save();
    c.strokeStyle = LIME;
    c.lineWidth = 3;
    c.strokeRect(x - 8, y - 8, w + 16, h + 16);
    for (const [hx, hy] of [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1]]) {
      c.fillStyle = PURE;
      c.fillRect(x - 8 + hx * (w + 16) - 9, y - 8 + hy * (h + 16) - 9, 18, 18);
      c.strokeRect(x - 8 + hx * (w + 16) - 9, y - 8 + hy * (h + 16) - 9, 18, 18);
    }
    c.restore();
    if (t >= W[0].s - E.LEAD)
      T(E, c, "MAKE THE", Math.min(x + w + 8, 1780), Math.max(y - 44, 140), { font: K.FONT, weight: 800, size: 56, color: y - 44 < 140 ? COB : LIME, align: "right", s: E.popScale(t, W[0].s, { from: 0.6 }) });
    const pw = Math.round((w / 1.2) * 1.0),
      ph = Math.round((h / 1.2) * 1.0);
    const inside = y + h + 44 > 930 || x + w > 1780;
    if (inside) T(E, c, `W ${pw} × H ${ph} px`, lx, cy + lsz * 0.8, { font: K.MONO, weight: 500, size: 30, color: COB });
    else T(E, c, `W ${pw} × H ${ph} px`, x + w + 8, y + h + 44, { font: K.MONO, weight: 500, size: 26, color: WHITE, align: "right" });
    X.big = inside;
  },
  front(X) {
    const { E, t, c, W } = X;
    if (t >= W[3].s - E.LEAD)
      shadowT(E, c, "BIGGER.", 1250, 950, {
        font: F, weight: 900, stretch: "62%", size: 260, tracking: -0.02, color: LIME, rot: -0.05,
        s: E.popScale(t, W[3].s, { from: 2.2, k: 320, z: 0.42 }),
      }, 12);
  },
  theme: "dark",
};

// 3 · Which frame? (ECU, ? echo wall)
SH[3] = {
  back(X) {
    const { E, t, c, P, s0 } = X;
    K.fill(c, LIME);
    const lv = [14.54, 15.04, 15.52].filter((b) => t >= b - 0.02).length;
    const tl = [s0, 14.54, 15.04, 15.52][lv];
    const rows = [2, 4, 7, 11][lv];
    const ch = 1080 / rows,
      cw = ch * 0.72,
      cols = Math.ceil(1920 / cw) + 1,
      drift = (t * 30) % ch;
    for (let r = -1; r <= rows; r++)
      for (let q = 0; q < cols; q++) {
        const hsh = E.hash1(r * 31.7 + q * 7.1 + lv * 3.3);
        const sc = E.popScale(t, tl + 0.02 + hsh * 0.14, { from: 0, k: 380, z: 0.4 });
        const x = q * cw + (r % 2 ? cw / 2 : 0) - cw / 2,
          y = r * ch + ch / 2 + drift;
        qPix(c, hsh < 0.18 ? QINK : QCOB, x, y, ch * 0.62 * sc, (hsh - 0.5) * 0.3);
      }
    // echo rings from his screen on kicks
    const [ax, ay] = P([0.34, 0.295]),
      [bx, by] = P([0.635, 0.755]);
    const k = E.last("kicks", t);
    if (k && k.dt < 0.4) {
      const e = E.ease.outCubic(k.dt / 0.4),
        s = 1 + 0.9 * e;
      const cx = (ax + bx) / 2,
        cy = (ay + by) / 2,
        w = (bx - ax) * s,
        h = (by - ay) * s;
      c.save();
      c.globalAlpha = 1 - e;
      c.lineWidth = 10;
      c.strokeStyle = INK;
      K.rrect(c, cx - w / 2, cy - h / 2, w, h, 60 * s);
      c.stroke();
      c.restore();
    }
  },
  front(X) {
    const { E, t, c, W } = X;
    const k = 1 + 0.05 * E.pulse("snares", t, 0.1);
    K.sticker(c, "WHICH", 330, 760, { rot: -0.09, size: 128, bg: INK, fg: AGENT, s: E.popScale(t, W[0].s, { from: 0, k: 360, z: 0.4 }) * k });
    K.sticker(c, "FRAME?", 1560, 320, { rot: 0.07, size: 128, bg: INK, fg: AGENT, s: E.popScale(t, W[1].s, { from: 0, k: 360, z: 0.4 }) * k });
  },
  theme: "light",
};

// 4 · Something's off at like three seconds.
const VF = [100, 150, 740, 520];
const TC = ["0:02.7", "0:03.?", "0:03.4", "0:02.9", "0:03.?", "0:03.1", "0:02.8", "0:03.6"];
SH[4] = {
  back(X) {
    const { E, t, c } = X;
    K.fill(c, CREAM);
    c.save();
    c.fillStyle = "rgba(12,12,13,0.10)";
    for (let x = 100; x < 1920; x += 160) c.fillRect(x, 0, 1, 1080);
    c.restore();
  },
  front(X) {
    const { E, t, c, P, W, s0 } = X;
    const [fx0, fy0] = P([0.675, 0.245]),
      [fx1, fy1] = P([0.835, 0.46]);
    const k = E.ease.outExpo(clamp((t - s0) / 0.3));
    const r = [lerp(fx0, VF[0], k), lerp(fy0, VF[1], k), lerp(fx1 - fx0, VF[2], k), lerp(fy1 - fy0, VF[3], k)];
    // frustum hairlines from her finger frame
    c.save();
    c.strokeStyle = COB;
    c.globalAlpha = 0.55;
    c.lineWidth = 2;
    c.setLineDash([8, 8]);
    c.lineDashOffset = -t * 40;
    c.beginPath();
    c.moveTo(fx0, fy0);
    c.lineTo(r[0], r[1]);
    c.moveTo(fx0, fy1);
    c.lineTo(r[0], r[1] + r[3]);
    c.moveTo(fx1, fy0);
    c.lineTo(r[0] + r[2], r[1]);
    c.stroke();
    c.restore();
    corners(c, fx0, fy0, fx1 - fx0, fy1 - fy0, 22, 5, COB);
    if (k > 0.6) {
      c.save();
      c.fillStyle = "rgba(255,255,255,0.35)";
      c.fillRect(VF[0], VF[1], VF[2], VF[3]);
      c.strokeStyle = "rgba(12,12,13,0.16)";
      c.lineWidth = 1.5;
      c.beginPath();
      for (let i = 1; i < 3; i++) {
        c.moveTo(VF[0] + (VF[2] * i) / 3, VF[1]);
        c.lineTo(VF[0] + (VF[2] * i) / 3, VF[1] + VF[3]);
        c.moveTo(VF[0], VF[1] + (VF[3] * i) / 3);
        c.lineTo(VF[0] + VF[2], VF[1] + (VF[3] * i) / 3);
      }
      c.stroke();
      c.restore();
    }
    corners(c, r[0], r[1], r[2], r[3], 60, 8, INK);
    const mono = { font: K.MONO, weight: 600, size: 32, color: INK, align: "left", tracking: 0.06 };
    if (t >= W[0].s - E.LEAD) T(E, c, "SOMETHING'S", 140, 200, { ...mono, alpha: E.wordAlpha(t, W[0].s, 99) });
    // REC
    c.save();
    c.globalAlpha = Math.floor(t * 3) % 2 ? 1 : 0.25;
    c.fillStyle = PAL.rec;
    c.beginPath();
    c.arc(VF[0] + VF[2] - 120, 198, 11, 0, Math.PI * 2);
    c.fill();
    c.restore();
    T(E, c, "REC", VF[0] + VF[2] - 40, 200, { ...mono, align: "right" });
    if (t >= W[1].s - E.LEAD) {
      const s = E.popScale(t, W[1].s, { from: 1.7, k: 320, z: 0.42 });
      const o = { font: F, weight: 900, stretch: "62%", size: 330, tracking: -0.02, s };
      T(E, c, "OFF", 446, 408, { ...o, color: COB, rot: 0.02 });
      T(E, c, "OFF", 430, 395, { ...o, color: INK, rot: 0.09 });
    }
    if (t >= W[2].s - E.LEAD) T(E, c, "AT", 140, 610, { ...mono, size: 44 });
    if (t >= W[3].s - E.LEAD) T(E, c, "LIKE", 220, 610, { ...mono, size: 44 });
    if (t >= W[4].s - E.LEAD) {
      const i = Math.floor((t - W[4].s) * 11);
      const s = E.popScale(t, W[4].s, { from: 0.6 });
      T(E, c, TC[((i % TC.length) + TC.length) % TC.length], VF[0] + VF[2] - 30, 590, { font: K.MONO, weight: 700, size: 120, color: COB, align: "right", s });
    }
    if (t >= W[5].s - E.LEAD) T(E, c, "SECONDS.", VF[0] + VF[2] - 30, 648, { ...mono, align: "right", size: 28 });
    // scrub timeline that can't settle
    const tp = t >= W[4].s - E.LEAD ? 0.3 + 0.05 * E.noise1(t * 9) + 0.025 * Math.sin(t * 31) : 0.08 + (t - s0) * 0.15;
    K.timeline(c, VF[0], 740, VF[2], { p: clamp(tp), light: true, thumbs: 10, h: 44 });
    c.save();
    for (let i = 0; i <= 10; i += 5) T(E, c, `${i}s`, VF[0] + (VF[2] * i) / 10, 820, { font: K.MONO, weight: 500, size: 20, color: PAL.text3 });
    c.restore();
  },
  theme: "light",
};

// 5 · Which second? (split flaps)
function flapTile(E, c, x, y, w, h, cur, prev, p) {
  const fo = { font: K.MONO, weight: 700, size: h * 0.78, color: WHITE };
  const half = (ch, top, sy = 1) => {
    c.save();
    c.beginPath();
    c.rect(x, top ? y : y + h / 2, w, h / 2);
    c.clip();
    c.translate(0, y + h / 2);
    c.scale(1, sy);
    c.translate(0, -(y + h / 2));
    c.fillStyle = top ? "#1b1b1f" : "#141417";
    K.rrect(c, x, y, w, h, 16);
    c.fill();
    T(E, c, ch, x + w / 2, y + h / 2 + h * 0.03, fo);
    c.restore();
  };
  half(cur, true);
  half(prev, false);
  if (p < 0.5) half(prev, true, 1 - p * 2);
  else half(cur, false, (p - 0.5) * 2);
  c.fillStyle = "rgba(0,0,0,0.6)";
  c.fillRect(x, y + h / 2 - 2, w, 4);
}
SH[5] = {
  back(X) {
    const { E, t, c, W } = X;
    K.fill(c, LIME);
    K.dotGrid(c, t, { color: "rgba(12,12,13,0.08)" });
    const o = { font: F, weight: 900, stretch: "125%", size: 100, tracking: -0.03 };
    const sz = Math.min(fitSize(E, c, "SECOND?", o, 820), 170);
    if (t >= W[0].s - E.LEAD) T(E, c, "WHICH", 1367, 250, { ...o, size: sz * 1.25, color: INK, s: E.popScale(t, W[0].s, { from: 0.5, k: 340, z: 0.4 }) });
    if (t >= W[1].s - E.LEAD) shadowT(E, c, "SECOND?", 1367, 840, { ...o, size: sz, color: COB, s: E.popScale(t, W[1].s, { from: 1.5, k: 340, z: 0.42 }) }, 9);
  },
  front(X) {
    const { E, t, c, P, W, o, s0 } = X;
    // board
    const x0 = 960,
      y0 = 410,
      tw = 170,
      th = 270,
      gap = 16;
    const fast = t >= W[1].s ? 0.055 : 0.09;
    const cells = ["0", "0", ":", "d", "d"];
    let x = x0;
    cells.forEach((ch, i) => {
      if (ch === ":") {
        T(E, c, ":", x + 35, y0 + th / 2, { font: K.MONO, weight: 700, size: 200, color: INK });
        x += 70 + gap;
        return;
      }
      if (ch === "0" || t < W[0].s - 0.02) {
        flapTile(E, c, x, y0, tw, th, "0", "0", 1);
      } else {
        const st = fast * (1 + 0.3 * i),
          lt = t - W[0].s;
        const n = Math.floor(lt / st),
          p = clamp((lt - n * st) / Math.min(0.06, st * 0.9));
        const d = (k) => String(Math.floor(E.hash1(k * 17.3 + i * 5.1) * (i === 3 ? 6 : 10)));
        flapTile(E, c, x, y0, tw, th, d(n), d(n - 1), p);
      }
      x += tw + gap;
    });
    T(E, c, "MIN", x0 + tw + gap / 2, y0 + th + 34, { font: K.MONO, weight: 600, size: 22, color: INK, tracking: 0.1 });
    T(E, c, "SEC ???", x0 + 3 * tw + 2 * gap + 70 + gap + gap / 2, y0 + th + 34, { font: K.MONO, weight: 600, size: 22, color: INK, tracking: 0.1 });
    // stopwatch sweep hand (tracked) + dashed lead to the board
    const [cx, cy] = P([0.352, 0.503]);
    const ang = t * 26 + 3 * E.noise1(t * 4);
    c.save();
    c.strokeStyle = PAL.rec;
    c.lineWidth = 5;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(cx - Math.cos(ang) * 14, cy - Math.sin(ang) * 14);
    c.lineTo(cx + Math.cos(ang) * 66 * o.zoom, cy + Math.sin(ang) * 66 * o.zoom);
    c.stroke();
    c.fillStyle = INK;
    c.beginPath();
    c.arc(cx, cy, 7, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.setLineDash([10, 10]);
    c.lineDashOffset = -t * 60;
    c.beginPath();
    c.moveTo(cx + 95, cy);
    c.quadraticCurveTo(cx + 260, cy + 40, x0 - 24, y0 + th / 2);
    c.stroke();
    c.restore();
    void s0;
  },
  theme: "light",
};

// 6 · No, the other thing.
SH[6] = {
  back(X) {
    const { E, t, c, W } = X;
    K.fill(c, COB);
    K.dotGrid(c, t, { color: "rgba(255,255,255,0.10)" });
    K.slam(c, "NO,", 330, 210, t, W[0].s, { font: F, weight: 900, stretch: "125%", size: 220, tracking: -0.03, color: LIME });
  },
  front(X) {
    const { E, t, c, P, W } = X;
    const pr = (s, d = 0.12) => E.ease.outCubic(clamp((t - s) / d));
    const lab = { font: F, weight: 900, stretch: "125%", tracking: -0.02, color: PURE };
    // THIS? -> her hand
    const [hx, hy] = P([0.345, 0.255]);
    const a1 = W[0].s + 0.06;
    if (t >= a1) {
      T(E, c, "THIS?", 260, 560, { ...lab, size: 90, s: E.popScale(t, a1, { from: 0.5 }) });
      arrow(c, 300, 510, hx - 20, hy + 30, pr(a1), { bend: -0.3 });
    }
    // THAT? -> her shoe
    const [sx, sy] = P([0.575, 0.92]);
    const a2 = W[0].s + 0.18;
    if (t >= a2) {
      T(E, c, "THAT?", 1470, 890, { ...lab, size: 90, s: E.popScale(t, a2, { from: 0.5 }) });
      arrow(c, 1380, 900, sx + 70, sy + 10, pr(a2), { bend: 0.25 });
    }
    // THE OTHER / THING. -> out of frame, at nothing
    if (t >= W[1].s - E.LEAD) T(E, c, "THE", 1850, 330, { ...lab, size: 80, align: "right", s: E.popScale(t, W[1].s, { from: 0.5 }) });
    if (t >= W[2].s - E.LEAD) T(E, c, "OTHER", 1850, 420, { ...lab, size: 80, align: "right", s: E.popScale(t, W[2].s, { from: 0.5 }) });
    if (t >= W[3].s - E.LEAD) {
      shadowT(E, c, "THING.", 1840, 530, { ...lab, size: 120, color: LIME, align: "right", s: E.popScale(t, W[3].s, { from: 1.6, k: 340 }) }, 8);
      arrow(c, 1700, 250, 1990, 70, pr(W[3].s, 0.1), { bend: -0.2, color: LIME, w: 9 });
    }
  },
  theme: "dark",
};

// 7 · Which thing? (mirrored ECU)
SH[7] = {
  back(X) {
    const { E, t, c, W } = X;
    K.fill(c, LIME);
    const o = { font: F, weight: 900, stretch: "62%", size: 100, tracking: -0.03, color: COB };
    const s1 = fitSize(E, c, "THING?", o, 700);
    K.slam(c, "WHICH", 400, 320, t, W[0].s, { ...o, size: s1, dir: 1, color: INK });
    K.slam(c, "THING?", 400, 720, t, W[1].s, { ...o, size: s1, dir: -1 });
  },
  front(X) {
    const { E, t, c, P, W } = X;
    // his mirrored screen shows a backwards "?": cover it with a correct one
    const [ax, ay] = P([0.4, 0.355]),
      [bx, by] = P([0.595, 0.69]);
    const x = Math.min(ax, bx),
      w = Math.abs(bx - ax),
      h = by - ay;
    c.save();
    c.fillStyle = "#040E1C";
    K.rrect(c, x, ay, w, h, 40);
    c.fill();
    c.restore();
    const s = E.popScale(t, W[0].s, { from: 0.7, k: 380 }) * (t >= W[1].s - E.LEAD ? E.popScale(t, W[1].s, { from: 1.25, k: 380 }) : 1);
    qPix(c, QAG, x + w / 2, ay + h / 2, h * 0.62 * s, 0);
  },
  theme: "light",
};

// 8 · Give it more energy.
SH[8] = {
  back(X) {
    const { E, t, c, W } = X;
    K.fill(c, COB);
    K.dotGrid(c, t, { color: "rgba(255,255,255,0.10)" });
    const lvl = stepSpring(E, t, [[0, 0.05], [W[0].s - E.LEAD, 0.3], [W[1].s - E.LEAD, 0.5], [W[2].s - E.LEAD, 0.72], [W[3].s - E.LEAD, 1.3]], 300, 0.4);
    const N = 14,
      segH = 46,
      gap = 6,
      top = 150;
    for (const mx of [90, 1730]) {
      c.save();
      c.fillStyle = "rgba(12,12,13,0.55)";
      K.rrect(c, mx - 10, top - 10, 120, N * (segH + gap) + 14, 14);
      c.fill();
      for (let i = 0; i < N; i++) {
        const lit = i / N < lvl;
        const y = top + (N - 1 - i) * (segH + gap);
        c.fillStyle = lit ? (i > 11 ? PURE : LIME) : "rgba(255,255,255,0.10)";
        c.fillRect(mx, y, 100, segH);
      }
      // overflow: top segments blow off
      if (t >= W[3].s - E.LEAD) {
        const dt = t - (W[3].s - E.LEAD);
        for (let j = 0; j < 4; j++) {
          const vx = (E.hash1(j * 3.1 + mx) - 0.5) * 500,
            vy = -900 - 400 * E.hash1(j * 7.7 + mx);
          const x = mx + vx * dt,
            y = top - (j + 1) * (segH + gap) + vy * dt + 1400 * dt * dt;
          c.save();
          c.translate(x + 50, y + segH / 2);
          c.rotate(dt * (E.hash1(j + mx) - 0.5) * 18);
          c.fillStyle = j % 2 ? PURE : LIME;
          c.fillRect(-50, -segH / 2, 100, segH);
          c.restore();
        }
      }
      c.restore();
      const pct = t >= W[3].s - E.LEAD ? (Math.floor(t * 8) % 2 ? "MAX" : "999%") : `${Math.round(clamp(lvl) * 100)}%`;
      T(E, c, pct, mx + 50, top + N * (segH + gap) + 40, { font: K.MONO, weight: 700, size: 34, color: PURE });
      T(E, c, "ENERGY", mx + 50, top - 40, { font: K.MONO, weight: 600, size: 20, color: WHITE, tracking: 0.12 });
    }
  },
  front(X) {
    const { E, t, c, P, W } = X;
    const hands = [P([0.31, 0.1]), P([0.69, 0.105])];
    const k = E.last("kicks", t);
    const over = t >= W[3].s - E.LEAD;
    if (k && k.t >= X.s0 - 0.01) {
      const a = Math.exp(-k.dt * 7);
      hands.forEach(([x, y], h) => {
        const base = h ? -0.5 : Math.PI + 0.5;
        const n = over ? 3 : 1;
        for (let j = 0; j < n; j++) bolt(E, c, x, y, base + (j - (n - 1) / 2) * 0.55 * (h ? 1 : -1), 220 + 80 * j, k.i * 3 + j + h * 11, a);
      });
    }
    const lab = { font: F, weight: 900, stretch: "125%", size: 110, tracking: -0.03, color: PURE };
    if (t >= W[0].s - E.LEAD) shadowT(E, c, "GIVE", 470, 400, { ...lab, s: E.popScale(t, W[0].s, { from: 0.5 }) }, 8);
    if (t >= W[1].s - E.LEAD) shadowT(E, c, "IT", 470, 510, { ...lab, s: E.popScale(t, W[1].s, { from: 0.5 }) }, 8);
    if (t >= W[2].s - E.LEAD) shadowT(E, c, "MORE", 1450, 400, { ...lab, s: E.popScale(t, W[2].s, { from: 0.5 }) }, 8);
    if (t >= W[3].s - E.LEAD) {
      const chars = [..."ENERGY"];
      const o = { font: F, weight: 900, stretch: "125%", size: 250, tracking: -0.03 };
      const tot = E.measure(c, "ENERGY", o);
      let x = 960 - tot / 2;
      chars.forEach((ch, i) => {
        const wch = E.measure(c, ch, o);
        const s = E.popScale(t, W[3].s + i * 0.025, { from: 0, k: 420, z: 0.35 });
        const jx = 9 * E.noise1(t * 30 + i * 9),
          jy = 9 * E.noise1(t * 30 + i * 9 + 50);
        shadowT(E, c, ch, x + wch / 2 + jx, 880 + jy, { ...o, color: LIME, s, rot: 0.05 * E.noise1(t * 20 + i) }, 12);
        x += wch;
      });
    }
  },
  post(E, t, W) {
    if (t >= W[3].s - E.LEAD) {
      const a = 0.0015 + 0.004 * Math.exp(-(t - W[3].s) * 3);
      E.post.shake = [a * E.noise1(t * 40), a * E.noise1(t * 40 + 9)];
    }
  },
  theme: "dark",
};

// 9 · Like Apple, but fun.
SH[9] = {
  back(X) {
    const { E, t, c } = X;
    K.fill(c, CREAM);
    c.save();
    c.fillStyle = "rgba(12,12,13,0.12)";
    c.fillRect(120, 380, 640, 1.5);
    c.restore();
  },
  front(X) {
    const { E, t, c, P, W, o } = X;
    const fun = t >= W[3].s - E.LEAD ? 1 : 0;
    const knock = fun ? E.spring(t - W[3].s, 200, 0.3) : 0;
    const thin = { font: F, weight: 150, size: 110, tracking: 0.01, color: INK, align: "left" };
    // minimal: slide in, no overshoot
    const sl = (s) => E.ease.outCubic(clamp((t - (s - E.LEAD)) / 0.25));
    c.save();
    c.translate(120, 300);
    c.rotate(-0.06 * knock);
    if (t >= W[0].s - E.LEAD) T(E, c, "Like", 0 - 20 * (1 - sl(W[0].s)), 0, { ...thin, alpha: sl(W[0].s) });
    const wl = E.measure(c, "Like ", thin);
    if (t >= W[1].s - E.LEAD) T(E, c, "Apple,", wl - 20 * (1 - sl(W[1].s)), 0, { ...thin, alpha: sl(W[1].s) });
    T(E, c, "FIG. 1 — FRUIT", 0, 120, { font: K.MONO, weight: 500, size: 22, color: PAL.text3, align: "left", tracking: 0.1, alpha: sl(W[1].s) });
    c.restore();
    // fig. 1 ring around the real apple + leader
    const [ax, ay] = P([0.598, 0.465]);
    if (t >= W[1].s - E.LEAD) {
      const p = E.ease.outCubic(clamp((t - W[1].s) / 0.3));
      c.save();
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(ax, ay, 112 * o.zoom, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      c.stroke();
      c.beginPath();
      c.moveTo(ax - 112 * o.zoom, ay);
      c.lineTo(lerp(ax - 112 * o.zoom, 760, p), lerp(ay, 380, p));
      c.stroke();
      c.restore();
    }
    // BUT FUN. bouncy chaos
    const cols = [COB, LIME, AGENT, LIME, COB, AGENT, LIME, COB];
    const big = { font: "Archivo Black", size: 250, tracking: -0.02, stroke: 10, strokeColor: INK };
    const lay = (txt, s0, y, base) => {
      let x = 120;
      [...txt].forEach((ch, i) => {
        const wch = E.measure(c, ch, big);
        if (ch !== " ") {
          const si = s0 + i * 0.03;
          const s = E.popScale(t, si, { from: 0, k: 300, z: 0.25 });
          const wob = Math.sin(t * 14 + i * 1.7) * (fun ? 0.12 : 0.06);
          const hop = -Math.abs(Math.sin(t * 9 + i)) * 26 * (t >= si ? 1 : 0);
          shadowT(E, c, ch, x + wch / 2, y + hop, { ...big, color: cols[(i + base) % cols.length], s, rot: wob }, 12);
        }
        x += wch;
      });
    };
    if (t >= W[2].s - E.LEAD) lay("BUT", W[2].s, 600, 0);
    if (t >= W[3].s - E.LEAD) lay("FUN.", W[3].s, 850, 3);
    // confetti out of the party hat
    const [hx, hy] = P([0.8, 0.03]);
    K.confetti(c, t, W[3].s, { x: hx, y: hy + 40, n: 70, spread: 1700, up: 700, seed: 11, life: 1.4 });
    K.confetti(c, t, W[2].s, { x: hx, y: hy, n: 24, spread: 500, up: 800, seed: 5, life: 0.9 });
  },
  theme: "light",
};

// 10 · Can we try it in blue?
SH[10] = {
  back(X) {
    const { E, t, c, P, W } = X;
    K.fill(c, CREAM);
    const [rx] = P([0.86, 0.43]);
    const [, ry0] = P([0.86, 0.35]),
      [, ry1] = P([0.86, 0.53]);
    const prog = stepSpring(E, t, [[0, 0], [W[0].s - E.LEAD, 0.3], [W[1].s - E.LEAD, 0.5], [W[2].s - E.LEAD, 0.68], [W[3].s - E.LEAD, 0.84], [W[4].s - E.LEAD, 1.05]], 200, 0.7);
    const left = rx - prog * (rx + 40);
    const flood = t >= W[5].s - E.LEAD ? E.ease.outCubic(clamp((t - (W[5].s - E.LEAD)) / 0.12)) : 0;
    const top = lerp(ry0, -20, flood),
      bot = lerp(ry1, 1100, flood);
    c.save();
    c.fillStyle = COB;
    const right = lerp(rx, 1940, flood);
    c.beginPath();
    c.moveTo(right, top);
    for (let y = top; y <= bot; y += 24) c.lineTo(left + 14 * Math.sin(y * 0.09 + t * 3), y);
    c.lineTo(right, bot);
    c.closePath();
    c.fill();
    // drips under the band
    if (flood < 1)
      for (let x = Math.ceil(left / 64) * 64; x < rx; x += 64) {
        const h = E.hash1(x * 0.37);
        const reach = (rx - x) / Math.max(1, rx - left);
        const len = (20 + 90 * h) * clamp((1 - reach) * 3);
        c.beginPath();
        c.moveTo(x - 9, bot - 2);
        c.lineTo(x - 9, bot + len);
        c.arc(x, bot + len, 9, Math.PI, 0, true);
        c.lineTo(x + 9, bot - 2);
        c.fill();
      }
    c.restore();
    E.drawKaraoke(c, E, W[0].line, t, {
      x: 110, y: 170, size: 74, font: F, weight: 900, stretch: "125%", tracking: -0.02, align: "left",
      litColor: flood > 0.5 ? PURE : INK, dimColor: "rgba(12,12,13,0.16)", lineLead: 0.6, upper: true,
    });
    if (t >= W[5].s - E.LEAD) shadowT(E, c, "BLUE?", 500, 660, { font: F, weight: 900, stretch: "125%", size: 270, tracking: -0.03, color: PURE, s: E.popScale(t, W[5].s, { from: 1.5, k: 340 }) }, 14);
    X.flood = flood;
  },
  theme: "light",
};

// 11 · Which blue? (swatches)
SH[11] = {
  back(X) {
    const { E, t, c, W } = X;
    K.fill(c, LIME);
    K.dotGrid(c, t, { color: "rgba(12,12,13,0.08)" });
    const o = { font: F, weight: 900, stretch: "125%", size: 200, tracking: -0.03, color: INK };
    // held note: the word stretches its tracking while it's sung
    const hold = clamp((t - W[0].s) / (W[0].e - W[0].s));
    if (t >= W[0].s - E.LEAD) T(E, c, "WHICH", 1250, 175, { ...o, size: 190, tracking: -0.03 + 0.12 * E.ease.outCubic(hold), s: E.popScale(t, W[0].s, { from: 0.5 }) });
  },
  front(X) {
    const { E, t, c, P, W } = X;
    const [fx, fy] = P([0.225, 0.4]);
    const Q = [1250, 1400],
      R = 880;
    for (let i = 0; i < 6; i++) {
      const ti = W[0].s + 0.05 + i * 0.2;
      if (t < ti) continue;
      const k = E.ease.outBack(clamp((t - ti) / 0.32)),
        m = E.ease.outCubic(clamp((t - ti) / 0.32));
      const a = -0.46 + i * 0.184 + (t >= W[1].s ? 0.06 * Math.sin((t - W[1].s) * 30 + i) * Math.exp(-(t - W[1].s) * 4) : 0);
      const tx = Q[0] + Math.sin(a) * R,
        ty = Q[1] - Math.cos(a) * R;
      const x = lerp(fx, tx, m),
        y = lerp(fy, ty, m) - Math.sin(m * Math.PI) * 120;
      c.save();
      c.translate(x, y);
      c.rotate(lerp(-1.0, a, k));
      c.scale(lerp(0.3, 1, k), lerp(0.3, 1, k));
      c.fillStyle = "rgba(0,0,0,0.3)";
      K.rrect(c, -110 + 10, -160 + 12, 220, 320, 18);
      c.fill();
      c.fillStyle = PURE;
      K.rrect(c, -110, -160, 220, 320, 18);
      c.fill();
      c.fillStyle = HEX[i];
      K.rrect(c, -98, -148, 196, 220, 10);
      c.fill();
      T(E, c, HEX[i], -6, 112, { font: K.MONO, weight: 700, size: 28, color: INK, rot: 0 });
      c.restore();
    }
    if (t >= W[1].s - E.LEAD) {
      const big = { font: "Archivo Black", size: 270, tracking: -0.02, stroke: 14, strokeColor: PURE };
      const tot = E.measure(c, "BLUE?", big);
      let x = 1250 - tot / 2;
      [..."BLUE?"].forEach((ch, i) => {
        const wch = E.measure(c, ch, big);
        shadowT(E, c, ch, x + wch / 2, 500, { ...big, color: HEX[[0, 2, 1, 3, 5][i]], s: E.popScale(t, W[1].s + i * 0.02, { from: 0, k: 380, z: 0.35 }), rot: (i - 2) * 0.03 }, 12);
        x += wch;
      });
    }
    // pixel ?s orbiting his dizzy head
    const [hx, hy] = P([0.175, 0.24]);
    for (let j = 0; j < 3; j++) {
      const a = t * 4 + (j * Math.PI * 2) / 3;
      qPix(c, j % 2 ? QINK : QCOB, hx + Math.cos(a) * 210, hy - 150 + Math.sin(a) * 50, 54, 0);
    }
  },
  theme: "light",
};

// 12 · I'll know it when I see it (the calm line)
SH[12] = {
  back(X) {
    const { E, t, c, P, o } = X;
    K.fill(c, CREAM);
    const tr = X.v.trackAt(K.boil(t));
    const [hx, hy] = P(tr?.top ?? [0.275, 0.04]);
    c.save();
    c.strokeStyle = COB;
    c.lineWidth = 3;
    c.setLineDash([14, 12]);
    c.lineDashOffset = -t * 30;
    c.beginPath();
    c.ellipse(hx, hy + 30, 150 * o.zoom, 34 * o.zoom, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  },
  front(X) {
    const { E, t, c, W, s0 } = X;
    const so = { font: "Instrument Serif", weight: 400, italic: true, size: 180, color: INK, align: "left", tracking: -0.01 };
    const drift = (t - s0) * 6;
    const rows = [[0, 1, 2], [3, 4, 5, 6]];
    const txt = ["i'll", "know", "it", "when", "i", "see", "it"];
    let lastX = 0;
    rows.forEach((r, ri) => {
      let x = 960 - drift;
      const y = 420 + ri * 200;
      r.forEach((wi) => {
        const w = W[wi];
        const a = E.ease.outCubic(clamp((t - (w.s - E.LEAD)) / 0.35));
        if (a > 0) T(E, c, txt[wi], x, y + 16 * (1 - a), { ...so, alpha: a });
        x += E.measure(c, txt[wi] + " ", so);
        if (wi === 6) lastX = x - E.measure(c, " ", so);
      });
    });
    // hairline + quiet tag
    const p = E.ease.outCubic(clamp((t - W[1].s) / 0.6));
    c.save();
    c.fillStyle = INK;
    c.globalAlpha = 0.5;
    c.fillRect(960 - drift, 740, 760 * p, 1.5);
    c.restore();
    T(E, c, K.typeOn("NOTE 08 · VAGUE · NO TIMESTAMP", t, W[2].s, 30), 960 - drift, 782, { font: K.MONO, weight: 500, size: 24, color: PAL.text3, align: "left", tracking: 0.08 });
    // land: cobalt full stop on 30.86, just before the cut to 31.00
    const st = W[6].e;
    if (t >= st - E.LEAD) {
      c.save();
      c.fillStyle = COB;
      c.beginPath();
      c.arc(lastX + 26, 620 + 40, Math.max(0, 18 * E.popScale(t, st, { from: 0, k: 420, z: 0.35 })), 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  },
  post(E, t, W) {
    if (t >= W[6].e - 0.02) E.post.punch = 0.03 * E.spring(t - (W[6].e - 0.02), 500, 0.6);
  },
  theme: "light",
  calm: true,
};

function shotAt(t) {
  let i = 0;
  while (i + 1 < CUT.length && t >= CUT[i + 1]) i++;
  return i;
}

export default {
  async load(E) {
    for (const n of new Set(STILLS)) V[n] = await E.loadVideo(n);
    g = E.makeG2D(E.W, E.H);
    g2 = E.makeG2D(E.W, E.H);
    const byLine = new Map();
    for (const w of E.words) if (w.section === "verse1") {
      if (!byLine.has(w.li)) byLine.set(w.li, []);
      byLine.get(w.li).push(w);
    }
    L = [...byLine.keys()].sort((a, b) => a - b).map((k) => byLine.get(k));
    CUT = L.map((ws, i) => (i === 0 ? 7.78 : ws[0].s - 0.033));
    QCOB = qCanvas(COB);
    QINK = qCanvas(INK);
    QAG = qCanvas(AGENT);
  },
  async prepare(E, t) {
    await V[STILLS[shotAt(t)]].frame(K.boil(t));
  },
  render(E, t, rt) {
    const S = E.SCALE;
    E.renderer.setRenderTarget(rt);
    const i = shotAt(t),
      sh = SH[i],
      v = V[STILLS[i]],
      W = L[i],
      s0 = CUT[i];
    const o = pup(E, v, t, { ...PLACE[i], enter: s0 });
    const P = (uv) => {
      const p = E.plateToScreen(E, v, uv, o);
      return [p[0] / S, p[1] / S];
    };
    const X = { E, t, o, P, W, s0, v };
    g.clear();
    X.c = g.ctx;
    X.c.setTransform(S, 0, 0, S, 0, 0);
    sh.back(X);
    g.commit();
    E.blitG2D(E, g, 1);
    if (o.zoom > 0.001) E.drawPlate(E, v, o);
    if (sh.front) {
      g2.clear();
      X.c = g2.ctx;
      X.c.setTransform(S, 0, 0, S, 0, 0);
      sh.front(X);
      g2.commit();
      E.blitG2D(E, g2, 1);
    }
    E.post.punch = sh.calm ? 0 : (FIELD[i] === CREAM ? 0.018 : 0.028) * E.pulse("kicks", t, 0.09);
    if (sh.post) sh.post(E, t, W);
    E.hud.sub = false;
    E.hud.theme = (i === 10 && X.flood > 0.5) ? "dark" : i === 2 && X.big ? "light" : sh.theme;
  },
};
