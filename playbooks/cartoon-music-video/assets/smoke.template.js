// SMOKE TEST + working example of the kit: field -> giant type behind the subject -> K.puppet cut-out -> tracked sticker
// and UI. Set STILL to a prepped still (assets/video/<name>) and WORD to a sung word, add a timeline entry
//   { id: "_smoke", start: <a>, end: <b>, z: 1, variant: "smoke" }
// and render: node tools/still.mjs --only _smoke,hud --t <word time + 0.03> --scale 0.5 --dir out/smoke
// Scene agents copy patterns from here, not the file.
import { PAL } from "../core.js";
import * as K from "../lib.js";

const STILL = "s03_subject_full"; // a prepped still with a full-body character
const WORD = "pop"; // a sung word (prefix match) inside the smoke window
let v, g;
const OPT = { place: { cx: 1450, bottom: 1060, h: 980 } }; // full body, right third, feet near the bottom edge

export default {
  async load(E) {
    v = await E.loadVideo(STILL);
    g = E.makeG2D(E.W, E.H);
  },
  async prepare(E, t) {
    await v.frame(K.boil(t));
  },
  render(E, t, rt, layer) {
    const S = E.SCALE,
      c = g.ctx;
    E.renderer.setRenderTarget(rt);
    const w = E.words.find((x) => x.s >= layer.start && x.w.toLowerCase().startsWith(WORD)) ?? { s: layer.start + 1, e: layer.start + 2 };
    // BACK + MID: flat field and the hero word behind the subject
    g.clear();
    c.setTransform(S, 0, 0, S, 0, 0);
    K.fill(c, PAL.cobalt);
    K.dotGrid(c, t, { color: "rgba(255,255,255,0.10)" });
    E.drawText(c, WORD.toUpperCase() + ".", 760, 560, {
      font: "Archivo", weight: 900, stretch: "125%", size: 520, tracking: -0.03, color: PAL.accent,
      s: E.popScale(t, w.s, { from: 1.5, k: 300, z: 0.45 }), alpha: E.wordAlpha(t, w.s, 1e9),
    });
    g.commit();
    E.blitG2D(E, g, 1);
    // SUBJECT: the cut-out, alive on the beat
    const o = K.puppet(E, v, t, { ...OPT, enter: w.s - 0.25 });
    // FRONT: sticker tracked to the top of the matte, a pin, a typing comment card
    const tr = v.trackAt(K.boil(t));
    g.clear();
    c.setTransform(S, 0, 0, S, 0, 0);
    if (tr?.top) {
      const [x, y] = E.plateToScreen(E, v, tr.top, o).map((n) => n / S);
      K.sticker(c, WORD.toUpperCase(), Math.min(x, 1700), Math.max(y - 70, 90), { size: 40, s: E.popScale(t, w.s) });
    }
    K.pin(c, 1060, 330, 1, { s: E.popScale(t, w.s + 0.5, { from: 0 }) });
    K.commentCard(c, 120, 820, 560, { n: 1, time: "0:03.1", text: "Make it " + WORD + ".", typed: (t - w.s) / 0.7 });
    g.commit();
    E.blitG2D(E, g, 1);
    E.post.punch = 0.025 * E.pulse("kicks", t, 0.09);
    E.hud.theme = "dark";
  },
};
