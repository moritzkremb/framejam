// Project kit (cut-out characters, line boil, windows, UI pieces, type moves). Scenes import it as `K`; only the lead edits it.
// The UI pieces (pin, comment card, timeline, button, status pill, call tiles) follow a review-app look and use PAL roles,
// so retheme through PAL. Full reference: KIT_API.md.
//
// COORDINATES: every 2D helper draws in 1080p units (1920 x 1080). Before calling them, put the canvas in that space:
//   c.setTransform(E.SCALE, 0, 0, E.SCALE, 0, 0)
// Plate helpers take 1080p units too and handle E.SCALE themselves.
import { PAL, clamp, lerp, spring, ease, hash1, noise1, rng } from "./core.js";
import { drawText, measure, popScale, LEAD } from "./typekit.js";

export const W = 1920,
  H = 1080;
export const FONT = "Geist",
  MONO = "Geist Mono";

// ---------- stills (assets/video/sNN_*): 3 line-boil frames at 8 fps, looped. Call in prepare(): await v.frame(boil(t))
export const boil = (t, fps = 8, n = 3) => (Math.floor(t * fps + 1e-6) % n) / fps + 0.5 / fps;
export async function loadAll(E, names) {
  const o = {};
  for (const n of names) o[n] = await E.loadVideo(n);
  return o;
}

// Rect (1080 units) that shows a 16:9 still/plate with a cover crop. Returns { rect, crop } for E.drawPlate.
// focus = [u,v] image point to keep centred when cropping (default centre). zoom > 1 crops tighter.
export function coverIn(v, rect, { focus = [0.5, 0.5], zoom = 1 } = {}) {
  const [, , w, h] = rect;
  const va = v.meta.w / v.meta.h,
    ra = w / h;
  let cw = 1,
    ch = 1;
  if (ra > va) ch = va / ra;
  else cw = ra / va;
  cw /= zoom;
  ch /= zoom;
  const cx = clamp(focus[0] - cw / 2, 0, 1 - cw),
    cy = clamp(focus[1] - ch / 2, 0, 1 - ch);
  return { rect, crop: [cx, cy, cw, ch] };
}
// image UV -> 1080 units for a plate drawn with coverIn() opts
export function uvToRect(o, p) {
  const [x, y, w, h] = o.rect,
    [cx, cy, cw, ch] = o.crop ?? [0, 0, 1, 1];
  return [x + ((p[0] - cx) / cw) * w, y + ((p[1] - cy) / ch) * h];
}

// Cut-out character ("puppet"): the matte subject placed anywhere, alive on the beat.
//   o.x, o.y   centre offset in 1080 units from screen centre (like drawPlate)
//   o.zoom     scale (1 = still fills the frame as generated)
//   o.bob      px of hop on each beat (default 10), o.sway rad of rotation sway (default 0.012)
//   o.enter    time the puppet springs in (scale from 0.82 with overshoot), o.exit time it snaps out
//   o.place = { cx, bottom, h } (1080 units): fit the subject's matte box so its centre x = cx, its bottom = bottom and
//             its height = h. Easier than x/y/zoom. o.place.cy instead of bottom centres it vertically.
//   o.mirror, o.rot, o.full (draw the full plate, not the matte)
export function placeOpts(v, p, mirror = false) {
  const b = v.track?.[0]?.box ?? [0, 0, 1, 1];
  const bh = (b[3] - b[1]) * H; // box height when the still fills the frame (zoom 1)
  const zoom = p.h / bh;
  const u = mirror ? 1 - (b[0] + b[2]) / 2 : (b[0] + b[2]) / 2;
  const bx = (u - 0.5) * W * zoom,
    by0 = (b[1] - 0.5) * H * zoom,
    by1 = (b[3] - 0.5) * H * zoom;
  const x = p.cx - W / 2 - bx;
  const y = p.cy != null ? p.cy - H / 2 - (by0 + by1) / 2 : p.bottom - H / 2 - by1;
  return { x, y, zoom };
}
export function puppet(E, v, t, o = {}) {
  if (o.place) o = { ...o, ...placeOpts(v, o.place, o.mirror) };
  const b = E.beat(t);
  const hop = Math.sin(Math.PI * clamp(b.phase * 1.25)) * (o.bob ?? 10) * (b.inBar % 2 ? 0.6 : 1);
  const z0 = o.zoom ?? 1;
  let z = z0;
  if (o.enter != null) z *= o.enter <= t ? popScale(t, o.enter, { from: 0.82, k: 320, z: 0.42 }) : 0;
  if (o.exit != null && t >= o.exit) z *= Math.max(0, 1 - (t - o.exit) / 0.08);
  z *= 1 + 0.018 * E.pulse("kicks", t, 0.1);
  // scale about the subject's feet (matte box bottom centre), not the plate centre
  const bx = v.track?.[0]?.box ?? [0, 0, 1, 1];
  const pu = o.mirror ? 1 - (bx[0] + bx[2]) / 2 : (bx[0] + bx[2]) / 2;
  const px = (o.x ?? 0) + (pu - 0.5) * W * (z0 - z),
    py = (o.y ?? 0) + (bx[3] - 0.5) * H * (z0 - z);
  const rot = (o.rot ?? 0) + Math.sin(t * Math.PI * 2 * (E.bpm / 60 / 2) + (o.phase ?? 0)) * (o.sway ?? 0.012);
  const opts = { x: px, y: py - hop, zoom: z, rot, mirror: o.mirror, matte: !o.full, feather: o.feather ?? 0.08, opacity: o.opacity ?? 1 };
  if (z > 0.001) E.drawPlate(E, v, opts);
  return opts;
}

// ---------- 2D primitives (1080 units)
export function rrect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
export function fill(c, color, a = 1) {
  c.save();
  c.globalAlpha = a;
  c.fillStyle = color;
  c.fillRect(0, 0, W, H);
  c.restore();
}
// mask a plate's square corners with the background colour so the tile reads rounded
export function roundCorners(c, [x, y, w, h], r, bg) {
  c.save();
  c.fillStyle = bg;
  for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + sx * r, py);
    c.arcTo(px, py, px, py + sy * r, r);
    c.closePath();
    c.fill();
  }
  c.restore();
}
// dot grid background (dark look), drifting slowly
export function dotGrid(c, t, { color = "rgba(255,255,255,0.07)", step = 48, r = 1.6, drift = 8 } = {}) {
  c.save();
  c.fillStyle = color;
  const ox = (t * drift) % step;
  for (let y = step / 2; y < H; y += step) for (let x = -step + ox; x < W + step; x += step) c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
}

// Pin: accent numbered disc with a stem point (sent pins turn agent-blue)
export function pin(c, x, y, n, { s = 1, sent = false, alpha = 1 } = {}) {
  if (s <= 0.001) return;
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.scale(s, s);
  const col = sent ? PAL.agent : PAL.accent;
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.beginPath();
  c.arc(3, -27, 22, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(-10, -14);
  c.arc(0, -30, 20, Math.PI * 0.72, Math.PI * 0.28);
  c.closePath();
  c.fill();
  c.strokeStyle = PAL.ink;
  c.lineWidth = 3;
  c.stroke();
  drawText(c, String(n), 0, -29, { font: FONT, weight: 800, size: 22, color: PAL.onAccent });
  c.restore();
}

// Mouse pointer
export function cursor(c, x, y, { s = 1, press = 0 } = {}) {
  c.save();
  c.translate(x, y);
  c.scale(s * (1 - 0.12 * press), s * (1 - 0.12 * press));
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, 34);
  c.lineTo(9, 26);
  c.lineTo(15, 40);
  c.lineTo(21, 37);
  c.lineTo(15, 24);
  c.lineTo(26, 24);
  c.closePath();
  c.fillStyle = PAL.white;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = PAL.ink;
  c.stroke();
  if (press > 0) {
    c.globalAlpha = press;
    c.strokeStyle = PAL.accent;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, 0, 18 + 30 * (1 - press), 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

// Comment card (review-app style). typed = 0..1 portion of text shown (with a block cursor while typing).
export function commentCard(c, x, y, w, { n = 1, time = "0:03.1", text = "", typed = 1, sent = false, s = 1, alpha = 1, light = false } = {}) {
  if (s <= 0.001 || alpha <= 0.001) return 0;
  const h = 92;
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.scale(s, s);
  rrect(c, 0, 0, w, h, 16);
  c.fillStyle = light ? PAL.pure : PAL.surface;
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
  c.stroke();
  const col = sent ? PAL.agent : PAL.accent;
  c.fillStyle = col;
  c.beginPath();
  c.arc(34, 30, 14, 0, Math.PI * 2);
  c.fill();
  drawText(c, String(n), 34, 30, { font: FONT, weight: 800, size: 17, color: PAL.onAccent });
  drawText(c, time, 60, 30, { font: MONO, weight: 500, size: 18, color: light ? "#6b6b73" : PAL.text3, align: "left" });
  if (sent) drawText(c, "Sent", w - 22, 30, { font: FONT, weight: 600, size: 16, color: PAL.agent, align: "right" });
  const shown = text.slice(0, Math.round(text.length * clamp(typed)));
  drawText(c, shown, 24, 66, { font: FONT, weight: 500, size: 25, color: light ? PAL.ink : PAL.white, align: "left" });
  if (typed > 0 && typed < 1) {
    const tw = measure(c, shown, { font: FONT, weight: 500, size: 25 });
    c.fillStyle = PAL.accent;
    c.fillRect(26 + tw, 52, 3, 28);
  }
  c.restore();
  return h * s;
}

// Timeline strip: track, ticks, optional range and playhead. p = playhead 0..1, range = [a,b] 0..1 (drawn up to rangeP)
export function timeline(c, x, y, w, { p = 0, range = null, rangeP = 1, pins = [], h = 56, light = false, thumbs = null } = {}) {
  c.save();
  rrect(c, x, y, w, h, 10);
  c.fillStyle = light ? "#e7e7e4" : PAL.surface2;
  c.fill();
  c.save();
  rrect(c, x, y, w, h, 10);
  c.clip();
  if (thumbs) for (let i = 0; i < thumbs; i++) {
    c.fillStyle = i % 2 ? (light ? "#dcdcd8" : "#232327") : (light ? "#d2d2ce" : "#2a2a2f");
    c.fillRect(x + (i * w) / thumbs + 2, y + 6, w / thumbs - 4, h - 12);
  }
  c.restore();
  c.fillStyle = light ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.18)";
  for (let i = 0; i <= 40; i++) c.fillRect(x + (i * w) / 40, y + h + 6, 2, i % 5 ? 6 : 12);
  if (range) {
    const a = range[0],
      b = lerp(range[0], range[1], clamp(rangeP));
    c.fillStyle = "rgba(212,255,58,0.28)";
    c.fillRect(x + a * w, y, (b - a) * w, h);
    c.fillStyle = PAL.accent;
    c.fillRect(x + a * w - 2, y - 6, 5, h + 12);
    c.fillRect(x + b * w - 2, y - 6, 5, h + 12);
  }
  for (const q of pins) pin(c, x + q.at * w, y - 4, q.n, { s: q.s ?? 0.8, sent: q.sent });
  c.fillStyle = PAL.white;
  c.fillRect(x + p * w - 2, y - 14, 4, h + 28);
  c.beginPath();
  c.arc(x + p * w, y - 14, 8, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// Pill button ("Finish review · 3"). press = 0..1 squash
export function button(c, x, y, label, { primary = true, s = 1, press = 0, size = 30, alpha = 1 } = {}) {
  if (s <= 0.001) return;
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.scale(s * (1 - 0.06 * press), s * (1 - 0.1 * press));
  const tw = measure(c, label, { font: FONT, weight: 700, size });
  const w = tw + size * 1.6,
    h = size * 2;
  rrect(c, -w / 2, -h / 2, w, h, h / 2);
  c.fillStyle = primary ? PAL.accent : PAL.surface2;
  c.fill();
  drawText(c, label, 0, 1, { font: FONT, weight: 700, size, color: primary ? PAL.onAccent : PAL.white });
  c.restore();
}

// status pill ("Agent listening"), blue dot breathing
export function statusPill(c, x, y, label, t, { s = 1, color = PAL.agent, alpha = 1, align = "center" } = {}) {
  if (s <= 0.001) return;
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.scale(s, s);
  const tw = measure(c, label, { font: FONT, weight: 600, size: 24 });
  const w = tw + 74,
    h = 52,
    x0 = align === "left" ? 0 : -w / 2;
  rrect(c, x0, -h / 2, w, h, h / 2);
  c.fillStyle = "rgba(124,196,255,0.14)";
  c.fill();
  c.fillStyle = color;
  c.globalAlpha = alpha * (0.6 + 0.4 * Math.sin(t * 6));
  c.beginPath();
  c.arc(x0 + 30, 0, 8, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = alpha;
  drawText(c, label, x0 + 50, 1, { font: FONT, weight: 600, size: 24, color, align: "left" });
  c.restore();
}

// sticker: white-bordered rotated label with a hard drop shadow
export function sticker(c, text, x, y, { rot = -0.06, size = 54, bg = PAL.accent, fg = PAL.ink, font = FONT, weight = 800, s = 1, pad = 0.42 } = {}) {
  if (s <= 0.001) return;
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  const tw = measure(c, text, { font, weight, size });
  const w = tw + size * pad * 2,
    h = size * 1.5;
  rrect(c, -w / 2 + 8, -h / 2 + 10, w, h, 14);
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.fill();
  rrect(c, -w / 2, -h / 2, w, h, 14);
  c.fillStyle = bg;
  c.fill();
  c.lineWidth = 7;
  c.strokeStyle = PAL.pure;
  c.stroke();
  drawText(c, text, 0, 2, { font, weight, size, color: fg });
  c.restore();
}

// Smear slam: word hits from scale 1.6 with 3 trailing ghosts (motion_library #1). o = drawText options + dir (-1|1)
export function slam(c, text, x, y, t, s, o = {}) {
  const dt = t - (s - LEAD);
  if (dt < 0) return;
  const k = ease.outExpo(clamp(dt / 0.14));
  const sc = lerp(1.6, 1, k) * (o.s ?? 1);
  const dir = o.dir ?? -1;
  for (let g = 3; g >= 1; g--) {
    const ga = [0, 0.35, 0.2, 0.1][g] * (1 - clamp(dt / 0.1));
    if (ga > 0.01) drawText(c, text, x + dir * g * 0.06 * W * (1 - k), y, { ...o, s: sc, alpha: ga * (o.alpha ?? 1) });
  }
  drawText(c, text, x, y, { ...o, s: sc });
}

// typed substring at a chars-per-second rate starting t0
export const typeOn = (text, t, t0, cps = 28) => text.slice(0, clamp(Math.floor((t - t0) * cps), 0, text.length));

// closed-form confetti burst (no state). colors cycle through the brand set
export function confetti(c, t, t0, { n = 70, x = W / 2, y = H * 0.55, spread = 900, up = 1100, seed = 7, colors = [PAL.accent, PAL.agent, PAL.white, PAL.cobalt], life = 1.6 } = {}) {
  const dt = t - t0;
  if (dt < 0 || dt > life) return;
  const r = rng(seed);
  c.save();
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.2,
      v = up * (0.45 + r() * 0.75);
    const drag = 1 - Math.exp(-dt * 2.2);
    const px = x + Math.cos(a) * v * drag / 2.2 * (spread / 900),
      py = y + Math.sin(a) * v * drag / 2.2 + 520 * dt * dt;
    c.globalAlpha = 1 - clamp((dt - life * 0.6) / (life * 0.4));
    c.fillStyle = colors[i % colors.length];
    c.save();
    c.translate(px, py);
    c.rotate(dt * (r() - 0.5) * 14);
    c.fillRect(-9, -5, 18, 10);
    c.restore();
  }
  c.restore();
}

// Video-call tile overlay: name tag and active-speaker ring (draw AFTER the plate). rect in 1080 units.
export function tileChrome(c, [x, y, w, h], { label = "You", speaking = 0, muted = false, color = PAL.accent, bg = PAL.ink, r = 18 } = {}) {
  roundCorners(c, [x, y, w, h], r, bg);
  c.save();
  if (speaking > 0.01) {
    c.globalAlpha = speaking;
    rrect(c, x - 3, y - 3, w + 6, h + 6, r + 3);
    c.lineWidth = 6;
    c.strokeStyle = color;
    c.stroke();
    c.globalAlpha = 1;
  }
  const tw = measure(c, label, { font: FONT, weight: 600, size: 24 });
  rrect(c, x + 18, y + h - 62, tw + 70, 44, 10);
  c.fillStyle = "rgba(12,12,13,0.72)";
  c.fill();
  c.fillStyle = muted ? PAL.rec : color;
  c.beginPath();
  c.arc(x + 42, y + h - 40, 8, 0, Math.PI * 2);
  c.fill();
  drawText(c, label, x + 60, y + h - 39, { font: FONT, weight: 600, size: 24, color: PAL.white, align: "left" });
  c.restore();
}
// Call control bar (mic, cam, share, more, leave), bottom centre
export function callBar(c, t, { y = 985, alpha = 1, s = 1 } = {}) {
  c.save();
  c.globalAlpha = alpha;
  c.translate(W / 2, y);
  c.scale(s, s);
  rrect(c, -230, -40, 460, 80, 40);
  c.fillStyle = PAL.surface;
  c.fill();
  const xs = [-170, -85, 0, 85, 170];
  xs.forEach((bx, i) => {
    c.beginPath();
    c.arc(bx, 0, 28, 0, Math.PI * 2);
    c.fillStyle = i === 4 ? PAL.rec : PAL.surface3;
    c.fill();
  });
  c.strokeStyle = PAL.white;
  c.fillStyle = PAL.white;
  c.lineWidth = 3;
  rrect(c, -177, -14, 14, 22, 7); // mic
  c.fill();
  c.fillRect(-171, 8, 2, 8);
  rrect(c, -100, -10, 22, 20, 4); // cam
  c.fill();
  c.beginPath();
  c.moveTo(-78, -6);
  c.lineTo(-68, -12);
  c.lineTo(-68, 12);
  c.lineTo(-78, 6);
  c.fill();
  c.strokeRect(-14, -11, 28, 22); // share
  for (const d of [-10, 0, 10]) c.fillRect(85 + d - 2, -2, 4, 4); // more
  c.lineWidth = 6; // leave
  c.beginPath();
  c.arc(170, 8, 14, Math.PI * 1.15, Math.PI * 1.85);
  c.stroke();
  c.restore();
}

// Images for 2D drawing (official brand files in assets/brand, thumbnails...). Load once in load(): const img = await K.loadImage('/assets/brand/logo.png')
export function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}
